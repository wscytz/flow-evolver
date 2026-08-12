/**
 * Heuristic self-rating → next-target adjustment.
 *
 * This is intentionally a dead-simple, explainable heuristic — NOT a hidden
 * ML model. The product's whole pitch is "the timer adapts to you in a way you
 * can see and reason about." So: four buckets, four fixed deltas, clamped to a
 * sane window, persisted as the next target. The user can always see what the
 * next target became and why.
 *
 * Buckets (per the design report):
 *   flow       +10 min  — you hit a flow state, give yourself more runway next time
 *   focus       +5 min  — solid focus, nudge up
 *   good         0 min  — neutral, leave it
 *   distracted  -5 min  — struggled, shorten the next one
 */
import type { RatingKey, FocusConfig } from "./reducer";

export const RATING_DEFS: Record<RatingKey, { deltaMinutes: number; label: string; blurb: string }> = {
  flow: { deltaMinutes: 10, label: "Flow", blurb: "Lost track of time. More runway next." },
  focus: { deltaMinutes: 5, label: "Focused", blurb: "Solid. Nudge the target up." },
  good: { deltaMinutes: 0, label: "Okay", blurb: "Neutral. Keep it." },
  distracted: { deltaMinutes: -5, label: "Distracted", blurb: "Shorten the next one." },
};

export const RATING_ORDER: RatingKey[] = ["flow", "focus", "good", "distracted"];

/** Compute the next focus target, clamped to [focusMin, focusMax]. */
export function nextFocusTarget(
  currentTarget: number,
  rating: RatingKey,
  cfg: FocusConfig,
): number {
  const deltaSec = RATING_DEFS[rating].deltaMinutes * 60;
  return Math.max(cfg.focusMin, Math.min(cfg.focusMax, currentTarget + deltaSec));
}

/** Rest seconds derived from the focus length just completed, clamped >=0. */
export function restSecondsFor(focusActualSeconds: number, cfg: FocusConfig): number {
  const restMin = (focusActualSeconds / 60) * cfg.restRatio;
  return Math.max(0, Math.round(restMin * 60));
}

export function formatMinutes(seconds: number): string {
  const m = Math.round(seconds / 60);
  return `${m}m`;
}
