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

## Read operations

- `chatgpt.get_workspace_state(...)`
- `chatgpt.get_tasks(...)`
- `chatgpt.get_projects(...)`
- `chatgpt.get_strategy()`
- `chatgpt.get_signals()`

Example:

```sql
select chatgpt.get_workspace_state();
```

## Write operations

### Tasks

- `chatgpt.create_task(...)`
- `chatgpt.update_task(task_id, patch)`
- `chatgpt.complete_task(task_id, completed)`

Task updates use an allowlisted JSON patch. IDs, creation timestamps, and arbitrary fields cannot be overwritten through the interface. Deletion is a soft-delete field rather than physical row deletion.

### Projects

- `chatgpt.update_project(project_id, patch)`

Allowed project updates are limited to user-facing Ariadne metadata such as title, description, due date, category, estimated hours, archive state, repository status, and completion status.

### Strategy

- `chatgpt.update_direction(direction_id, patch)`
- `chatgpt.create_strategic_objective(...)`
- `chatgpt.update_strategic_objective(objective_id, patch)`
- `chatgpt.create_outcome_goal(...)`
- `chatgpt.update_outcome_goal(goal_id, patch)`

No generic SQL mutation operation is added to Ariadne itself.

## Intended ChatGPT usage

With the Supabase connection enabled, normal requests can be phrased around Ariadne rather than SQL, for example:

- "Read my Ariadne workspace and tell me my current priorities."
- "Add a task in Ariadne to renew my passport."
- "Mark the Ariadne task about X complete."
- "Update my Ariadne outcome goal to 12 articles."
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
