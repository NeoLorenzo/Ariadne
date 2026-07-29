# Tech Stack and Architecture

## Runtime

- **Next.js 16 / App Router** provides routing, static generation, metadata, and deployment output.
- **React 19** provides the client UI and component model.
- **Supabase JS** provides Google OAuth, authenticated database access, and row-level-security-aware
  queries.

## Styling

- **Tailwind/PostCSS** provides the base styling toolchain.
- **Application CSS** contains the established navigation, dashboard, task, coding, lab, and shared
  interface language.
- Shared React primitives in `components/ui/` define modal shells, buttons, list rows, progress
  indicators, and feedback patterns.

## State and persistence

- Page-level React state owns transient UI state.
- Browser localStorage provides fast local-first startup for tasks and projects.
- `lib/storage/syncCache.js` stores resolved cloud snapshots and the last authenticated sync user.
- Supabase tables store private user collections and immutable revision/backup history.
- Version columns and conditional updates detect concurrent task and project writes.

## Application areas

### Dashboard

Combines direction, objectives, outcome goals, notices, quick links, and publication/video signals.
Repository modules under `lib/directions/`, `lib/objectives/`, and `lib/goals/` isolate database
mapping and CRUD behavior.

### Tasks

Maintains task and subtask collections, derives priority and time pressure, persists locally, and
synchronizes versioned cloud snapshots.

### Coding

Maintains coding projects and repository status. GitHub authentication tokens are used only for
explicit repository synchronization.

### Lab

Stores private comparison entries in Supabase behind account-specific row-level security.

## Deployment

- Standard development uses `next dev`.
- Production validation uses `next build`.
- GitHub Pages sets `STATIC_EXPORT=true`, applies a repository base path, and deploys `out/`.
- The manifest, service worker, and icons provide installable PWA behavior.

## Engineering constraints

- Keep persistence boundaries explicit.
- Treat cloud failures as recoverable and retain local access.
- Use optimistic-concurrency checks for mutable collections.
- Keep shared interface primitives independent from domain repositories.
- Preserve accessibility and mobile behavior when changing desktop layouts.
