import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const taskPageSource = fs.readFileSync(path.join(process.cwd(), "app/tasks/page.js"), "utf8");

describe("Directional task page contract", () => {
  it("renders Directional separately from ordinary numeric priority", () => {
    expect(taskPageSource).toContain('<span className="task-card-goal-tag">D · Directional</span>');
    expect(taskPageSource).toContain('{form.sourceGoalId ? <option value={form.priority}>D · Directional</option> : null}');
    expect(taskPageSource).toContain('<option value="1">1 · Highest</option>');
  });

  it("does not restore the legacy P1 coercion while saving or editing", () => {
    expect(taskPageSource).toContain('priority: form.sourceGoalId ? 0 : normalizePriority(form.priority)');
    expect(taskPageSource).toContain('priority: directionalGoalId ? 0 : normalizePriority(task.priority, task.materialConsequence)');
    expect(taskPageSource).not.toContain('priority: form.sourceGoalId ? 1');
    expect(taskPageSource).not.toContain('priority: directionalGoalId ? 1');
  });
});
