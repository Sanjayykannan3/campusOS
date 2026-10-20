# CampusOS Academic Calendar Update

This update adds a monthly academic calendar to the existing CampusOS shared-portal starter and replaces the generic sample exam list with the supplied 2026 exam timetable entries and planner milestones.

## Included
- Monthly calendar with month navigation, Today button, selectable dates, event details, and color categories for exams, holidays, yellow events/working Saturdays, and postponed exams.
- Exam subjects/details shown on calendar dates.
- Admin exam/event editor includes status (`scheduled`, `postponed`, `pending`) and optional rescheduled date. Editing a schedule/status adds a notice in the local workspace.
- Software Testing (PE-I) is marked postponed with no new date; CIA-II Retest is pending, with no invented date.
- Supplied exam rows included for 14, 15, 16, 21, 22, 23, and 24 October 2026.
- Model practical, semester practical, semester-end exam and reopening milestones are present as planner records, with status/details indicating items requiring admin confirmation.
- Official weekly timetable subject names and period timings from the supplied image are entered, with labs displayed as combined Batch 1 / Batch 2 names where identifiable.

## Run locally
Requires Node.js 20+ and PostgreSQL.
1. Run `npm.cmd install` in PowerShell.
2. Set `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (12+ characters), and `ADMIN_NAME` in the same PowerShell session.
3. Run `npm.cmd start`.
4. Open `http://localhost:3000`.

## Important limitations
- This update does not yet wire the browser calendar/timetable state to the PostgreSQL `/api/workspace` endpoint. Calendar edits currently use the browser's local workspace and are not guaranteed to sync to other student accounts/devices. Do not describe this as completed shared calendar sync.
- Browser notifications are not equivalent to push notifications delivered while the site is closed. Server-backed broadcast notifications/push delivery still need implementation.
- The source academic planner photo has low resolution. Holiday records that could not be read with confidence are not exhaustively encoded; the clearly readable holidays are included, and admin can edit/add records.
- The official timetable image's merged cells make some Wednesday/Thursday lab-period allocations ambiguous; confirm those details with the department before relying on exact period placement.
- Admin authorization for the API is server-enforced for `/api/workspace`; the existing front-end's local admin-only UI still requires a full role-aware integration. This is a development update, not production-ready software.
