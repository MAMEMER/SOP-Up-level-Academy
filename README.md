# SOP Website

Public UPMAN operations manual and checklist website for store work, training, review, and admin monitoring.

## Local Setup

1. Install dependencies with `npm install`.
2. Copy `.env.local.example` to `.env.local`.
3. Fill Supabase URL and anon key only when the site should use a real private database.
4. Run `npm run dev`.

By default the web app runs in public preview mode. Visitors can open the dashboard, checklist, manual, and public performance score without signing in.

## Roles

- Employee: reads published SOPs.
- Leader: drafts SOPs for their department and submits for approval.
- Admin: approves, publishes, and manages users.

## Deployment

Deploy the app to Vercel.

Optional environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_ACCESS`: leave unset or set `public` for a public site. Set `private` to require Supabase login.

Optional StoreHub stock integration:

- `STOREHUB_STOCK_URL`: server-side JSON endpoint or integration proxy that returns StoreHub product/inventory rows.
- `STOREHUB_API_TOKEN`: bearer token used by the server route when calling `STOREHUB_STOCK_URL`.

Admin Owner Summary reads `/api/storehub/stock`. If StoreHub env vars are missing or the endpoint fails, the dashboard falls back to mock stock data.

Recommended domain:

- `sop.company.com`

After adding the domain in Vercel, configure DNS at the domain registrar using the A record or CNAME record shown in the Vercel project domain settings.

## Preview

Static preview file:

- `preview.html`

Local preview URL when the static server is running:

- `http://localhost:8000/preview.html`
