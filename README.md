# Ariadne

Personal strategy-to-action operating workspace built with Next.js and Supabase. Ariadne focuses on
direction, strategic objectives, projects, tasks, and progress signals.

Personal measurement and benchmarking are owned by the separate
[`NeoLorenzo/Kleos`](https://github.com/NeoLorenzo/Kleos) application. Ariadne and Kleos currently
share one physical Supabase project by design, while retaining separate application and persistence
ownership boundaries.

## Current features

- Dashboard with concurrent multidimensional directions across an eight-vector navigation model and strategic objectives
- Notice board generated from project and publication signals
- Coding project management with GitHub repository synchronization
- Task planning with subtasks, scheduling, numeric 0–4 priority, and time-pressure indicators
- Ari Bot-compatible strategy/task control surface for automatic reprioritization
- Google OAuth through Supabase
- Local-first project and task data with authenticated cloud synchronization
- PWA support and static deployment through GitHub Pages

## Strategy model

Ariadne uses a deliberately small hierarchy:

```text
Vector State -> Directions -> Strategic Objectives -> Tasks / work
```

Directions describe desired movement through the eight-dimensional life map. Strategic Objectives
decompose that movement into the major changes currently required. Strategic Objectives are the
lowest-level persistent strategy entity; concrete deliverables, deadlines, and next actions belong in
the ordinary task system.

Task priority has only five numeric values: `0`, `1`, `2`, `3`, and `4`. There is no special
Directional task priority. Ari Bot can infer how current tasks contribute to enabled Directions and
active Strategic Objectives and use that relevance as one input into task priority.

## Kleos boundary

Personal measurement and benchmarking are fully owned by the separate
[`NeoLorenzo/Kleos`](https://github.com/NeoLorenzo/Kleos) application. Ariadne no longer exposes
or contains the former GOAT Lab application surface.

Existing `goat_*` records remain physically located in the shared Supabase project. Their schema,
RLS policy definitions, application logic, and future persistence changes are owned by Kleos.

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

[`supabase/schema.sql`](supabase/schema.sql) is the baseline Ariadne-owned persistence bootstrap.
After applying that baseline to a fresh project, apply the timestamped SQL files in
[`supabase/migrations/`](supabase/migrations) in filename order. The migrations are the source of
truth for schema evolution after the baseline; an existing project should apply only migrations that
have not already been deployed.

The resulting current schema provides:

- user task and task-backup storage
- user project and project-backup storage
- concurrent directions with lifecycle/order metadata and explicit many-to-many links to the eight canonical navigation vectors
- user-managed direction revisions, including vector metadata for revisions created after the multidirectional migration
- strategic objectives without an arbitrary three-active-objective cap
- bounded semantic operations used by the browser and ChatGPT/Ari Bot control surfaces
- numeric-only task priority (`0–4`) with legacy goal-generated tasks normalized into ordinary tasks

Kleos-owned `goat_*` persistence is documented and maintained in
[`NeoLorenzo/Kleos`](https://github.com/NeoLorenzo/Kleos/tree/main/supabase). Ariadne intentionally
excludes Kleos persistence definitions from its own schema; the Kleos repository is the source of truth.

All private tables use row-level security keyed by authenticated ownership.

## OAuth configuration

In Supabase Auth URL Configuration:

- Set **Site URL** to the deployed Ariadne application URL.
- Add local and deployed Ariadne URLs under **Additional Redirect URLs**.
- Because the Supabase project is shared, also allow the production/local redirect URLs used by Kleos.
- A typical local redirect is `http://localhost:3000/`.

## GitHub Pages deployment

The workflow at [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml):

1. installs dependencies with `npm ci`;
2. runs regression tests and privacy checks;
3. resolves the repository base path;
4. performs a static Next.js export;
5. uploads and deploys the `out/` artifact.

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
- Direction/objective edits use durable local-first strategy reconciliation with optimistic conflict detection.
- Legacy Outcome Goal-generated tasks are retained as ordinary tasks; Outcome Goals are not part of the active data model.
- Dashboard publication signals are read only after owner authorization.
- Personal records are never seeded from repository code.

## Privacy boundary

- GitHub Pages and this repository contain only the downloadable Ariadne application client.
- The application mounts only for the authorized Google account.
- Private Ariadne records live in Supabase and are protected by owner-only Row Level Security policies.
- Kleos uses the same physical Supabase project but owns its own `goat_*` persistence boundary.
- Supabase secret and service-role keys must never be committed or exposed to the browser.
- Run `npm run check:privacy` before deployment to scan tracked source and the static export.

## Repository scope

This is a personal application with workflow-specific naming and data assumptions. It is open
source, but it is not maintained as a general-purpose turnkey product or stable public API.
