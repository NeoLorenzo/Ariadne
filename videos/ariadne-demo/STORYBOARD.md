---
format: 1920x1080
duration: 41.2s
message: "Ariadne turns where you want to go into what you do next."
arc: Tangle → Thread → Direction → Chain → Priority → Signals → Find your thread
audience: builders and ambitious people juggling several life directions at once
mode: autonomous
music: composed + synthesised in code — tools/compose.py → assets/bgm/ariadne-score.mp3 (117.1875 bpm, bar 0 at 0.256s; A minor → C major)
captions: skipped (music-only film, no narration)
---

## Video direction

- **Metaphor:** the myth. A tangle of busywork → one #0088FF thread through an eight-ring labyrinth (the eight
  vectors) → that same thread runs through every UI shot, connecting direction to today's task.
- **Grammar:** pure black ground, Fabbro Application UI rebuilt from `--fs-app-*` tokens, Inter only. Each product
  beat opens with a huge Inter 900 tracked-caps headline (Fabbro hero grammar) that shrinks into a kicker while the
  UI rises beneath it in 3D perspective. A macOS cursor drives real interactions (click ripples, hover states).
- **Camera:** every UI frame has a macro camera move underneath (rise-and-settle, punch-in, pan along the thread).
  Cuts land on bar lines of the music; in-frame reveals land on beats.
- **Motion feel:** expo/power4 outs for arrivals, short motion-blur on fast moves, no bouncy overshoot on UI; the
  thread always draws with a bright leading head and soft glow.
- **Data:** synthetic workspace from `components/public-site/syntheticWorkspace.js` only.

## Frame 1 — Busy is not moving

- scene: Chaotic cloud of task chips drifts in depth; BUSY ≠ MOVING slams in; everything collapses into one blue point
- duration: 4.352s
- poster: 2.2s
- transition_in: cut
- status: animated
- blueprint: compose
- focal: kinetic headline over a depth field of task chips
- asset_candidates: none (typographic + rebuilt UI chips)
- src: compositions/frames/01-tangle.html
- handoff_out: blue point — x 960, y 540, scale 1, opacity 1, static

Scene 1 (0.0–1.6s): 26 task chips (surface-raised pills, 13–20px Inter) fly in from beyond all four edges on three
depth layers (near chips larger + blurred), slow rotation; "BUSY" slams in centre at 0.25s (scale 1.25→1, blur→0).
Scene 2 (1.6–2.8s): "≠" then "MOVING." land on beats; chips keep drifting, jittering between directions.
Scene 3 (2.8–4.0s): a single blue point ignites at centre; every chip and the headline are pulled into it (power4.in),
leaving only the glowing point on black.

## Frame 2 — The thread

- scene: Eight-ring labyrinth ripples out from the point; the blue thread solves it to the centre; Ariadne mark + TURN DIRECTION INTO ACTION.
- duration: 6.144s
- poster: 4.6s
- transition_in: cut
- status: animated
- blueprint: compose
- focal: labyrinth + thread, then the Ariadne lockup
- asset_candidates: assets/brand/ariadne-mark.svg
- src: compositions/frames/02-thread.html
- handoff_in: blue point — x 960, y 540, scale 1, opacity 1, static

Scene 1 (0.0–1.0s): the point pulses; eight labyrinth rings ripple outward from it, drawing on (stroke), radial
blocking walls fade in; the eight vector names orbit-fade around the outer ring.
Scene 2 (0.8–3.4s): the thread enters from the outer passage and solves the maze to the centre — bright head dot,
blue glow trail; camera slowly rotates the maze −8°.
Scene 3 (3.4–4.6s): centre flares; the Ariadne mark draws and fills at centre; maze dims to 25%; ARIADNE wordmark
tracks in beneath, then "TURN DIRECTION INTO ACTION." (hero, 0.12em tracking).
Scene 4 (4.6–6.0s): camera pushes into the mark (scale 1 → 7) with blur — the dive into the product.

## Frame 3 — Set direction

- scene: Ariadne dashboard rises in 3D; eight vector scores count up; three concurrent directions; cursor clicks "Become a credible ML researcher"
- duration: 6.144s
- poster: 4.5s
- transition_in: crossfade
- status: animated
- blueprint: compose
- focal: rebuilt Ariadne dashboard (Fabbro Application Sidebar + cards)
- asset_candidates: assets/brand/ariadne-lockup.svg
- src: compositions/frames/03-direction.html
- handoff_out: selected direction card — punched-in, blue border lit, opacity 1

