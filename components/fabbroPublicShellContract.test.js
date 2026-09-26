import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

describe("Fabbro public shell adoption", () => {
  it("adopts Fabbro Design System 0.4.0 and Public Shell 1.0.0", () => {
    expect(read("fabbro-design/VERSION").trim()).toBe("0.4.0");
    expect(read("fabbro-design/components/public-shell/VERSION").trim()).toBe("1.0.0");

    const product = JSON.parse(read("fabbro-design/product.json"));
    expect(product).toMatchObject({
      version: "0.4.0",
      product: "Ariadne",
      symbol: "Thread",
      coreIdea: "Direction",
      accent: "#0088FF"
    });

    const contract = JSON.parse(read("fabbro-design/components/public-shell/contract.json"));
    expect(contract).toMatchObject({
      version: "1.0.0",
      designSystemVersion: "0.3.0"
    });
    expect(contract.header.desktop.gridTemplateColumns).toBe(
      "minmax(220px, 1fr) auto minmax(120px, 1fr)"
    );
    expect(contract.footer.productLockupWidth).toBe("150px");
    expect(contract.footer.familyMarkSize).toBe("22px");
  });

  it("renders the public surface before private workspace authorization", () => {
    const gate = read("components/AppAccessGate.jsx");
    const publicSite = read("components/AriadnePublicSite.jsx");

    expect(gate).toContain('import AriadnePublicSite from "@/components/AriadnePublicSite"');
    expect(gate).toContain('if (accessState === "authorized")');
    expect(gate).toContain("<AriadnePublicSite");
    expect(publicSite).toContain("Turn direction into action.");
    expect(publicSite).toContain('id="how-it-works"');
    expect(publicSite).toContain('id="strategy"');
    expect(publicSite).toContain('id="opportunities"');
    expect(publicSite).toContain('id="prioritization"');
    expect(publicSite).toContain("Evidence → state → action.");
    expect(publicSite).toContain("Synthetic example only");
  });

  it("keeps the public surface static and separate from private repositories", () => {
    const publicSite = read("components/AriadnePublicSite.jsx");

    expect(publicSite).not.toContain("@/lib/");
    expect(publicSite).not.toContain("supabase");
    expect(publicSite).not.toContain("localStorage");
    expect(publicSite).not.toContain("DashboardStrategyOverview");
    expect(publicSite).not.toContain("OpportunityRepository");
  });

  it("consumes canonical public-shell tokens instead of re-hardcoding shell geometry", () => {
    const css = read("components/AriadnePublicSite.module.css");

    expect(css).toContain("max-width: var(--fs-page-max)");
    expect(css).toContain("grid-template-columns: var(--fs-public-header-grid)");
    expect(css).toContain("var(--fs-public-header-lockup-max)");
    expect(css).toContain("var(--fs-public-header-lockup-compact)");
    expect(css).toContain("var(--fs-public-header-lockup-mobile)");
    expect(css).toContain("font-size: var(--fs-type-hero-sub-size)");
    expect(css).toContain("var(--fs-focus-outline-width)");
    expect(css).toContain("var(--fs-focus-outline-offset)");
    expect(css).toContain("var(--fs-public-footer-product-lockup)");
    expect(css).toContain("var(--fs-public-footer-family-mark)");
  });

  it("indexes only the public root and publishes social preview metadata", () => {
    const layout = read("app/layout.js");
    const page = read("app/page.js");

    expect(layout).toContain("index: false");
    expect(layout).toContain("follow: false");
    expect(layout).toContain('data-fabbro-product="ariadne"');

    expect(page).toContain('title: "Ariadne | Personal strategy and execution"');
    expect(page).toContain("index: true");
    expect(page).toContain("follow: true");
    expect(page).toContain("Ariadne | Turn direction into action");
    expect(page).toContain('card: "summary"');
  });
});
