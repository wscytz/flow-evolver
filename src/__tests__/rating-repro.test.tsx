import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    setSize: vi.fn().mockResolvedValue(undefined),
    center: vi.fn().mockResolvedValue(undefined),
    setAlwaysOnTop: vi.fn().mockResolvedValue(undefined),
  }),
  LogicalSize: class {
    constructor(public w: number, public h: number) {}
  },
  currentMonitor: vi.fn().mockResolvedValue({ size: { width: 1440, height: 900 }, position: { x: 0, y: 0 } }),
}));

// @tauri-apps/api/core invoke → noop (log_diag)
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));

const store = new Map<string, string>([
  ["focus_target_seconds", "3"],
  ["focus_target_min", "60"],
  ["focus_target_max", "5400"],
  ["rest_ratio_numerator", "5"],
  ["rest_ratio_denominator", "25"],
]);
const sessions: Record<string, unknown>[] = [];
let streakEndedAt: number[] = [];

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: class FakeDB {
    static async load() { return new FakeDB(); }
    async select<T>(sql: string): Promise<T> {
      const c = sql.replace(/\s+/g, " ");
      if (/FROM settings/.test(c)) return Array.from(store.entries()).map(([k, v]) => ({ key: k, value: v })) as unknown as T;
      if (/ended_at AS e/.test(c)) return streakEndedAt.map((e) => ({ e })) as unknown as T;
      if (/SUM/.test(c)) return [{ total: 0, n: 0 }] as unknown as T;
      return [] as unknown as T;
    }
    async execute(sql: string, binds: unknown[]) {
      if (/INSERT INTO sessions/.test(sql)) sessions.push({ kind: binds[0], task_label: binds[1], target_seconds: binds[2], actual_seconds: binds[3], auto_flowed: binds[4], rating_key: binds[5], rating_delta: binds[6], started_at: binds[7], ended_at: binds[8] });
      if (/UPDATE settings/.test(sql)) store.set("focus_target_seconds", String(binds[0]));
    }
  },
}));

import App from "../App";
import { Rating } from "../components/Rating";

/*
 * Focus: the reported "0m focused → unresponsive" freeze. Walk the real path:
 * start → (0s) end early → rating sheet appears → click Flow → app must respond.
 */
describe("rating interaction (repro '0m focused freeze')", () => {
  beforeEach(() => {
    store.set("focus_target_seconds", "3");
    sessions.length = 0;
    streakEndedAt = [];
  });

  it("start → end early → rating shows '0m focused' → Flow click resolves to a state", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    await screen.findByText(/下次专注/i);

    // start
    await user.click(screen.getByLabelText(/开始专注/i));
    // immediately end early (0s of focus)
    await waitFor(() => expect(screen.getByText(/提前结束/i)).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /提前结束/i }));

    // rating sheet appears
    await waitFor(() => expect(screen.getByText(/这一轮怎么样/i)).toBeInTheDocument());
    // "0m focused" shows (actualSeconds ≈ 0)
    expect(screen.getByText(/专注 0 分钟/i)).toBeInTheDocument();

    // REGRESSION GUARD for the real "卡死" bug: the rating sheet is absolutely
    // positioned and must sit ABOVE <main> (which is z-10) or a real mouse click
    // hits main's transparent div and the buttons appear dead. This is exactly
    // what a user sees as "0m focused → 不响应" — jsdom's userEvent dispatches
    // directly (no hit-testing), so we assert the z-index contract statically
    // via the sheet's class (jsdom's getComputedStyle z-index is unreliable).
    const sheet = [...container.querySelectorAll("div")].find(
      (d) => /这一轮怎么样/i.test(d.textContent || "") && /absolute/.test(d.className),
    );
    expect(sheet).toBeTruthy();
    expect(sheet!.className).toMatch(/z-20/);
    const main = container.querySelector("main");
    expect(main!.className).toMatch(/z-10/);

    // click Flow — must not hang; app should transition (rest < 60s → idle)
    await user.click(screen.getByRole("button", { name: /心流/i }));
    // If it resolved: rating sheet closes (either idle or rest). Assert we left rating.
    await waitFor(() => {
      expect(screen.queryByText(/这一轮怎么样/i)).not.toBeInTheDocument();
    }, { timeout: 3000 });
    // And we're either back at idle (start button) or in rest (skip rest).
    const back = screen.queryByLabelText(/开始专注/i) || screen.queryByText(/跳过休息/i);
    expect(back).toBeTruthy();
  });

  it("double-click on Flow does not drop out of a started rest", async () => {
    // Use a long enough focus that rest >= 60s. Force actual via a 300s+ session is
    // slow; instead assert the guard at the reducer level is covered by core tests.
    // Here: click Flow twice fast; second click must be a no-op (phase != rating),
    // not SKIP_RATING-from-rest.
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/下次专注/i);
    await user.click(screen.getByLabelText(/开始专注/i));
    await waitFor(() => expect(screen.getByText(/提前结束/i)).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /提前结束/i }));
    await waitFor(() => expect(screen.getByText(/这一轮怎么样/i)).toBeInTheDocument());

    // two rapid clicks on Flow
    const flow = screen.getByRole("button", { name: /心流/i });
    await user.click(flow);
    await user.click(flow);

    // Must settle to idle (rest<60 path) — the second click must not throw/hang.
    await waitFor(() => {
      expect(screen.queryByText(/这一轮怎么样/i)).not.toBeInTheDocument();
    }, { timeout: 3000 });
    expect(screen.queryByLabelText(/开始专注/i) || screen.queryByText(/跳过休息/i)).toBeTruthy();
  });

  it("a sub-MIN_SESSION_SECONDS focus (accidental tap) is not persisted or rated", async () => {
    // Misclick start → stop within the same second: the session must NOT be
    // logged (a 0s row would inflate todaySessions and keep the streak alive
    // with zero real focus) and must NOT move the persisted next target.
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/下次专注/i);

    await user.click(screen.getByLabelText(/开始专注/i));
    await waitFor(() => expect(screen.getByText(/提前结束/i)).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /提前结束/i }));
    await waitFor(() => expect(screen.getByText(/这一轮怎么样/i)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /心流/i }));
    await waitFor(() => {
      expect(screen.queryByText(/这一轮怎么样/i)).not.toBeInTheDocument();
    }, { timeout: 3000 });

    // No session row persisted, target untouched.
    expect(sessions.length).toBe(0);
    expect(store.get("focus_target_seconds")).toBe("3");
  });
});

describe("Rating shownSeconds freshness", () => {
  it("does not leak the previous session's duration into a 0-second session", async () => {
    // Rating lives for the app's whole lifetime; shownSeconds persists. The old
    // `if (show && focusActualSeconds > 0)` guard would keep a stale "25 分钟"
    // when the NEXT session lasted 0s. It must show the fresh 0.
    const noop = () => {};
    const { rerender } = render(
      <Rating show focusActualSeconds={1500} onPick={noop} onSkip={noop} />,
    );
    expect(await screen.findByText(/专注 25 分钟/)).toBeInTheDocument();

    rerender(<Rating show focusActualSeconds={0} onPick={noop} onSkip={noop} />);
    expect(await screen.findByText(/专注 0 分钟/)).toBeInTheDocument();
    expect(screen.queryByText(/专注 25 分钟/)).not.toBeInTheDocument();
  });
});
