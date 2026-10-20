const express = require('express');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const rateLimit = require('express-rate-limit');
const path = require('path');

const required = ['DATABASE_URL','JWT_SECRET'];
for (const key of required) if (!process.env[key]) {
  console.error(`Missing required environment variable: ${key}`);
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET must be at least 32 characters.');
  process.exit(1);
}
const pool = new Pool({
 connectionString: process.env.DATABASE_URL,
 ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false }
});
const app = express();
app.set('trust proxy', 1);
app.use(helmet({contentSecurityPolicy:false}));
app.use(express.json({limit:'100kb'}));
app.use('/api/auth', rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:true,legacyHeaders:false}));
app.use(express.static(path.join(__dirname,'public')));

async function init(){
 await pool.query(`
 CREATE TABLE IF NOT EXISTS users(
  id BIGSERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  role VARCHAR(16) NOT NULL DEFAULT 'student' CHECK(role IN ('student','admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 );
 CREATE TABLE IF NOT EXISTS workspace(
  id INTEGER PRIMARY KEY CHECK(id=1), data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_by BIGINT REFERENCES users(id)
 );
 INSERT INTO workspace(id,data) VALUES(1,'{}'::jsonb) ON CONFLICT(id) DO NOTHING;
 `);
 if(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD){
  const email=process.env.ADMIN_EMAIL.toLowerCase().trim();
  const pass=process.env.ADMIN_PASSWORD;
  if(pass.length>=12){
   const hash=await bcrypt.hash(pass,12);
   await pool.query(`INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,'admin')
    ON CONFLICT(email) DO UPDATE SET role='admin'`,[process.env.ADMIN_NAME||'CampusOS Admin',email,hash]);
  } else console.warn('ADMIN_PASSWORD must be at least 12 characters; initial admin was not created/updated.');
 }
}
function safeUser(row){return {id:row.id,name:row.name,email:row.email,role:row.role}}
function sign(row){return jwt.sign({sub:String(row.id)},process.env.JWT_SECRET,{expiresIn:'7d',issuer:'campusos'})}
async function auth(req,res,next){
 try{
  const h=req.headers.authorization||'';
  if(!h.startsWith('Bearer '))return res.status(401).json({error:'Please sign in.'});
  const claims=jwt.verify(h.slice(7),process.env.JWT_SECRET,{issuer:'campusos'});
  const result=await pool.query('SELECT id,name,email,role FROM users WHERE id=$1',[claims.sub]);
  if(!result.rowCount)return res.status(401).json({error:'Account not found.'});
  req.user=result.rows[0];next();
 }catch{return res.status(401).json({error:'Session expired. Please sign in again.'})}
}
function admin(req,res,next){if(req.user.role!=='admin')return res.status(403).json({error:'Admin permission required.'});next()}
app.get('/api/health',async(req,res)=>{try{await pool.query('SELECT 1');res.json({ok:true,service:'CampusOS API',database:'connected'})}catch{res.status(503).json({ok:false,service:'CampusOS API',database:'unavailable'})}});
app.post('/api/auth/register',async(req,res)=>{
 const name=String(req.body.name||'').trim(),email=String(req.body.email||'').trim().toLowerCase(),password=String(req.body.password||'');
 if(name.length<2||name.length>100)return res.status(400).json({error:'Enter your full name (2–100 characters).'});
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return res.status(400).json({error:'Enter a valid email address.'});
 if(password.length<8||password.length>128)return res.status(400).json({error:'Password must be 8–128 characters.'});
 try{const hash=await bcrypt.hash(password,12);const result=await pool.query("INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,'student') RETURNING id,name,email,role",[name,email,hash]);const user=result.rows[0];res.status(201).json({token:sign(user),user:safeUser(user)})}
 catch(e){if(e.code==='23505')return res.status(409).json({error:'An account with that email already exists.'});console.error(e);res.status(500).json({error:'Could not create account.'})}
});
app.post('/api/auth/login',async(req,res)=>{
 const email=String(req.body.email||'').trim().toLowerCase(),password=String(req.body.password||'');
 try{const result=await pool.query('SELECT id,name,email,password_hash,role FROM users WHERE email=$1',[email]);const row=result.rows[0];if(!row||!(await bcrypt.compare(password,row.password_hash)))return res.status(401).json({error:'Email or password is incorrect.'});res.json({token:sign(row),user:safeUser(row)})}
 catch(e){console.error(e);res.status(500).json({error:'Could not sign in.'})}
});
app.get('/api/auth/me',auth,(req,res)=>res.json({user:safeUser(req.user)}));
app.get('/api/workspace',auth,async(req,res)=>{try{const r=await pool.query('SELECT data,updated_at FROM workspace WHERE id=1');res.json({data:r.rows[0].data,updatedAt:r.rows[0].updated_at})}catch(e){console.error(e);res.status(500).json({error:'Could not load shared workspace.'})}});
app.put('/api/workspace',auth,admin,async(req,res)=>{
 const data=req.body.data;
 if(!data||typeof data!=='object'||Array.isArray(data))return res.status(400).json({error:'Workspace data must be a JSON object.'});
 if(Buffer.byteLength(JSON.stringify(data),'utf8')>2*1024*1024)return res.status(413).json({error:'Workspace data exceeds 2 MB.'});
 try{const r=await pool.query('UPDATE workspace SET data=$1::jsonb,updated_at=NOW(),updated_by=$2 WHERE id=1 RETURNING updated_at',[JSON.stringify(data),req.user.id]);res.json({ok:true,updatedAt:r.rows[0].updated_at})}
 catch(e){console.error(e);res.status(500).json({error:'Could not save shared workspace.'})}
});
app.use((err,req,res,next)=>{console.error(err);res.status(400).json({error:'Invalid request.'})});
const port=Number(process.env.PORT||3000);
init().then(()=>app.listen(port,()=>console.log(`CampusOS listening on port ${port}`))).catch(e=>{console.error('Database initialization failed:',e.message);process.exit(1)});
