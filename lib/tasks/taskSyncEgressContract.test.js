import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const taskPageSource = fs.readFileSync(path.join(process.cwd(), "app/tasks/page.js"), "utf8");

function taskCloudRefreshSource() {
  const match = taskPageSource.match(
    /const refreshFromCloud = async \(\) => \{[\s\S]*?\r?\n    const refreshWhenVisible/
  );
  return match?.[0] || "";
}

describe("task cloud sync egress", () => {
  it("checks the lightweight version before downloading the task payload", () => {
    const source = taskCloudRefreshSource();

    const versionOnlyRead = source.indexOf('.select("version")');
    const fullPayloadRead = source.indexOf('.select("tasks,version")');

    expect(source).not.toBe("");
    expect(versionOnlyRead).toBeGreaterThanOrEqual(0);
    expect(fullPayloadRead).toBeGreaterThan(versionOnlyRead);
    expect(source).toContain("remoteVersion <= currentVersion");
    expect(source).toContain("resolvedRemoteVersion <= currentVersion");
  });

  it("keeps polling refreshes gated to visible documents", () => {
    expect(taskPageSource).toContain('document.visibilityState === "visible"');
    expect(taskPageSource).toContain("window.setInterval");
  });
});
