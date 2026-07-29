# Basic Design Outline

## 1. Product shape

Fabbro Factory is a single personal workspace with four primary areas:

- Dashboard for strategy, goals, notices, and external signals
- Tasks for day-to-day execution
- Coding for projects and GitHub repositories
- Lab for private comparative scoring

Dashboard is the root route and the default entry point.

## 2. Dashboard hierarchy

The dashboard presents information in this order:

1. Active direction
2. Strategic objectives
3. Outcome goals
4. Notice board
5. Quick links
6. External signals

Direction, objectives, and goals use revision history where meaningful changes need an explanation.

## 3. Task system

- Fast task creation and editing
- Optional descriptions, schedules, durations, projects, and subtasks
- Automatic priority and time-pressure indicators
- Completed-task visibility controls
- Undo support for destructive actions
- Local-first persistence with versioned cloud synchronization

## 4. Coding projects

- Project cards with status, schedule, phase, and repository metadata
- GitHub synchronization for repository-backed projects
- Filters for active, maintained, unstarted, completed, and archived work
- Local fallback when authentication or cloud reads are unavailable

## 5. Lab

- Private scoring entries restricted by row-level security
- Criteria, participants, scores, and ranking views
- Desktop and mobile layouts appropriate for dense comparison data

## 6. UX rules

- Prefer direct manipulation and visible state over deep navigation.
- Keep required fields minimal.
- Use clear empty states and recoverable destructive actions.
- Creation and editing modals follow the rules in `documentation/design.md`.
- Preserve keyboard access, focus management, readable contrast, and mobile-safe controls.
- Background synchronization must not block local work.

## 7. Data model

- User
- Direction and DirectionRevision
- StrategicObjective
- OutcomeGoal and OutcomeGoalRevision
- Project and ProjectBackup
- Task and TaskBackup
- LabEntry

## 8. Visual direction

- Dark, restrained interface with flat rows and selective elevation
- Strong typography and spacing hierarchy
- Status color used as information rather than decoration
- Shared modal, button, form, list, progress, and feedback primitives
- Responsive layouts that preserve the same information hierarchy across devices
