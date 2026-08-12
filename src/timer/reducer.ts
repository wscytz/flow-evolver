/**
 * Focus session state machine.
 *
 *     idle ──start──▶ focus ──(target reached, no beep)──▶ autoflow
 *      ▲                ▲                                      │
 *      │                │                                      │ stop
 *      │              rest ◀──(rating chosen / skip)──── rating ◀┘
 *      │                │
 *      └──skip/stop─────┘
 *
 * The reducer is a PURE function of (state, action). now is passed in via the
 * action payload so we never touch Date.now() inside the reducer — that keeps
 * it deterministic and testable. Persistence (DB writes, settings bumps)
 * happens in effect hooks that watch state transitions, NOT here.
 */
import type { TimerState } from "./engine";

export type Phase = TimerState["phase"];
export type RatingKey = "flow" | "focus" | "good" | "distracted";

export interface FocusConfig {
  focusTarget: number;
  focusMin: number;
  focusMax: number;
  restRatio: number; // rest minutes per focus minute, e.g. 5/25 = 0.2
}

export interface SessionRecord {
  kind: "focus" | "rest";
  taskLabel: string;
  targetSeconds: number;
  actualSeconds: number;
  autoFlowed: boolean;
  ratingKey: RatingKey | null;
  ratingDelta: number | null;
  startedAt: number;
  endedAt: number;
}

export type Action =
  | { type: "START_FOCUS"; now: number; targetSeconds: number; taskLabel: string }
  | { type: "REACHED_TARGET" } // focus hit 0 → silent auto-flow
  | { type: "STOP_FOCUS"; now: number } // user stops focus/autoflow → rate
  | { type: "RATE"; now: number; rating: RatingKey; deltaMinutes: number; nextFocusTarget: number; restSeconds: number; taskLabel: string }
  | { type: "SKIP_RATING"; now: number }
  | { type: "SKIP_REST" }
  | { type: "STOP_REST" }
  | { type: "RESET" };

export const EMPTY_TIMER: TimerState = { phase: "idle", startedAt: null, targetSeconds: 0, taskLabel: "" };

export function reducer(state: TimerState, action: Action): TimerState {
  switch (action.type) {
    case "START_FOCUS":
      // Guarded to idle like every other transition: the start UI only exists
      // in idle, so a stray START_FOCUS from another phase (e.g. a stale tap
      // during the rating exit) must not reset a running/rest session.
      if (state.phase !== "idle") return state;
      return {
        phase: "focus",
        startedAt: action.now,
        targetSeconds: action.targetSeconds,
        taskLabel: action.taskLabel,
      };

    case "REACHED_TARGET":
      // Silent flip to count-up. No sound, no interruption.
      // startedAt + targetSeconds UNCHANGED → remainingSeconds goes negative and
      // the UI renders it as a "+" overflow.
      if (state.phase !== "focus") return state;
      return { ...state, phase: "autoflow" };

    case "STOP_FOCUS":
      if (state.phase !== "focus" && state.phase !== "autoflow") return state;
      return { ...state, phase: "rating", startedAt: null };

    case "RATE":
      // Guarded to the rating phase (same rationale as SKIP_RATING): a stale
      // RATE arriving from any other phase shouldn't spawn a rest. The rating
      // payload's target is computed by the caller's heuristic and persisted in
      // the effect; the reducer only needs restSeconds + taskLabel.
      if (state.phase !== "rating") return state;
      return {
        phase: "rest",
        startedAt: action.now,
        targetSeconds: action.restSeconds,
        taskLabel: action.taskLabel,
      };

    case "SKIP_RATING":
      // Only valid from the rating phase. Guarded so a stale SKIP_RATING (e.g.
      // a double-click landing after RATE already started a rest) can't cancel
      // the rest the user just earned.
      if (state.phase !== "rating") return state;
      return { ...EMPTY_TIMER };

    case "SKIP_REST":
    case "STOP_REST":
      if (state.phase !== "rest") return state;
      return { ...EMPTY_TIMER };

    case "RESET":
      return { ...EMPTY_TIMER };

    default:
      return state;
  }
}
