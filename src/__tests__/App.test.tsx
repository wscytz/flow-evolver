import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// --- Mock the Tauri window plugin BEFORE importing App ---
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    setSize: vi.fn().mockResolvedValue(undefined),
    center: vi.fn().mockResolvedValue(undefined),
    setAlwaysOnTop: vi.fn().mockResolvedValue(undefined),
  }),
  LogicalSize: class {
    constructor(public w: number, public h: number) {}
  },
  currentMonitor: vi.fn().mockResolvedValue({
    size: { width: 1440, height: 900 },
    position: { x: 0, y: 0 },
  }),
}));

// --- Mock the SQL plugin with an in-memory store ---
const store = new Map<string, string>([
  ["focus_target_seconds", "3"],
  ["focus_target_min", "60"],
  ["focus_target_max", "5400"],
  ["rest_ratio_numerator", "5"],
  ["rest_ratio_denominator", "25"],
]);
const sessions: Record<string, unknown>[] = [];
// Optional: seed the streak query with raw ended_at timestamps.
let streakEndedAt: number[] = [];

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: class FakeDB {
    static async load() {
      return new FakeDB();
    }
    async select<T>(sql: string): Promise<T> {
      const compact = sql.replace(/\s+/g, " ");
      if (/FROM settings/.test(compact)) {
        return Array.from(store.entries()).map(([key, value]) => ({ key, value })) as unknown as T;
      }
      if (/ended_at AS e/.test(compact)) {
        return streakEndedAt.map((e) => ({ e })) as unknown as T;
      }
      if (/SUM/.test(compact)) return [{ total: 0, n: 0 }] as unknown as T;
      return [] as unknown as T;
    }
    async execute(sql: string, binds: unknown[]) {
      if (/INSERT INTO sessions/.test(sql)) {
        sessions.push({
          kind: binds[0], task_label: binds[1], target_seconds: binds[2],
          actual_seconds: binds[3], auto_flowed: binds[4], rating_key: binds[5],
          rating_delta: binds[6], started_at: binds[7], ended_at: binds[8],
        });
      }
      if (/UPDATE settings/.test(sql)) store.set("focus_target_seconds", String(binds[0]));
    }
  },
}));

import App from "../App";
import { getStats, loadConfig } from "../db";

/*
 * NOTE on coverage strategy:
 * The deep state-machine behavior (auto-flow silent flip, heuristic clamping,
 * rating → next-target → rest derivation, persistence record shape) is proven
 * exhaustively in core.test.ts against the REAL reducer and heuristic code,
 * with zero jsdom/Framer flakiness. Those are the load-bearing tests. The
 * getStats timezone/streak behavior is covered in its own describe() below.
 *
 * Here we assert only what jsdom can reliably observe about the component tree:
 * the app mounts, loads config from the SQL mock, and renders the idle screen
 * with the seed start button. Driving Framer Motion's AnimatePresence through a
 * full click→auto-flow→rate flow under jsdom is flaky and adds no real signal
 * beyond what the pure-logic tests already cover, so we don't fight it.
 */
describe("App", () => {
  beforeEach(() => {
    store.set("focus_target_seconds", "3");
    sessions.length = 0;
  });

  it("mounts, loads config from the SQL plugin, and renders the idle screen", async () => {
    render(<App />);
    // idle screen shows the next-focus target (proves async config load worked)
    expect(await screen.findByText(/下次专注/i)).toBeInTheDocument();
    // the seed start button is present
    expect(screen.getByLabelText(/开始专注/i)).toBeInTheDocument();
    // stats strip renders (loads via getStats)
    expect(await screen.findByText(/今日/i)).toBeInTheDocument();
  });

  it("clicking start switches the window to expanded mode (proof START_FOCUS ran)", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    await screen.findByText(/下次专注/i);

    const root = container.firstChild as HTMLElement;
    expect(root.getAttribute("data-mode")).toBe("small");

    await user.click(screen.getByLabelText(/开始专注/i));

    // data-mode is bound to winMode state, which startFocus() flips.
    // This reliably proves the click handler dispatched without depending on
    // Framer's exit animation settling.
    await waitFor(() => {
      expect(root.getAttribute("data-mode")).toBe("expanded");
    });
  });
});

