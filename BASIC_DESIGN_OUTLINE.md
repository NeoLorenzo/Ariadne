# Basic Design Outline

## 1. Product shape

Ariadne is a single personal strategy-to-execution workspace. Its primary application navigation is:

- **Dashboard** for strategy, outcome goals, notices, repository/project workflows, quick actions, and progress signals
- **Tasks** for day-to-day execution

Settings and authentication controls live in the application shell rather than as a separate planning domain.
Repository management is part of the current Dashboard workflow; it is not a separate top-level `Coding`
product area.

Personal measurement and benchmarking are not an Ariadne application surface. Those capabilities are owned
by the separate `NeoLorenzo/Kleos` application.

Dashboard is the root route and the default entry point.

## 2. Strategy hierarchy

Ariadne supports several concurrent directions rather than one global active direction.

The canonical hierarchy is:

1. Eight navigation vectors
2. Directions mapped to one or more vectors
3. Strategic objectives under a direction
4. Measurable outcome goals under an objective
5. Projects and tasks that execute the work
6. Progress signals and notices that help review movement

Directions, objectives, and goals use revision history where meaningful changes need an explanation.
Strategic objectives are not constrained by an arbitrary fixed active-objective count.

Kleos may provide a read-only current-state assessment for the eight vectors. Ariadne can display that
assessment alongside desired movement, but the assessment remains Kleos-owned evidence rather than part of
Ariadne's editable strategy hierarchy.

## 3. Dashboard

The Dashboard combines the main planning and review surfaces:

- multidirectional strategy and outcome-goal views;
- read-only Kleos current-vector-state context where available;
- a notice board for meaningful project/publication/progress signals;
- GitHub repository synchronization and project-management controls;
- quick links to external working surfaces.

The Dashboard should make the relationship between current position, desired direction, active work, and
observable progress understandable without requiring a separate reporting workflow.

## 4. Task system

- Fast task creation and editing
- Optional descriptions, schedules, durations, projects, and subtasks
- Manual priority plus time-pressure indicators
- Directional/outcome-goal provenance where applicable
- Completed-task visibility controls
- Undo support for destructive actions
- Local-first persistence with versioned cloud synchronization
- GitHub-backed issue tasks remain synchronized with their source where GitHub is authoritative

## 5. Projects and repositories

- Project cards with status, schedule, phase, and repository metadata
- GitHub synchronization for repository-backed projects
- Repository/project management surfaced through the Dashboard
- Filters and lifecycle states for active, maintained, unstarted, completed, and archived work where supported
- Local-first project state with authenticated cloud synchronization and resilient fallback behavior

Projects are execution containers and may connect tasks to longer-term strategy. They do not form a second
strategy hierarchy independent from directions, objectives, and outcome goals.

## 6. Ariadne / Kleos ownership boundary

Ariadne owns:

- directions and their vector links;
- strategic objectives and outcome goals;
- projects and repository workflows;
- tasks and execution metadata;
- Ariadne-owned notices and progress signals.

Kleos owns:

- personal measurement and benchmarking;
- canonical `goat_*` persistence;
- eight-vector assessment snapshots and their methodology/history.

Ariadne may consume selected Kleos state read-only, but it must not reintroduce the removed GOAT Lab/Lab
surface or duplicate Kleos-owned persistence.

## 7. UX rules

- Prefer direct manipulation and visible state over deep navigation.
- Keep required fields minimal.
- Use clear empty states and recoverable destructive actions.
- Creation and editing modals follow the rules in `documentation/design.md`.
- Preserve keyboard access, focus management, readable contrast, and mobile-safe controls.
- Background synchronization must not block local work.
- Keep current-state evidence distinct from user-authored strategic intent.

## 8. Data model

Core Ariadne-owned concepts include:

- User
- Vector vocabulary / direction-vector links
- Direction and DirectionRevision
- StrategicObjective
- OutcomeGoal and OutcomeGoalRevision
- Project and ProjectBackup
- Task and TaskBackup
- GitHub integration/repository synchronization metadata

Kleos-owned measurement and assessment records are deliberately outside Ariadne's product/data ownership,
even where Ariadne reads a subset of that state for context.

## 9. Visual direction

- Dark, restrained interface with flat rows and selective elevation
- Strong typography and spacing hierarchy
- Status color used as information rather than decoration
- Shared modal, button, form, list, progress, and feedback primitives
- Responsive layouts that preserve the same information hierarchy across devices
