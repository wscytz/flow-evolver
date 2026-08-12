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
  without being interrupted. During rest the blob stays calm until the rest
  target elapses, then agitates — a gentle "time to get back to work" cue,
  not another countdown pressuring you.
- **Four-bucket self-rating (中文界面).** When you stop, pick 心流 (+10m) /
  专注 (+5m) / 一般 (0) / 分心 (−5m), clamped to a sane 10–90 min window.
  The next session targets the new value.
- **Rest, derived.** After a focus session you get a rest proportional to how
  long you actually focused (default 5 min per 25 min). Skippable.
- **Lightweight task tagging.** Optional one-line label for what you're working
  on. No projects, no lists — just context.
- **Stats.** Today's focus time, session count, and a day streak, stored
  locally in SQLite.
- **Small window + expand.** Lives as a 360×480 window you can pin on top; one
  tap expands it. No true OS-fullscreen (that hides the title bar and steals a
  macOS space — too heavy for a focus widget).

## One focus session, end to end

```
待机 idle ──点开始──▶ 专注 focus ──到点(不打断)──▶ 自动流 autoflow
  ▲                                                   │
  │                                                   │ 点"提前结束"
  │                休息 rest ◀──(评分)─── 评分 rating ◀┘
  │                  │
  └──休息结束/跳过────┘
```

1. **待机** — 显示下一目标(如 25 分钟)、任务输入框、开始按钮、底部统计条。
2. **专注** — 倒计时,背景 blob 缓慢蠕动,窗口自动展开。
3. **自动流** — 到点**不响不弹**,静默转正向计时 `+00:01…`,blob 加速变橙。
4. **评分** — 点"提前结束"后快照本轮实际秒数,弹出四档:心流/专注/一般/分心。
5. **休息** — 按实际专注时长按比例派生(默认 5 分钟/25 分钟);不足 1 分钟直接跳过。
6. **回到待机** — 下一目标已被你的自评悄悄调整(±档位,clamp 10–90 分钟)。

Every transition is a pure `useReducer` action; persistence happens in effect
hooks that watch phase changes, so the state machine stays testable.

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

## Icon

The app icon (macOS `.icns` + Windows `.ico` + all PNG sizes) is generated from
`src-tauri/icons/source/icon.svg` — a hand-drawn replica of the app's blob in
the neo-brutalist palette (warm off-white field, blood-orange organic body,
deep-brown center core). Regenerate with:

```bash
# 1. render the SVG to a 1024px master (headless Chrome keeps vector precision)
# 2. sips-resize into the iconset, iconutil → .icns, sips → .ico
# see src-tauri/icons/source/ for the master and the .html source
```

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

- **`core.test.ts`** (15 tests) — engine math, the silent auto-flow flip (proven
  to keep `startedAt` so elapsed keeps growing past target), reducer
  transitions + guards (START_FOCUS, RATE, SKIP_RATING), heuristic clamping,
  rest derivation, the four-bucket deltas.
- **`App.test.tsx`** (7 tests) — the app mounts, loads config from the SQL
  mock, clicking start expands the window, getStats streak timezone (UTC+8
  local-midnight cases), and loadConfig corruption resilience (NaN fallback,
  min/max repair, stray target clamped into `[min, max]`).
- **`rating-repro.test.tsx`** (3 tests) — the reported "0m focused 不响应"
  freeze: start → end early → rating sheet → pick 心流 → app responds; plus
  double-click on a rating bucket can't cancel a started rest, and the sheet's
  "专注 X 分钟" label never leaks the previous session's duration into a
  0-second one. Includes a static z-index contract check (sheet z-20 > main
  z-10) — the root cause of the freeze was real mouse clicks hitting main's
  transparent div.
- **`Blob.test.tsx`** (2 tests) — morph steps on the fatigue→duration mapping,
  and a regression that the blob keeps morphing while fatigue drifts each tick
  (the old `setInterval(dur)` was re-created before its deadline and froze).
- **`window.test.ts`** (2 tests) — expanded-mode sizing converts the monitor's
  physical work-area into logical units via the scale factor (a Retina 2x bug
  that made "expanded" clamp to fullscreen), and small keeps the fixed size.

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
