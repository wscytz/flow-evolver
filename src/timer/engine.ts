/**
 * Timer engine — pure functions. No React, no side effects.
 *
 * Time model (Decision B from design): everything is anchored to an epoch-ms
 * `startedAt`. Elapsed is derived: `now - startedAt`. This survives window
 * suspension, system sleep, and throttled background timers — setInterval just
 * drives re-render cadence, it is NOT the source of truth.
 *
 * Auto-flow (the core insight of the product): when a focus countdown hits
 * zero we do NOT beep or stop. We silently flip to counting UP, preserving the
 * user's hyperfocus. The state machine handles the flip; these helpers just
 * compute what to display.
 */

export type Phase = "idle" | "focus" | "autoflow" | "rest" | "rating";

/** A focus or rest interval, in progress or complete. */
export interface TimerState {
  phase: Phase;
  /** epoch-ms when the current interval started ticking. */
  startedAt: number | null;
  /** The pomodoro target in seconds. For rest, this is the rest target. */
  targetSeconds: number;
  /** Free-text context tag for the current focus. */
  taskLabel: string;
}

export const EMPTY_TIMER: TimerState = {
  phase: "idle",
  startedAt: null,
  targetSeconds: 0,
  taskLabel: "",
};

/**
 * A focus session shorter than this (seconds) is treated as an accidental tap,
 * not real work: it must not count toward today's stats or the streak, and must
 * not move the next focus target. Without this floor, a misclicked start→stop
 * (<1s, e.g. same-second) would log a 0-second "focus" row that inflates
 * todaySessions, keeps the streak alive for a day with zero real focus, and a
 * rating on it would apply a full delta to the persisted target.
 */
export const MIN_SESSION_SECONDS = 10;

/**
 * Elapsed seconds since the interval started, given a "now" timestamp.
 * Returns 0 when not running. Capped nowhere — auto-flow is meant to run past.
 */
export function elapsedSeconds(state: TimerState, now: number): number {
  if (state.startedAt === null) return 0;
  return elapsedBetween(state.startedAt, now);
}

/** Seconds between two epoch-ms timestamps, floored and clamped at 0. */
export function elapsedBetween(start: number, end: number): number {
  return Math.max(0, Math.floor((end - start) / 1000));
}

/**
 * Remaining seconds for the focus countdown. Negative once auto-flow has
 * started (we display the overflow as a positive "+mm:ss" count-up).
 */
export function remainingSeconds(state: TimerState, now: number): number {
  return state.targetSeconds - elapsedSeconds(state, now);
}

/** "12:34" for positive, "-01:23" → displayed as "+01:23" by callers. */
export function formatClock(totalSeconds: number): string {
  const sign = totalSeconds < 0 ? "-" : "";
  const abs = Math.abs(totalSeconds);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${sign}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Fatigue proxy for the blob morph — how far into / past the focus interval the
 * user is, mapped to [0,1]. 0 at start, 1.0 at target end, keeps climbing in
 * auto-flow so the blob gets more agitated the longer you overdraw.
 *
 * This is deliberately a *behavioral* proxy (elapsed vs target), not a claim
 * about the user's prefrontal metabolism. We can't measure that; we can only
 * show that time is being spent.
 */
export function fatigue(state: TimerState, now: number): number {
  if (state.targetSeconds <= 0) return 0;
  return elapsedSeconds(state, now) / state.targetSeconds;
}
