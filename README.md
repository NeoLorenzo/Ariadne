# Fabbro Factory

Personal operating workspace built with Next.js and Supabase. Fabbro Factory combines strategy,
projects, tasks, progress signals, and a private scoring lab in one installable web app.

## Current features

- Dashboard with an active direction, strategic objectives, and measurable outcome goals
- Notice board generated from project and publication signals
- Coding project management with GitHub repository synchronization
- Task planning with subtasks, scheduling, manual 0–4 priority, directional-goal links, and time-pressure indicators
- Private GOAT Lab scoring workspace
- Google OAuth through Supabase
- Local-first project and task data with authenticated cloud synchronization
- PWA support and static deployment through GitHub Pages

## Tech stack

- Next.js 16 with the App Router
- React 19
- Supabase Auth and PostgreSQL
- Tailwind/PostCSS plus application CSS
- GitHub Actions and GitHub Pages

## Local development

Install and run:

```bash
npm ci
npm run dev
```

The default local URL is [http://localhost:3000](http://localhost:3000).

## Environment variables

Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Only the public Supabase URL and anon key are used client-side.

## Supabase setup

Run [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL Editor. The schema provides:

- user task and task-backup storage
- user project and project-backup storage
- directions and user-managed direction revisions
- strategic objectives
- count-based outcome goals, bare-minimum thresholds, automatic deadline outcomes, and user-managed revisions
- private GOAT Lab entries

All private tables use row-level security keyed by `auth.uid()`.

## OAuth configuration

In Supabase Auth URL Configuration:

- Set **Site URL** to the deployed application URL.
- Add local and deployed URLs under **Additional Redirect URLs**.
- A typical local redirect is `http://localhost:3000/`.

## GitHub Pages deployment

The workflow at [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml):

1. installs dependencies with `npm ci`;
2. resolves the repository base path;
3. performs a static Next.js export;
4. uploads and deploys the `out/` artifact.

Required GitHub Actions secrets:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## PWA files

- [`app/manifest.webmanifest`](app/manifest.webmanifest)
- [`public/sw.js`](public/sw.js)
- [`components/PwaRegistrar.jsx`](components/PwaRegistrar.jsx)
- `public/icons/`

## Data behavior

- Tasks and projects are stored locally for responsive startup.
- Authenticated users synchronize private data to Supabase.
- Version checks protect task and project collections from silent concurrent overwrites.
- Dashboard publication signals are read only after owner authorization.
- Personal records are never seeded from repository code.

## Privacy boundary

- GitHub Pages and this repository contain only the downloadable application client.
- The application mounts only for the authorized Google account.
- Private records live in Supabase and are protected by owner-only Row Level Security policies.
- Supabase secret and service-role keys must never be committed or exposed to the browser.
- Run `npm run check:privacy` before deployment to scan tracked source and the static export.

## Repository scope

This is a personal application with workflow-specific naming and data assumptions. It is open
source, but it is not maintained as a general-purpose turnkey product or stable public API.
