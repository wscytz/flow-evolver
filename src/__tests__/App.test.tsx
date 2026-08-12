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
      if (/DISTINCT/.test(compact)) return [] as unknown as T;
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

/*
 * NOTE on coverage strategy:
 * The deep state-machine behavior (auto-flow silent flip, heuristic clamping,
 * rating → next-target → rest derivation, persistence record shape) is proven
 * exhaustively in core.test.ts and session.sim.ts against the REAL reducer and
 * heuristic code, with zero jsdom/Framer flakiness. Those are the load-bearing
 * tests.
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
    expect(await screen.findByText(/next focus/i)).toBeInTheDocument();
    // the seed start button is present
    expect(screen.getByLabelText(/start focus/i)).toBeInTheDocument();
    // stats strip renders (loads via getStats)
    expect(await screen.findByText(/today/i)).toBeInTheDocument();
  });

  it("clicking start switches the window to expanded mode (proof START_FOCUS ran)", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    await screen.findByText(/next focus/i);

    const root = container.firstChild as HTMLElement;
    expect(root.getAttribute("data-mode")).toBe("small");

    await user.click(screen.getByLabelText(/start focus/i));

    // data-mode is bound to winMode state, which startFocus() flips.
    // This reliably proves the click handler dispatched without depending on
    // Framer's exit animation settling.
    await waitFor(() => {
      expect(root.getAttribute("data-mode")).toBe("expanded");
    });
  });
});
