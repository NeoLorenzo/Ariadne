# ChatGPT control surface

Ariadne can be read and modified from ordinary ChatGPT conversations through the user's connected Supabase integration. This is the Plus-compatible integration path; it does not depend on attaching a private MCP server to ChatGPT.

## Architecture

```text
ChatGPT
  -> connected Supabase integration
  -> chatgpt schema in the Ariadne Postgres database
  -> canonical Ariadne tables
  -> existing Ariadne UI
```

The `chatgpt` schema is deliberately not granted to `anon` or `authenticated` browser roles. It exists to give ChatGPT a small, semantic database interface when operating through the privileged connected Supabase management integration.

## Strategy hierarchy

The active strategy model is:

```text
Vector State -> Directions -> Strategic Objectives -> Tasks / work
```

Strategic Objectives are the lowest-level persistent strategy node. There is no Outcome Goal layer. Tasks remain independent execution records; strategic relevance can be inferred from enabled Directions and active Strategic Objectives rather than represented by a special task type or priority.

## Read operations

- `chatgpt.get_workspace_state(...)`
- `chatgpt.get_tasks(...)`
- `chatgpt.get_projects(...)`
- `chatgpt.get_strategy()`
- `chatgpt.get_signals()`

`chatgpt.get_strategy()` returns Directions and Strategic Objectives. It does not return Outcome Goals.

Example:

```sql
select jsonb_build_object(
  'strategy', chatgpt.get_strategy(),
  'tasks', chatgpt.get_tasks(false, false, 500)
) as ari_bot_state;
```

## Write operations

### Tasks

- `chatgpt.create_task(...)`
- `chatgpt.update_task(task_id, patch)`
- `chatgpt.complete_task(task_id, completed)`

Task priority is always numeric `0` through `4`:

- `0` — no current priority
- `1` — immediate
- `2` — strong
- `3` — moderate
- `4` — low

There is no Directional priority or special Directional task type. Legacy `sourceGoalId` / `sourceType` provenance is not writable through the control surface. The deprecated `source_goal_id` argument remains in the `create_task` SQL signature only for backwards compatibility and is ignored.

Task updates use an allowlisted JSON patch. IDs, creation timestamps, provenance fields, and arbitrary fields cannot be overwritten through the interface. Deletion is a soft-delete field rather than physical row deletion.

### Projects

- `chatgpt.update_project(project_id, patch)`

Allowed project updates are limited to user-facing Ariadne metadata such as title, description, due date, category, estimated hours, archive state, repository status, and completion status.

### Strategy

- `chatgpt.update_direction(...)`
- `chatgpt.create_strategic_objective(...)`
- `chatgpt.update_strategic_objective(...)`

No Outcome Goal CRUD remains. No generic SQL mutation operation is added to Ariadne itself.

Direction content edits preserve the existing revision/history behavior. Strategic Objectives are persisted directly beneath Directions and concrete deliverables, deadlines, and next actions belong in Tasks.

## Ari Bot

Ari Bot should reason over:

```text
Enabled Directions
-> Active Strategic Objectives
-> Incomplete Tasks
```

For each task, strategic alignment is one input into priority alongside urgency, leverage, obligations, actionability, and relative importance. Priority means how much attention a task deserves now; it is not a stored strategy-link type.

Ari Bot should change only the numeric `priority` field and should not create strategy links or mutate Directions/Objectives while reprioritizing.

## Intended ChatGPT usage

With the Supabase connection enabled, normal requests can be phrased around Ariadne rather than SQL, for example:

- "Read my Ariadne workspace and tell me my current priorities."
- "Add a task in Ariadne to renew my passport."
- "Mark the Ariadne task about X complete."
- "Update my Ariadne strategic objective about technical credibility."
- "Read my Ariadne projects and archive anything marked complete."

ChatGPT should resolve the Ariadne Supabase project, use the `chatgpt` functions for normal application operations, and return the result in user-facing language.

## Security properties

- The browser does not receive new credentials.
- `anon` and `authenticated` roles cannot execute the `chatgpt` schema functions.
- The control surface assumes Ariadne remains a single-owner workspace and refuses to resolve an owner if multiple distinct owners appear in core tables.
- Writes are bounded by operation and field allowlists.
- Task deletion is soft deletion.
- The existing Ariadne storage model remains canonical; there is no second ChatGPT data store.

## MCP

The existing MCP experiment can remain as a future transport option, but it is not required for current ChatGPT Plus access. If private MCP attachment becomes available on the user's plan later, the MCP server can call the same underlying Ariadne domain operations rather than introducing a separate mutation model.
