# Ariadne App Goal

## Purpose

Ariadne is a low-friction personal operating workspace for deciding what matters across multiple life
directions, turning those directions into strategic objectives and executable work, and seeing whether
real work is moving the user in the intended direction.

## Core product goal

Make daily execution visibly connected to longer-term strategy without forcing the user into one
global priority hierarchy:

1. Maintain concurrent directions mapped across the eight canonical navigation vectors.
2. Define strategic objectives under those directions without an arbitrary fixed objective cap.
3. Organize projects and granular tasks around the work required to advance those objectives.
4. Use Ari Bot to infer strategic relevance and keep task priority aligned with the current strategy, urgency, leverage, obligations, and actionability.
5. Use current-state and external signals to show where attention may be needed without replacing user judgment.
6. Surface deadlines, stalled work, repository activity, and other meaningful changes automatically.
7. Review progress without maintaining a separate reporting system.

The intended strategy-to-execution chain is:

`Vectors → Directions → Strategic Objectives → Projects / Tasks → Progress Signals`

Strategic Objectives are the lowest-level persistent strategy entity. Concrete deliverables and next
actions belong in the ordinary task system; Ariadne does not maintain a separate Outcome Goal layer.

Directions can coexist across several vectors. Short-term emphasis may later highlight only part of this
map, but it must not require pausing or deleting the rest of the user's active strategy.

## Ariadne / Kleos boundary

Ariadne owns strategy, planning, projects, tasks, repository workflows, and progress signals.

Personal measurement, benchmarking, and the canonical eight-vector assessment history belong to the
separate `NeoLorenzo/Kleos` application. Ariadne may read Kleos-owned vector state as a contextual,
read-only current-position signal, but it does not own or recreate Kleos measurement workflows.

## Non-negotiables

- Fast startup and low interaction cost
- Local-first behavior with safe cloud synchronization
- Clear ownership from direction to strategic objective, with execution represented by ordinary tasks
- Useful prioritization without administrative busywork
- A single numeric task-priority system (`0–4`) with no special Directional priority
- Private-by-default user data
- Explicit ownership boundaries between Ariadne and connected systems such as Kleos and GitHub
- Desktop and mobile usability

## Success criteria

- The dashboard explains the current strategy map and important priorities at a glance.
- Several active directions can coexist without being flattened into one global active direction.
- Strategic Objectives are clear enough that Ari Bot can infer which tasks materially advance them.
- Projects and tasks stay actionable instead of becoming passive lists.
- Repository and other progress signals help reveal stalled or neglected work without becoming hidden scoring systems.
- Important strategy changes retain enough history to explain why direction shifted.
- Kleos-derived current-state context can inform navigation without making Ariadne the owner of personal measurement data.
- The app remains dependable when cloud services are unavailable.
