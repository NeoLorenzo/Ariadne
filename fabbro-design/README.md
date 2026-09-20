# Adopted Fabbro Design System

Ariadne consumes a local snapshot of the canonical Fabbro Design System.

**Adopted design-system version:** 0.2.0  
**Adopted Application Sidebar:** 1.0.0  
**Upstream:** `NeoLorenzo/Fabbro-Systems/design-system`

## Rules

- Treat this directory as upstream-owned.
- Do not edit canonical tokens, approved assets, or canonical component source locally to make Ariadne different.
- Family-level changes originate in Fabbro Systems and arrive through explicit sync changes.
- Ariadne may define product-specific route maps, workflow UI, data views, and domain interactions.
- The canonical React sidebar source under `components/application-sidebar/react/` must remain unchanged from upstream.

## Snapshot contents

- `VERSION`
- `core.json`
- `product.json`
- `fabbro-tokens.css`
- `assets/`
- `components/application-sidebar/`
