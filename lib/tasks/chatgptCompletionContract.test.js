import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL("../../supabase/migrations/20260911013503_add_task_completion_timestamps.sql", import.meta.url)
);
const migrationSql = readFileSync(migrationPath, "utf8");

describe("ChatGPT task completion timestamp contract", () => {
  it("creates incomplete tasks with an explicit null completion timestamp", () => {
    expect(migrationSql).toContain("'completed', false");
    expect(migrationSql).toContain("'completedAt', null");
  });

  it("sets completedAt only on an incomplete-to-complete transition", () => {
    expect(migrationSql).toContain("coalesce(task->>'completed', 'false') <> 'true'");
    expect(migrationSql).toContain("jsonb_build_object('completedAt', v_now)");
  });

  it("clears completedAt on reopen while unrelated patches leave it untouched", () => {
    expect(migrationSql).toContain("jsonb_build_object('completedAt', null)");
    expect(migrationSql).not.toContain("'completedAt','updatedAt'");
  });
});
