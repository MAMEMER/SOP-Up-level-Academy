# SOP Website

Private company SOP website for employees, department leaders, and admins.

## Local Setup

1. Install dependencies with `npm install`.
2. Copy `.env.local.example` to `.env.local`.
3. Fill Supabase URL and anon key.
4. Run `npm run dev`.

## Roles

- Employee: reads published SOPs.
- Leader: drafts SOPs for their department and submits for approval.
- Admin: approves, publishes, and manages users.
