# Flow Evolver

An adaptive focus timer that **refuses to interrupt you when you're in the zone.**

The classic pomodoro countdown has one fatal flaw: when you finally hit a flow
state, the bell rings and shatters it. Flow Evolver inverts that. When the
target time elapses it does **nothing** — no sound, no popup. It silently flips
to counting *up* (`+01:23 …`), protecting your hyperfocus for as long as it
lasts. When you decide to stop, you rate the session in one tap, and that
rating nudges the *next* target up or down. Over time the timer tunes itself to
your own rhythm.

Built as a Tauri v2 desktop app for macOS (Apple Silicon + Intel).

---

## What it does

- **Auto-flow.** Countdown hits zero → timer silently switches to count-up.
  You keep working. The blob in the background slowly shifts from calm brown
  to agitated blood-orange the longer you overdraw, so you *feel* the load
  without being interrupted.
- **Four-bucket self-rating.** When you stop, pick Flow / Focused / Okay /
  Distracted. Each carries a fixed target delta (+10 / +5 / 0 / −5 min),
  clamped to a sane 10–90 min window. The next session targets the new value.
- **Rest, derived.** After a focus session you get a rest proportional to how
  long you actually focused (default 5 min per 25 min). Skippable.
- **Lightweight task tagging.** Optional one-line label for what you're working
  on. No projects, no lists — just context.
- **Stats.** Today's focus time, session count, and a day streak, stored
  locally in SQLite.
- **Small window + expand.** Lives as a 360×480 window you can pin on top; one
  tap expands it. No true OS-fullscreen (that hides the title bar and steals a
  macOS space — too heavy for a focus widget).

## Honest scope (what this is *not*)

This is a focused single-purpose tool, not the "neuro-adaptive engine" from a
marketing deck. Specifically:

- The blob's color/morph speed is a **behavioral proxy** for time spent, not a
  measurement of your prefrontal metabolism. The app cannot read your brain
  state; it can only show that time is passing.
- The heuristic is a **simple, explainable four-bucket rule**, deliberately not
  a hidden ML model. The whole pitch is that you can see and reason about how
  the target moves.
- No EEG, no context-aware app blocking, no multiplayer. Those are out of scope
  here (see the design notes that motivated this project).

## Design decisions

| Choice | Why |
|---|---|
| **Tauri** (not Electron/web) | Small native binary, real always-on-top window, local SQLite. A focus tool that lives on the desktop. |
| **Timestamp-based timer** | Elapsed is derived from `Date.now() - startedAt`, not `setInterval` accumulation. Survives window suspension / system sleep; the auto-flow count-up is just `remaining < 0`. |
| **Single window, CSS-adaptive** | One React tree, two layouts. `setSize` toggles small↔expanded. Simpler than two windows, blob transitions stay smooth. |
| **Neo-brutalism, tuned** | Three colors only (warm off-white, deep brown, blood orange), giant tabular numerals, no rounding/shadows. Adjusted just enough for desktop readability. |
| **`useReducer` state machine** | `idle → focus → autoflow → rating → rest → idle`. All transitions are pure and unit-tested; persistence lives in effect hooks, not the reducer. |

## Getting started

```bash
# prerequisites: Node 20+, Rust stable, Xcode command-line tools
npm install

# run in dev (hot reload)
npm run tauri dev

# tests (logic + component)
npm test

# production build → .app + .dmg
npm run tauri build
```

Build output:

```
src-tauri/target/release/bundle/macos/flow-evolver.app
src-tauri/target/release/bundle/dmg/flow-evolver_0.1.0_aarch64.dmg
```

## Project layout

```
src/
  timer/
    engine.ts     # pure time math (timestamps, remaining, fatigue, formatting)
    reducer.ts    # the focus session state machine
    heuristic.ts  # four-bucket rating → next-target adjustment + rest derivation
  blob.ts         # SVG path dictionary, morph duration & color from fatigue
  db.ts           # SQLite via tauri-plugin-sql (sessions + settings)
  window.ts       # small/expanded window sizing, always-on-top
  components/
    Blob.tsx      # the morphing hero shape + idle seed
    Timer.tsx     # giant countdown / count-up
    Rating.tsx    # the four-bucket rating sheet
    Stats.tsx     # today / sessions / streak strip
  App.tsx         # orchestration: state, ticking, persistence, layout
  index.css       # Tailwind v4 + OKLCH neo-brutalism theme
src-tauri/
  src/lib.rs              # hosts the SQL plugin + migrations
  src/migrations/         # 001 sessions, 002 settings
  capabilities/           # sql + core permissions
  tauri.conf.json         # 360×480 window config
```

## Testing

- **`core.test.ts`** (12 tests) — engine math, the silent auto-flow flip (proven
  to keep `startedAt` so elapsed keeps growing past target), reducer
  transitions, heuristic clamping, rest derivation, the four-bucket deltas.
- **`App.test.tsx`** (2 tests) — the app mounts, loads config from the SQL
  mock, renders the idle screen, and clicking start dispatches into the
  running view.

Run with `npm test`.

## Tunables

Defaults live in `src-tauri/src/migrations/002_settings.sql` and persist in the
`settings` table:

| key | default | meaning |
|---|---|---|
| `focus_target_seconds` | 1500 (25m) | next session target, adjusted by ratings |
| `focus_target_min` / `_max` | 600 / 5400 | clamp window (10–90 min) |
| `rest_ratio_numerator` / `_denominator` | 5 / 25 | rest minutes per focus minute |

## License

MIT.
