# Ariadne Roadmap Notes

This file preserves the useful intent from the original feature brain dump while distinguishing the
capabilities Ariadne already has from work that is still genuinely planned.

## Current baseline: project and repository management

The original roadmap described a future **Project Manager**. That capability now exists in Ariadne's
current product and should no longer be treated as wholly unimplemented.

Current project/repository behavior includes:

- persistent projects with lifecycle/status metadata;
- task-to-project relationships;
- GitHub repository synchronization for repository-backed projects;
- repository/project management surfaced through the Dashboard;
- local-first project state with authenticated cloud synchronization.

Future project work may extend these capabilities, but it should build on the existing project model rather
than introducing a second independent Project Manager.

## Planned: Weekly Mission

### Concept

Add one lightweight **Weekly Mission** representing the broad tactical focus of the current week.

Examples:

- "Start checking off to-do list items"
- "Academic grind"
- "Ship the operating-system foundation"

The mission is temporary emphasis, not another strategy hierarchy. Ariadne now supports several concurrent
directions across the eight-vector model, so a Weekly Mission must not assume one global direction or pause
unrelated active directions.

### Linking

The Weekly Mission should be able to reference existing work rather than duplicating it. Useful associations
include:

- one or more directions or strategic objectives;
- existing projects;
- existing tasks.

For example, an "Academic grind" mission could highlight the relevant academic direction/objective together
with several essay projects and their tasks.

Replacing the Weekly Mission should not delete, complete, reprioritize, or otherwise mutate linked strategy,
projects, or tasks.

### Presentation

Mission-associated work should be visibly distinguishable in the surfaces where it already appears. The
original "glow" idea is one possible presentation treatment, not a requirement for a specific CSS effect.

The mission should remain broad and low-friction: no quantitative mission score, automatic progress
percentage, second goal tree, or separate project/task store is required.

## Product boundary

Weekly Mission and project management belong to Ariadne because they organize strategy and execution.
Personal measurement, benchmarking, and vector assessment history remain owned by `NeoLorenzo/Kleos` and
should not be reintroduced as Ariadne roadmap features.
