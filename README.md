# Dear Stranger

**"Some things are easier to tell a stranger."**

Dear Stranger is a full-stack anonymous letter and conversation platform built with React, TypeScript, Tailwind CSS, Express, and Supabase (PostgreSQL + Auth).

## Architecture Overview

- **Frontend (`src/`)**: React 19 SPA with Vite, editorial typography (`Cormorant Garamond` & `Plus Jakarta Sans`), light/dark theme persistence, HTML5 Canvas 2D Share Studio (`qrcode`), and anonymous/linked authentication flows.
- **Backend (`server.ts`, `server/`)**: Express server running on port 3000 with Helmet security headers, rate limiting, duplicate-submission protection, rule-based safety screening, server-verified admin moderation, Resend transactional email notifications, and dynamic Open Graph meta injection for public letters.
- **Database (`supabase/migrations/`)**: Normalized PostgreSQL schema with full-text search (`tsvector`), 1-level reply nesting trigger, and Row Level Security (`RLS`) policies covering anonymous and authenticated Supabase roles.
- **Shared Validation (`src/shared/`)**: Zod schemas, plain-text sanitization, and shared DTOs.

## Local Development

```bash
npm install
cp .env.example .env
# Populate SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY (optional for Sandbox Preview)
npm run dev
```

## Verification Commands

```bash
npm run lint    # TypeScript check
npm test        # Automated API & security tests
npm run build   # Production Vite bundle
```

See `DEPLOYMENT.md` for Supabase migrations, Resend email setup, Cloudflare Turnstile CAPTCHA configuration, and Google Cloud Run deployment.
