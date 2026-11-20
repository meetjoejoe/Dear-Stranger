# Deployment & External Services Guide

## 1. Connecting Supabase (PostgreSQL & Auth)

1. Create a new Supabase project at https://supabase.com.
2. In **Authentication -> Providers -> Email** and **Authentication -> Settings**, enable **Anonymous Sign-Ins**.
3. Under **Authentication -> URL Configuration**, add your production deployment URL (`https://<your-cloud-run-url>`) to **Site URL** and **Redirect URLs** (`https://<your-cloud-run-url>/dashboard`).
4. Apply the SQL migrations in order via the Supabase SQL Editor or Supabase CLI (`supabase db push`):
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_rls_and_functions.sql`
5. Set the following server environment variables:
   - `SUPABASE_URL`: Your project URL (`https://<ref>.supabase.co`)
   - `SUPABASE_PUBLISHABLE_KEY`: Your Supabase publishable (`anon`) key
   - `SUPABASE_SECRET_KEY`: Your Supabase secret (`service_role`) key — keep strictly server-side; never prefix with `VITE_`.
6. Grant initial moderator access by setting `ADMIN_BOOTSTRAP_EMAILS` (after linking/confirming an email) or inserting a row into `public.admin_users(user_id, role)`.

## 2. Optional Email Notifications (Resend)

1. Create an account at https://resend.com and verify a sending domain.
2. Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` (e.g. `Dear Stranger <notifications@yourdomain.com>`) on the server.
3. Users can opt into email notifications from **Dashboard -> Account Settings** once they have linked a recovery email. If `RESEND_API_KEY` is omitted, in-app notifications continue to function normally.

## 3. Optional CAPTCHA Protection (Cloudflare Turnstile)

1. Create a Turnstile widget in Cloudflare Dashboard for your deployment domain.
2. Enable Turnstile CAPTCHA in **Supabase -> Authentication -> Attack Protection** AND set:
   - `TURNSTILE_SITE_KEY`
   - `TURNSTILE_SECRET_KEY`
3. When configured, anonymous sign-in and letter submission require Turnstile verification.

## 4. Google Cloud Run Deployment

1. Build the production frontend bundle:
   ```bash
   npm run build
   ```
2. Ensure `NODE_ENV=production`, `PORT=3000` (or Cloud Run's injected `PORT`), `APP_URL`, and your Supabase/Resend/Turnstile secrets are configured as Cloud Run environment variables/secrets.
3. Start command:
   ```bash
   npm start
   ```
4. Health check endpoint: `GET /api/health`.
5. To attach a custom domain later, map the domain in Cloud Run Domain Mappings and update `APP_URL` and Supabase Redirect URLs accordingly.

## 5. Vercel Deployment

1. The repository includes `vercel.json` and `/api/index.ts`, which route all `/api/*` requests to the shared Express API (`server/app.ts`) as a Vercel Serverless Function while serving the built Vite SPA from `dist/` and rewriting client routes to `/index.html`.
2. In Vercel Project Settings -> **Environment Variables**, configure:
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`
   - Optional: `APP_URL`, `ADMIN_BOOTSTRAP_EMAILS`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`.
3. Ensure both SQL migrations (`001_initial_schema.sql` and `002_rls_and_functions.sql`) have been run and **Anonymous Sign-Ins** are enabled in Supabase Authentication -> Providers.
4. Verify after deploy:
   - `GET /api/health`
   - `GET /api/config`
   - `GET /api/categories`
   - `GET /api/letters?limit=4`
   - `GET /api/letters/letter-of-the-day`

