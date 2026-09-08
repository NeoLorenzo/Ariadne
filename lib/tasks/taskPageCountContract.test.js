import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const taskPageSource = fs.readFileSync(path.join(process.cwd(), "app/tasks/page.js"), "utf8");

describe("Tasks header count contract", () => {
  it("shows the incomplete/open task count instead of the full displayed task count", () => {
    expect(taskPageSource).toContain(
      "const activeTasks = displayedTasks.filter((task) => !task.completed);"
    );
    expect(taskPageSource).toContain(
      '<span className="task-board-list-count">{activeTasks.length}</span>'
    );
    expect(taskPageSource).not.toContain(
      '<span className="task-board-list-count">{displayedTasks.length}</span>'
    );
  });

  it("keeps completed tasks in their separate completed section", () => {
    expect(taskPageSource).toContain(
      "const completedTasks = displayedTasks.filter((task) => task.completed);"
    );
    expect(taskPageSource).toContain(
      '<span className="task-board-completed-count">{completedTasks.length}</span>'
    );
  });
});
