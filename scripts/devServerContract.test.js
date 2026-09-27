import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// On the Windows development setup used for Ariadne, Turbopack has produced
// large numbers of persistent PostCSS child processes and exhausted memory.
// Keep every dev script on webpack until that upstream behavior is resolved.
describe("local dev server", () => {
  it("runs every next dev script with webpack instead of Turbopack", () => {
    const { scripts } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    const devScripts = Object.entries(scripts).filter(([, command]) => /\bnext dev\b/.test(command));

    expect(devScripts.length).toBeGreaterThan(0);
    for (const [name, command] of devScripts) {
      expect(command, name).toMatch(/\bnext dev --webpack\b/);
    }
  });
});
