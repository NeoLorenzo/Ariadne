import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const taskPageSource = fs.readFileSync(path.join(process.cwd(), "app/tasks/page.js"), "utf8");

function taskStorageWriterSource() {
  const match = taskPageSource.match(
    /function writeTasksToStorage\(taskList\) \{[\s\S]*?\n\}\n\nfunction getTaskCollectionCacheSignature/
  );
  return match?.[0] || "";
}

describe("task local storage quota resilience", () => {
  it("keeps browser task-cache failures from escaping the storage writer", () => {
    const source = taskStorageWriterSource();

    expect(source).toContain("try {");
    expect(source).toContain(
      "window.localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(sanitizeTaskList(taskList)));"
    );
    expect(source).toContain("} catch {");
    expect(source).toContain("Cloud sync remains authoritative");
  });
});