describe("loadConfig corruption resilience", () => {
  beforeEach(() => {
    // reset to sane defaults first
    store.set("focus_target_seconds", "1500");
    store.set("focus_target_min", "600");
    store.set("focus_target_max", "5400");
    store.set("rest_ratio_numerator", "5");
    store.set("rest_ratio_denominator", "25");
  });

  it("falls back to defaults when a setting is corrupted (NaN)", async () => {
    store.set("focus_target_seconds", "not-a-number");
    store.set("rest_ratio_denominator", "abc");
    const cfg = await loadConfig();
    expect(cfg.focusTarget).toBe(1500); // fallback, not NaN
    expect(Number.isNaN(cfg.restRatio)).toBe(false);
    expect(Number.isFinite(cfg.restRatio)).toBe(true);
  });

  it("repairs min-above-max bounds", async () => {
    store.set("focus_target_min", "5400");
    store.set("focus_target_max", "600");
    const cfg = await loadConfig();
    expect(cfg.focusMin).toBe(600);
    expect(cfg.focusMax).toBe(5400);
  });

  it("clamps focusTarget into [focusMin, focusMax] (stray stored value)", async () => {
    // Inside safeNumber's [60, 86400] band but outside the heuristic window —
    // only reachable via manual edit / an old version, but it must not become
    // a 2-minute (or 3-hour) session target.
    store.set("focus_target_seconds", "120");
    expect((await loadConfig()).focusTarget).toBe(600); // focusMin
    store.set("focus_target_seconds", "9999");
    expect((await loadConfig()).focusTarget).toBe(5400); // focusMax
  });
});

describe("getStats streak timezone", () => {
  const savedTZ = process.env.TZ;

  afterEach(() => {
    if (savedTZ === undefined) delete process.env.TZ;
    else process.env.TZ = savedTZ;
    streakEndedAt = [];
    sessions.length = 0;
  });

  it("does not merge a local just-past-midnight session into the previous UTC day", async () => {
    // UTC+8, no DST → deterministic regardless of host machine's tz.
    process.env.TZ = "Asia/Shanghai";
    // "Now": local 2026-08-12 01:00 (+08). In UTC that is 2026-08-11 17:00,
    // so a UTC day-index would claim "today" is the 11th.
    const now = Date.parse("2026-08-12T01:00:00+08:00");
    // Two consecutive LOCAL calendar days:
    //   A = local 08-11 23:50  (UTC 08-11 15:50 → old code buckets: 11th)
    //   B = local 08-12 00:30  (UTC 08-11 16:30 → old code ALSO buckets: 11th!)
    // Old behavior: both land on UTC day 11 → streak 1 (the 12th is invisible).
    // Correct behavior: A is 08-11, B is 08-12 → streak 2.
    const sessionA = Date.parse("2026-08-11T23:50:00+08:00");
    const sessionB = Date.parse("2026-08-12T00:30:00+08:00");
    streakEndedAt = [sessionA, sessionB];

    const stats = await getStats(now);
    expect(stats.streakDays).toBe(2);
  });

  it("counts an early-morning session as the local day, so a 3-day run across a local-midnight boundary stays 3", async () => {
    process.env.TZ = "Asia/Shanghai";
    const now = Date.parse("2026-08-12T09:00:00+08:00"); // UTC 08-12 01:00
    // 08-10 evening, 08-11 evening, 08-12 early-morning → 3 consecutive local days.
    streakEndedAt = [
      Date.parse("2026-08-10T23:00:00+08:00"), // UTC 08-10 15:00
      Date.parse("2026-08-11T23:00:00+08:00"), // UTC 08-11 15:00
      Date.parse("2026-08-12T01:00:00+08:00"), // UTC 08-11 17:00 ← would fold into 11th
    ];
    const stats = await getStats(now);
    expect(stats.streakDays).toBe(3);
  });
});

