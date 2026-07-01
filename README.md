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

## Deployment

Deploy the app to Vercel.

Required environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Recommended domain:

- `sop.company.com`

After adding the domain in Vercel, configure DNS at the domain registrar using the A record or CNAME record shown in the Vercel project domain settings.

## Preview

Static preview file:

- `preview.html`

Local preview URL when the static server is running:

- `http://localhost:8000/preview.html`
