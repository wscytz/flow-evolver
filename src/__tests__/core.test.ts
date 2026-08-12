/**
 * Core logic tests — run under vitest (also runnable standalone via tsx).
 */
import { describe, it, expect } from "vitest";
import {
  elapsedSeconds,
  remainingSeconds,
  formatClock,
  fatigue,
} from "../timer/engine";
import { reducer, EMPTY_TIMER } from "../timer/reducer";
import type { RatingKey } from "../timer/reducer";
import {
  nextFocusTarget,
  restSecondsFor,
  RATING_DEFS,
} from "../timer/heuristic";

const CFG = { focusTarget: 1500, focusMin: 600, focusMax: 5400, restRatio: 0.2 };

describe("engine", () => {
  it("elapsed derives from startedAt, not interval accumulation", () => {
    const s = { phase: "focus" as const, startedAt: 1000, targetSeconds: 60, taskLabel: "" };
    expect(elapsedSeconds(s, 16000)).toBe(15);
    expect(elapsedSeconds(s, 61000)).toBe(60);
  });

  it("remaining goes negative past target (auto-flow display)", () => {
    const s = { phase: "focus" as const, startedAt: 0, targetSeconds: 60, taskLabel: "" };
    expect(remainingSeconds(s, 30000)).toBe(30);
    expect(remainingSeconds(s, 70000)).toBe(-10);
  });

  it("formatClock renders mm:ss with sign", () => {
    expect(formatClock(1500)).toBe("25:00");
    expect(formatClock(59)).toBe("00:59");
    expect(formatClock(-65)).toBe("-01:05");
  });
});

describe("reducer auto-flow", () => {
  it("REACHED_TARGET flips focus → autoflow WITHOUT resetting startedAt", () => {
    const started = reducer(EMPTY_TIMER, { type: "START_FOCUS", now: 0, targetSeconds: 60, taskLabel: "x" });
    const auto = reducer(started, { type: "REACHED_TARGET" });
    expect(auto.phase).toBe("autoflow");
    expect(auto.startedAt).toBe(0);
    expect(auto.targetSeconds).toBe(60);
    expect(remainingSeconds(auto, 70000)).toBe(-10);
  });

  it("STOP_FOCUS from autoflow goes to rating", () => {
    const s = { phase: "autoflow" as const, startedAt: 0, targetSeconds: 60, taskLabel: "x" };
    expect(reducer(s, { type: "STOP_FOCUS", now: 70000 }).phase).toBe("rating");
  });

  it("RATE drops into rest with derived rest seconds", () => {
    const s = { phase: "rating" as const, startedAt: null, targetSeconds: 0, taskLabel: "x" };
    const r = reducer(s, {
      type: "RATE",
      now: 100,
      rating: "good",
      deltaMinutes: 0,
      nextFocusTarget: 1500,
      restSeconds: 300,
      taskLabel: "x",
    });
    expect(r.phase).toBe("rest");
    expect(r.targetSeconds).toBe(300);
    expect(r.startedAt).toBe(100);
  });

  it("SKIP_REST / STOP_REST return to idle", () => {
    const s = { phase: "rest" as const, startedAt: 0, targetSeconds: 300, taskLabel: "" };
    expect(reducer(s, { type: "SKIP_REST" }).phase).toBe("idle");
    expect(reducer(s, { type: "STOP_REST" }).phase).toBe("idle");
  });

  it("SKIP_RATING is guarded to the rating phase (can't cancel a started rest)", () => {
    // The double-click case: RATE already moved us into rest, then a stale
    // SKIP_RATING arrives (second click during the sheet's exit). It must NOT
    // drop us back to idle and cancel the rest.
    const rest = { phase: "rest" as const, startedAt: 1000, targetSeconds: 300, taskLabel: "" };
    const after = reducer(rest, { type: "SKIP_RATING", now: 1100 });
    expect(after.phase).toBe("rest");
    expect(after.startedAt).toBe(1000); // rest preserved
    // And it still works from the rating phase itself.
    const rating = { phase: "rating" as const, startedAt: null, targetSeconds: 0, taskLabel: "" };
    expect(reducer(rating, { type: "SKIP_RATING", now: 1100 }).phase).toBe("idle");
  });

  it("RATE is guarded to the rating phase", () => {
    const s = { phase: "idle" as const, startedAt: null, targetSeconds: 0, taskLabel: "" };
    const r = reducer(s, {
      type: "RATE", now: 100, rating: "flow", deltaMinutes: 10,
      nextFocusTarget: 2100, restSeconds: 300, taskLabel: "x",
    });
    expect(r.phase).toBe("idle"); // no-op outside rating
  });
});

describe("heuristic", () => {
  it("flow adds 10m, clamped at focusMax", () => {
    expect(nextFocusTarget(1500, "flow", CFG)).toBe(1500 + 600);
    expect(nextFocusTarget(CFG.focusMax - 300, "flow", CFG)).toBe(CFG.focusMax);
  });

  it("distracted subtracts 5m, clamped at focusMin", () => {
    expect(nextFocusTarget(1500, "distracted", CFG)).toBe(1500 - 300);
    expect(nextFocusTarget(CFG.focusMin + 120, "distracted", CFG)).toBe(CFG.focusMin);
  });

  it("rest scales with actual focus length via restRatio", () => {
    expect(restSecondsFor(1500, CFG)).toBe(300);
    expect(restSecondsFor(3000, CFG)).toBe(600);
  });

  it("fatigue climbs past 1.0 in auto-flow (drives blob agitation)", () => {
    const s = { phase: "autoflow" as const, startedAt: 0, targetSeconds: 60, taskLabel: "" };
    expect(fatigue(s, 0)).toBe(0);
    expect(fatigue(s, 60000)).toBe(1);
    expect(fatigue(s, 90000)).toBeGreaterThan(1);
  });

  it("rating deltas are exactly the report's four buckets", () => {
    const expected: Record<RatingKey, number> = { flow: 10, focus: 5, good: 0, distracted: -5 };
    (Object.keys(expected) as RatingKey[]).forEach((k) => {
      expect(RATING_DEFS[k].deltaMinutes).toBe(expected[k]);
    });
  });
});
