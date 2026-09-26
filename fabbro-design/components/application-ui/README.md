# Fabbro Application UI

**Component version:** 1.0.0  
**Introduced in Fabbro Design System:** 0.4.0

Fabbro Application UI is the canonical framework-agnostic primitive layer for authenticated Fabbro product interfaces.

It sits below product-specific components and above the raw Fabbro tokens.

## What it standardizes

- dense application typography;
- page and section structure;
- neutral card/surface hierarchy;
- modals;
- fields and text areas;
- compact application buttons;
- count indicators;
- progress bars;
- status indicators;
- interaction and focus treatment.

It does not define product workflows, data schemas, dashboards, or domain-specific visualizations.

## Files

- `contract.json` — machine-readable component contract;
- `application-ui.css` — canonical framework-agnostic CSS reference;
- `VERSION` — component version.

The CSS consumes the `--fs-app-*` tokens in `design-system/css/fabbro-tokens.css`.

## Consumer model

Product repositories should vendor the relevant Fabbro Design System snapshot and may either:

1. import `application-ui.css` directly; or
2. reproduce the same primitives in framework-specific components while preserving the token usage and behavior.

Products should not copy the primitive values into a second local token system.

## Naming

Canonical reference classes use the `fs-app-` prefix to distinguish family-owned application primitives from product-owned classes.

Framework wrappers may use local component names, but the resulting visual contract should remain equivalent.

## Accessibility

- icon-only buttons require an accessible name;
- focus must remain visible;
- accent-filled controls use `--fs-accent-contrast`;
- semantic colors must not be the only status cue;
- reduced-motion preferences must disable non-essential entrance animation.
