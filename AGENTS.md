# AGENTS.md

## Repository role

Ariadne is a Fabbro Systems product. Ariadne owns strategy, priorities, opportunities, projects, tasks, and execution planning.

## Fabbro Design System adoption

Ariadne adopts **Fabbro Design System 0.2.0** and **Fabbro Application Sidebar 1.0.0**.

The vendored upstream snapshot lives in `fabbro-design/`.

For shared visual decisions, precedence is:

1. approved assets in `fabbro-design/assets/`;
2. machine-readable values in `fabbro-design/core.json` and `fabbro-design/product.json`;
3. canonical component source in `fabbro-design/components/`;
4. `fabbro-design/fabbro-tokens.css`;
5. Ariadne product wrappers and domain UI.

Do not independently fork family-level components or visual rules.

## Canonical Ariadne identity

- Product: Ariadne
- Symbol: Thread
- Core idea: Direction
- Accent: `#0088FF`
- Shared type family: Inter
- Family endorsement: standalone Fabbro Systems mark

## Application shell

Authenticated desktop primary navigation must use the vendored canonical Fabbro Application Sidebar 1.0.0.

Ariadne owns:

- route definitions;
- labels/grouping;
- chosen Lucide icons;
- domain-specific workflow components.

Fabbro owns:

- sidebar composition;
- expanded/collapsed geometry;
- collapse behavior;
- active-state grammar;
- mobile drawer behavior;
- family utility separation.

Do not recreate the old custom Ariadne rail, horizontal primary navigation, or a second global navigation inside page content.

## Change workflow

For shared design changes:

1. update/version Fabbro Systems first;
2. sync the new Fabbro snapshot here;
3. keep canonical React component files byte-identical to upstream;
4. modify only Ariadne wrappers as needed;
5. update adoption tests;
6. run lint/tests/build/privacy checks.