Scene 1 (0.0–1.3s): "SET YOUR DIRECTION." fills the frame while the app window rises from below in perspective
(rotateX 24°→0, y 420→0); headline shrinks into the top-left kicker.
Scene 2 (1.3–3.0s): Current position: eight vector tiles count up (Physical 62 … Experiential 68) with bars filling.
Scene 3 (3.0–4.2s): Active directions — three cards stagger up; cursor glides in from bottom right.
Scene 4 (4.2–6.0s): camera punches in on the first direction card; click at 4.8s (ripple); card border lights blue;
"2 objectives · 3 tasks" chip appears.

## Frame 4 — Pull any thread

- scene: Strategy explorer — direction → objectives → tasks; blue threads draw across columns; camera follows the thread
- duration: 6.144s
- poster: 4.2s
- transition_in: cut
- status: animated
- blueprint: compose
- focal: three-column strategy explorer with animated connectors
- asset_candidates: none (rebuilt UI)
- src: compositions/frames/04-chain.html

Scene 1 (0.0–1.1s): "PULL ANY THREAD." headline; explorer panel rises; all rows dim.
Scene 2 (1.1–2.0s): Direction "Become a credible ML researcher" selects (blue border); unrelated rows dim to 30%.
Scene 3 (2.0–4.2s): threads draw direction → two objectives → three tasks with a travelling light pulse; each item lights
as the thread arrives; camera pans right following the thread head.
Scene 4 (4.2–6.0s): priority badges pop on the tasks (P1, P1, P2); footer "What it drives" bar fills in.

## Frame 5 — Priority, with context

- scene: Ari Bot panel; cursor hits Reprioritize; scan beam reads five signals; rows re-sort; the reason expands
- duration: 8.192s
- poster: 5.8s
- transition_in: cut
- status: animated
- blueprint: compose
- focal: Ari Bot priority list re-sorting (FLIP)
- asset_candidates: none (rebuilt UI)
- src: compositions/frames/05-priority.html

Scene 1 (0.0–1.2s): "PRIORITY, WITH CONTEXT." headline; Ari Bot panel rises.
Scene 2 (1.2–2.6s): cursor to Reprioritize; click at 2.1s; status reads "Reading directions, objectives and deadlines…".
Scene 3 (2.6–4.0s): a blue scan beam sweeps down the list; each row's five signal bars grow as it passes.
Scene 4 (4.0–5.6s): rows re-sort — Apply: Frontier Safety Fellowship P3→P1 rises to the top, reading list P2→P4 sinks;
badges flip.
Scene 5 (5.6–8.0s): camera punches into the top row; its reason expands: advances "Earn a place in a research lab" ·
closes in 3d.

## Frame 6 — Know when work stalls

- scene: Repository heatmap sweeps in; a repo goes quiet; severity notices stack in
- duration: 4.096s
- poster: 3.4s
- transition_in: cut
- status: animated
- blueprint: compose
- focal: notice board + repository activity heatmap
- asset_candidates: none (rebuilt UI)
- src: compositions/frames/06-signals.html

Scene 1 (0.0–0.9s): "KNOW WHEN WORK STALLS." headline; two panels rise.
Scene 2 (0.9–2.4s): heatmap cells fill left→right; thesis-experiments flatlines, its "19d" turns orange.
Scene 3 (2.2–4.0s): notices slide in on beats — Danger, Major warning, Warning, Deadline.

## Frame 7 — Find your thread

- scene: The UI pieces float in depth, one thread weaves through them, gathers into the Ariadne mark; FIND YOUR THREAD.
- duration: 6.144s
- poster: 5.4s
- transition_in: blur-crossfade
- status: animated
- blueprint: compose
- focal: the thread → Ariadne lockup end card
- asset_candidates: assets/brand/ariadne-mark.svg, assets/brand/fabbro-mark.svg
- src: compositions/frames/07-close.html

Scene 1 (0.0–1.8s): direction card, objective, task, notice and vector tile float at depth; a single thread weaves
through all five while the camera pulls back.
Scene 2 (1.8–3.0s): cards fall away into black; the thread gathers to centre and the Ariadne mark forms.
Scene 3 (3.0–6.0s): ARIADNE lockup, "FIND YOUR THREAD." hero line, "A Fabbro Systems product" endorsement; quiet settle.
