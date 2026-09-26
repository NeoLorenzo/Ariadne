import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

describe("Fabbro Application UI adoption", () => {
  it("adopts Fabbro Design System 0.4.0 and Application UI 1.0.0", () => {
    expect(read("fabbro-design/VERSION").trim()).toBe("0.4.0");
    expect(read("fabbro-design/components/application-ui/VERSION").trim()).toBe("1.0.0");

    const contract = JSON.parse(read("fabbro-design/components/application-ui/contract.json"));
    expect(contract).toMatchObject({
      version: "1.0.0",
      designSystemVersion: "0.4.0",
      name: "Fabbro Application UI"
    });

    const core = JSON.parse(read("fabbro-design/core.json"));
    expect(core.applicationUI).toMatchObject({
      version: "1.0.0"
    });

    const product = JSON.parse(read("fabbro-design/product.json"));
    expect(product).toMatchObject({
      version: "0.4.0",
      product: "Ariadne",
      accent: "#0088FF",
      accentContrast: "#000000"
    });
  });

  it("loads the canonical Application UI stylesheet after shared tokens", () => {
    const layout = read("app/layout.js");
    const tokenImport = layout.indexOf('import "@/fabbro-design/fabbro-tokens.css"');
    const uiImport = layout.indexOf('import "@/fabbro-design/components/application-ui/application-ui.css"');

    expect(tokenImport).toBeGreaterThanOrEqual(0);
    expect(uiImport).toBeGreaterThan(tokenImport);
  });

  it("rebases Ariadne wrappers on canonical Application UI primitives", () => {
    const ui = read("components/ui/AriadneUI.jsx");

    expect(ui).toContain("fs-app-modal");
    expect(ui).toContain("fs-app-control");
    expect(ui).toContain("fs-app-button");
    expect(ui).toContain("fs-app-progress");
    expect(ui).toContain("fs-app-status");
    expect(ui).not.toMatch(/\bff-[a-z0-9-]+/);
  });

  it("does not maintain a parallel local semantic application token system", () => {
    const files = [
      "app/globals.css",
      "app/dashboard/dashboard.module.css",
      "components/AppShell.module.css",
      "components/opportunities/OpportunityCandidate.module.css",
      "components/opportunities/OpportunityEligibility.module.css",
      "components/opportunities/OpportunityLandscape.module.css",
      "components/opportunities/OpportunityLandscapeChart.module.css",
      "components/opportunities/OpportunityRequirementsEditor.jsx"
    ];

    for (const file of files) {
      expect(read(file), file).not.toMatch(/--ui-[a-z0-9-]+/);
    }

    expect(read("app/globals.css")).toContain("--ariadne-violet");
  });
});
