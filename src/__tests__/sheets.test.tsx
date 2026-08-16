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
// Rows returned by the history query (getRecentSessions).
let recentRows: Record<string, unknown>[] = [];

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: class FakeDB {
    static async load() { return new FakeDB(); }
    async select<T>(sql: string): Promise<T> {
      const c = sql.replace(/\s+/g, " ");
      if (/FROM settings/.test(c)) return Array.from(store.entries()).map(([k, v]) => ({ key: k, value: v })) as unknown as T;
      if (/ORDER BY id DESC/.test(c)) return recentRows as unknown as T;
      if (/ended_at AS e/.test(c)) return streakEndedAt.map((e) => ({ e })) as unknown as T;
      if (/SUM/.test(c)) return [{ total: 0, n: 0 }] as unknown as T;
      return [] as unknown as T;
    }
    async execute(sql: string, binds: unknown[]) {
      const c = sql.replace(/\s+/g, " ");
      if (/INSERT INTO sessions/.test(c)) sessions.push({ kind: binds[0] });
      if (/ON CONFLICT\(key\)/.test(c)) store.set(String(binds[0]), String(binds[1]));
      if (/UPDATE settings/.test(c)) store.set("focus_target_seconds", String(binds[0]));
    }
  },
}));

import App from "../App";

describe("settings sheet", () => {
  beforeEach(() => {
    store.set("focus_target_seconds", "3");
    store.set("focus_target_min", "60");
    store.set("focus_target_max", "5400");
    store.set("rest_ratio_numerator", "5");
    store.set("rest_ratio_denominator", "25");
    sessions.length = 0;
    recentRows = [];
    streakEndedAt = [];
  });

  it("opens from the idle header, edits bounds, saves, and applies immediately", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/下次专注/i);

    // open settings
    await user.click(screen.getByRole("button", { name: "设置" }));
    expect(await screen.findByRole("dialog", { name: "设置" })).toBeInTheDocument();

    // 下限 60s → 1min displayed; raise it to 15 min
    const min = screen.getByLabelText("下限");
    await user.clear(min);
    await user.type(min, "15");

    // 上限 5400s → 90 min; the target (3s seed → clamped display) stays sane
    await user.click(screen.getByRole("button", { name: "保存" }));

    // sheet closes on success
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "设置" })).not.toBeInTheDocument();
    });

    // DB got seconds + all five keys via UPSERT binds
    expect(store.get("focus_target_min")).toBe("900");
    expect(store.get("focus_target_max")).toBe("5400");
    expect(store.get("rest_ratio_numerator")).toBe("5");
    expect(store.get("rest_ratio_denominator")).toBe("25");

    // in-memory config applied: next focus target now clamps into [15,90]min
    // (stored target was 3s → display clamps to min)
    expect(await screen.findByText(/下次专注 · 15 分钟/i)).toBeInTheDocument();
  });

  it("rejects max <= min with an error and keeps the sheet open", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/下次专注/i);

    await user.click(screen.getByRole("button", { name: "设置" }));
    await screen.findByRole("dialog", { name: "设置" });

    const max = screen.getByLabelText("上限");
    await user.clear(max);
    await user.type(max, "5"); // min is 1 (60s) — wait, seed min=60s → 1min; 5 > 1 fine. Use min bigger:
    const min = screen.getByLabelText("下限");
    await user.clear(min);
    await user.type(min, "30"); // min 30 > max 5 → invalid

    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/上限必须大于下限/);
    expect(screen.getByRole("dialog", { name: "设置" })).toBeInTheDocument();
    // nothing persisted
    expect(store.get("focus_target_min")).toBe("60");
  });

  it("settings and history buttons are hidden while a session runs", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/下次专注/i);

    await user.click(screen.getByLabelText(/开始专注/i));
    await waitFor(() => expect(screen.getByText(/提前结束/i)).toBeInTheDocument());

    expect(screen.queryByRole("button", { name: "设置" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "历史" })).not.toBeInTheDocument();
  });
});

describe("history sheet", () => {
  beforeEach(() => {
    store.set("focus_target_seconds", "3");
    sessions.length = 0;
    streakEndedAt = [];
  });

  it("shows recent sessions newest-first with rating/autoflow marks", async () => {
    recentRows = [
      { id: 3, kind: "focus", task_label: "写周报", target_seconds: 1500, actual_seconds: 2400, auto_flowed: 1, rating_key: "flow", rating_delta: 10, started_at: 1, ended_at: Date.parse("2026-08-16T10:00:00+08:00") },
      { id: 2, kind: "rest", task_label: null, target_seconds: 300, actual_seconds: 280, auto_flowed: 0, rating_key: null, rating_delta: null, started_at: 1, ended_at: Date.parse("2026-08-16T09:30:00+08:00") },
      { id: 1, kind: "focus", task_label: null, target_seconds: 1500, actual_seconds: 900, auto_flowed: 0, rating_key: "distracted", rating_delta: -5, started_at: 1, ended_at: Date.parse("2026-08-15T22:00:00+08:00") },
    ];
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/下次专注/i);

    await user.click(screen.getByRole("button", { name: "历史" }));
    const dlg = await screen.findByRole("dialog", { name: "历史记录" });

    // rows render: task label, autoflow mark, rating label, minutes
    expect(dlg).toHaveTextContent("写周报");
    expect(dlg).toHaveTextContent("自动流");
    expect(dlg).toHaveTextContent("心流");
    expect(dlg).toHaveTextContent("40分");
    expect(dlg).toHaveTextContent("休息");
    expect(dlg).toHaveTextContent("分心");
    expect(dlg).toHaveTextContent("15分");
  });

  it("renders an empty state when there are no sessions", async () => {
    recentRows = [];
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/下次专注/i);

    await user.click(screen.getByRole("button", { name: "历史" }));
    expect(await screen.findByRole("dialog", { name: "历史记录" })).toHaveTextContent(/还没有记录/);
  });
});
