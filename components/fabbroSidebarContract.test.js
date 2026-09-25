import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

describe("Fabbro application shell adoption", () => {
  it("adopts Fabbro Design System 0.3.0 and Application Sidebar 1.0.0", () => {
    expect(read("fabbro-design/VERSION").trim()).toBe("0.3.0");
    expect(read("fabbro-design/components/application-sidebar/VERSION").trim()).toBe("1.0.0");

    const product = JSON.parse(read("fabbro-design/product.json"));
    expect(product).toMatchObject({
      version: "0.3.0",
      product: "Ariadne",
      symbol: "Thread",
      coreIdea: "Direction",
      accent: "#0088FF"
    });

    const core = JSON.parse(read("fabbro-design/core.json"));
    expect(core.applicationShell.desktop).toMatchObject({
      primaryNavigationComponent: "Fabbro Application Sidebar",
      primaryNavigationComponentVersion: "1.0.0",
      primaryNavigationPlacement: "left",
      primaryNavigationDefaultState: "expanded",
      primaryNavigationExpandedWidth: "15.5rem",
      primaryNavigationCollapsedWidth: "4.5rem",
      primaryNavigationCollapseMode: "icon"
    });
    expect(core.applicationShell.mobile).toMatchObject({
      breakpoint: "900px",
      navigationBehavior: "offcanvas-drawer"
    });
  });

  it("uses the vendored canonical React primitive rather than a local sidebar fork", () => {
    const shell = read("components/AppShell.jsx");
    const sidebar = read("components/AriadneSidebar.jsx");
    const primitive = read("fabbro-design/components/application-sidebar/react/sidebar.jsx");
    const packageJson = JSON.parse(read("package.json"));

    expect(shell).toContain("@/fabbro-design/components/application-sidebar/react/sidebar");
    expect(sidebar).toContain("@/fabbro-design/components/application-sidebar/react/sidebar");
    expect(sidebar).toContain('<Sidebar collapsible="icon"');
    expect(sidebar).toContain("<SidebarRail />");
    expect(primitive).toContain('const STORAGE_KEY = "fabbro:application-sidebar-expanded"');
    expect(primitive).toContain("export function SidebarProvider");
    expect(primitive).toContain("export function SidebarTrigger");
    expect(packageJson.dependencies["lucide-react"]).toBe("^1.47.0");
  });

  it("keeps primary navigation in the sidebar and family/account actions in the utility bar", () => {
    const shell = read("components/AppShell.jsx");
    const sidebar = read("components/AriadneSidebar.jsx");
    const layout = read("app/layout.js");

    expect(sidebar).toContain("Dashboard");
    expect(sidebar).toContain("Tasks");
    expect(sidebar).toContain("Opportunities");
    expect(shell).toContain("/brand/fabbro-mark.svg");
    expect(shell).toContain("<AuthPanel compact />");
    expect(shell).not.toContain("NAV_ITEMS.map");
    expect(layout).toContain('data-fabbro-product="ariadne"');
    expect(layout).toContain('import "@/fabbro-design/fabbro-tokens.css"');
  });

  it("keeps Ariadne shell layers below the canonical mobile drawer while allowing page overlays to escape", () => {
    const shellStyles = read("components/AppShell.module.css");

    expect(shellStyles).toMatch(/\.utilityBar\s*\{[\s\S]*?z-index:\s*70;/);
    expect(shellStyles).toMatch(
      /\.workspace :global\(\.page-content\)\s*\{[\s\S]*?z-index:\s*auto;/
    );
  });
});
