/**
 * Settings panel logic — pure parsing/normalization, no React, no DB.
 *
 * The panel edits five numbers in MINUTES (friendlier than seconds); this
 * module is the single validation gate between the input fields and the
 * settings table. Everything the heuristic reads later goes through loadConfig,
 * so the contract here is: what parseSettings approves, loadConfig can round-
 * trip without repair (bands are subsets of loadConfig's second-level bands).
 */
export interface SettingsInput {
  /** Next focus target, minutes. Clamped into [focusMin, focusMax]. */
  focusTarget: number;
  /** Lower clamp bound for the heuristic, minutes. */
  focusMin: number;
  /** Upper clamp bound for the heuristic, minutes. Must be > focusMin. */
  focusMax: number;
  /** Rest minutes earned per `perFocusMinutes` of focus. 0 = no rest. */
  restMinutes: number;
  /** Focus minutes the rest is derived from (ratio denominator). */
  perFocusMinutes: number;
}

export type SettingsParse =
  | { ok: true; values: SettingsInput }
  | { ok: false; error: string };

// Sane bands in minutes. focusMax's band starts at 2 so "max > min" is always
// reachable with the minimum legal min (1). restMinutes tops out at 120 —
// beyond that it's not a rest ratio, it's a vacation.
const BANDS = {
  focusTarget: [1, 1440],
  focusMin: [1, 720],
  focusMax: [2, 1440],
  restMinutes: [0, 120],
  perFocusMinutes: [1, 480],
} as const;

type BandKey = keyof typeof BANDS;

const clamp = (v: number, [lo, hi]: readonly number[]) =>
  Math.max(lo, Math.min(hi, Math.round(v)));

/**
 * Validate + normalize raw field values. Non-finite input (empty/typed
 * garbage → NaN) is rejected with a message rather than silently defaulted —
 * the user should see what they typed was not usable.
 */
export function parseSettings(input: SettingsInput): SettingsParse {
  for (const k of Object.keys(BANDS) as BandKey[]) {
    if (!Number.isFinite(input[k])) return { ok: false, error: "请输入有效的数字" };
  }

  const focusMin = clamp(input.focusMin, BANDS.focusMin);
  const focusMax = clamp(input.focusMax, BANDS.focusMax);
  // min >= max would freeze the heuristic: every clamp lands on the same
  // value and ratings can never move the target. Reject, don't repair — the
  // user is mid-edit and deserves to see the conflict.
  if (focusMax <= focusMin) return { ok: false, error: "专注上限必须大于下限" };

  // The target itself is silently clamped into the window: a stray target is
  // a plausible value the user just hasn't reconciled with new bounds yet.
  const focusTarget = clamp(input.focusTarget, BANDS.focusTarget);
  const boundedTarget = Math.max(focusMin, Math.min(focusMax, focusTarget));

  return {
    ok: true,
    values: {
      focusTarget: boundedTarget,
      focusMin,
      focusMax,
      restMinutes: clamp(input.restMinutes, BANDS.restMinutes),
      perFocusMinutes: clamp(input.perFocusMinutes, BANDS.perFocusMinutes),
    },
  };
}
