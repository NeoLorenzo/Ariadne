---
version: alpha
name: Ariadne — Frame (Fabbro Design System 0.4.0, video layer)
description: >
  Video-first reading of Fabbro Design System 0.4.0 + Fabbro Application UI 1.0.0 for Ariadne.
  Pure black ground, near-black raised surfaces, hairline borders, Inter throughout, a single
  #0088FF accent used as light — the Thread. Values are copied from ../../fabbro-design/fabbro-tokens.css;
  never invent a parallel palette.
unit: the frame — 1920×1080
principle: black canvas · one blue thread · Inter only · UI rebuilt from --fs-app-* tokens

colors:
  canvas: "#000000"
  ink: "#F4F4F5"
  accent: "#0088FF"
  accent-text: "#4DACFF"
  accent-soft: "rgba(0,136,255,0.12)"
  accent-line: "rgba(0,136,255,0.40)"
  surface: "#0A0A0B"
  surface-raised: "#111113"
  surface-strong: "#18181B"
  border: "#1C1C1F"
  border-raised: "#27272A"
  border-strong: "#3F3F46"
  text-secondary: "#D0D0D0"
  text-muted: "#A0A0A0"
  text-quiet: "#6B6B72"
  danger: "#F26D6D"
  warning: "#F0A53A"
  caution: "#E2C044"
  success: "#3ECF8E"

typography:
  display:   { fontFamily: "Inter", px: 168, weight: 900, lineHeight: 0.95, tracking: "0.02em", upper: true }
  hero:      { fontFamily: "Inter", px: 112, weight: 900, lineHeight: 1.0, tracking: "0.12em", upper: true }
  headline:  { fontFamily: "Inter", px: 96, weight: 700, lineHeight: 1.02, tracking: "-0.035em" }
  kicker:    { fontFamily: "Inter", px: 18, weight: 600, tracking: "0.18em", upper: true, color: "{colors.accent}" }
  app-title: { fontFamily: "Inter", px: 24, weight: 650, tracking: "-0.02em" }
  app-section: { fontFamily: "Inter", px: 14, weight: 600 }
  app-body:  { fontFamily: "Inter", px: 13, weight: 400, lineHeight: 1.5 }
  app-meta:  { fontFamily: "Inter", px: 11, weight: 600, tracking: "0.14em", upper: true }

spacing:
  pad-x: "120px"
  pad-y: "96px"
  radius-control: "8px"
  radius-card: "12px"
  radius-window: "14px"

components:
  app-window:
    description: "Ariadne application frame — surface {colors.surface}, 1px {colors.border-raised}, radius 14px, overlay shadow 0 24px 64px rgba(0,0,0,.62). Left Fabbro Application Sidebar (248px) with lockup, group label 'DIRECTION & EXECUTION', items Dashboard / Tasks / Opportunities; active item = 2px accent indicator + hover-strong fill."
  card:
    description: "surface-raised fill, 1px border, radius 12px; section title 14/600; metadata 11/600 tracked caps in text-quiet."
  priority-badge:
    description: "P0–P4 square chip, radius 6px. P1 danger-soft/danger, P2 warning-soft/warning, P3 caution-soft/caution, P4 border/text-muted."
  thread:
    description: "The accent as light — a 2–3px #0088FF stroke with a soft blue glow (drop-shadow 0 0 12px accent-line). It connects things; it never fills large areas."
  kicker:
    description: "Tracked uppercase 600, accent color, preceded by a short accent rule."
---

## Overview

Ariadne is a personal strategy system: Vectors → Directions → Strategic Objectives → Projects /
Tasks → Progress Signals. The video's visual metaphor is the myth: a single thread through a
labyrinth. Everything is black and quiet; the only color with voltage is the #0088FF thread.

## Composition rules

- Ground is always pure black (#000). Depth comes from near-black surfaces and hairlines, never gradients of color.
- The accent is rationed: a thread, an active indicator, a glow, a single CTA. Never a full-bleed fill.
- Display type is Inter 900 uppercase with wide tracking (Fabbro hero grammar); UI copy uses the Application UI ramp.
- All product data on screen is synthetic (the public-site synthetic workspace), never private owner data.

## Do / Don't

- Do reuse the real Ariadne UI grammar (sidebar, dashboard cards, strategy explorer, Ari Bot priority list, notice board).
- Don't introduce a second accent color. Status colors (danger / warning / caution / success) only appear as severity.
- Don't use drop shadows on type; glow is reserved for the thread.
