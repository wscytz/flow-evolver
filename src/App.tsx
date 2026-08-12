import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { EMPTY_TIMER, reducer } from "./timer/reducer";
import type { FocusConfig, RatingKey, SessionRecord } from "./timer/reducer";
import { elapsedSeconds, fatigue } from "./timer/engine";
import { nextFocusTarget, restSecondsFor, RATING_DEFS } from "./timer/heuristic";
import {
  getStats,
  insertSession,
  loadConfig,
  saveFocusTarget,
  type FocusStats,
} from "./db";
import { setMode, toggleAlwaysOnTop, type WinMode } from "./window";

import { Blob } from "./components/Blob";
import { Timer } from "./components/Timer";
import { Rating } from "./components/Rating";
import { Stats } from "./components/Stats";

export default function App() {
  const [state, dispatch] = useReducer(reducer, EMPTY_TIMER);
  const [config, setConfig] = useState<FocusConfig | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [taskInput, setTaskInput] = useState("");
  const [stats, setStats] = useState<FocusStats | null>(null);
  const [winMode, setWinMode] = useState<WinMode>("small");
  const [onTop, setOnTop] = useState(false);
  const [ready, setReady] = useState(false);

  // Bookkeeping refs so effect hooks can read the latest values without
  // re-subscribing on every tick.
  const stateRef = useRef(state);
  stateRef.current = state;
  const configRef = useRef(config);
  configRef.current = config;

  // ---- boot: load config + stats ----
  useEffect(() => {
    (async () => {
      try {
        const cfg = await loadConfig();
        setConfig(cfg);
        setStats(await getStats(Date.now()));
      } catch (e) {
        // DB unavailable (e.g. running outside Tauri during pure-web dev) —
        // fall back to defaults so the UI still works.
        console.warn("DB load failed, using defaults:", e);
        setConfig({ focusTarget: 1500, focusMin: 600, focusMax: 5400, restRatio: 0.2 });
      } finally {
        setReady(true);
      }
    })();
  }, []);

  // ---- the tick: 1fps re-render while a timer is running ----
  useEffect(() => {
    if (state.phase === "idle" || state.phase === "rating") return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [state.phase]);

  // ---- auto-transition to autoflow when focus hits target (silent, no beep) ----
  useEffect(() => {
    if (state.phase !== "focus" || !state.startedAt) return;
    const remaining = state.targetSeconds - elapsedSeconds(state, now);
    if (remaining <= 0) {
      dispatch({ type: "REACHED_TARGET" });
    }
  }, [now, state]);

  // Snapshot of the focus interval that just ended, so the rating screen can
  // show the actuals and the rating choice can persist the record.
  const lastFocusRef = useRef<SessionRecord | null>(null);

  const startFocus = useCallback(() => {
    if (!configRef.current) return;
    const t = Date.now();
    const label = taskInput.trim();
    dispatch({
      type: "START_FOCUS",
      now: t,
      targetSeconds: configRef.current.focusTarget,
      taskLabel: label,
    });
    setNow(t);
    if (winMode !== "expanded") {
      setWinMode("expanded");
      void setMode("expanded");
    }
  }, [taskInput, winMode]);

  const stopFocus = useCallback(() => {
    // snapshot the focus interval that just ended, to use when rating is chosen
    const s = stateRef.current;
    if (!s.startedAt) return;
    const end = Date.now();
    const actual = Math.max(0, Math.floor((end - s.startedAt) / 1000));
    lastFocusRef.current = {
      kind: "focus",
      taskLabel: s.taskLabel,
      targetSeconds: s.targetSeconds,
      actualSeconds: actual,
      autoFlowed: s.phase === "autoflow",
      ratingKey: null,
      ratingDelta: null,
      startedAt: s.startedAt,
      endedAt: end,
    };
    dispatch({ type: "STOP_FOCUS", now: end });
    setNow(end);
  }, []);

  const rate = useCallback(
    (r: RatingKey) => {
      const cfg = configRef.current;
      const focus = lastFocusRef.current;
      if (!cfg || !focus) {
        dispatch({ type: "SKIP_RATING", now: Date.now() });
        return;
      }
      const deltaMin = RATING_DEFS[r].deltaMinutes;
      const nextTarget = nextFocusTarget(cfg.focusTarget, r, cfg);
      const restSec = restSecondsFor(focus.actualSeconds, cfg);

      const focusRecord: SessionRecord = {
        ...focus,
        ratingKey: r,
        ratingDelta: deltaMin,
      };

      (async () => {
        try {
          await insertSession(focusRecord);
          await saveFocusTarget(nextTarget);
          setConfig({ ...cfg, focusTarget: nextTarget });
          setStats(await getStats(Date.now()));
        } catch (e) {
          console.warn("persist failed:", e);
        }
      })();

      if (restSec >= 60) {
        dispatch({
          type: "RATE",
          now: Date.now(),
          rating: r,
          deltaMinutes: deltaMin,
          nextFocusTarget: nextTarget,
          restSeconds: restSec,
          taskLabel: focus.taskLabel,
        });
      } else {
        // rest too short to bother — just go idle
        dispatch({ type: "SKIP_RATING", now: Date.now() });
      }
      lastFocusRef.current = null;
    },
    [],
  );

  const endRest = useCallback(async () => {
    const s = stateRef.current;
    if (s.phase !== "rest") return;
    // log the rest interval
    if (s.startedAt) {
      const end = Date.now();
      const actual = Math.max(0, Math.floor((end - s.startedAt) / 1000));
      try {
        await insertSession({
          kind: "rest",
          taskLabel: s.taskLabel,
          targetSeconds: s.targetSeconds,
          actualSeconds: actual,
          autoFlowed: false,
          ratingKey: null,
          ratingDelta: null,
          startedAt: s.startedAt,
          endedAt: end,
        });
        setStats(await getStats(end));
      } catch (e) {
        console.warn("persist rest failed:", e);
      }
    }
    dispatch({ type: "STOP_REST" });
  }, []);

  const toggleWinMode = useCallback(() => {
    const next: WinMode = winMode === "small" ? "expanded" : "small";
    setWinMode(next);
    void setMode(next);
  }, [winMode]);

  const toggleOnTop = useCallback(() => {
    const next = !onTop;
    setOnTop(next);
    void toggleAlwaysOnTop(next);
  }, [onTop]);

  if (!ready || !config) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="tabular text-sm" style={{ color: "var(--color-ink-soft)" }}>
          …
        </div>
      </div>
    );
  }

  const isIdle = state.phase === "idle";
  const isRunning = state.phase === "focus" || state.phase === "autoflow" || state.phase === "rest";
  const remaining = state.targetSeconds - elapsedSeconds(state, now);
  const fat = fatigue(state, now);

  return (
    <div
      className="relative flex h-full flex-col overflow-hidden"
      style={{ background: "var(--color-bg)" }}
      data-mode={winMode}
    >
      {/* ---- blob background (only during running phases) ---- */}
      {isRunning && (
        <div className="pointer-events-none absolute inset-0">
          <Blob fatigue={fat} variant="hero" />
        </div>
      )}

      {/* ---- top bar: window controls ---- */}
      <header
        className="relative z-10 flex items-center justify-between border-b-2 px-3 py-2"
        style={{ borderColor: "var(--color-ink)" }}
      >
        <span
          className="text-xs font-extrabold uppercase tracking-[0.3em]"
          style={{ color: "var(--color-ink)" }}
        >
          Flow Evolver
        </span>
        <div className="flex gap-1">
          <IconBtn label="pin" active={onTop} onClick={toggleOnTop}>
            {onTop ? "◉" : "○"}
          </IconBtn>
          <IconBtn label="expand" active={winMode === "expanded"} onClick={toggleWinMode}>
            {winMode === "expanded" ? "⋐" : "⋑"}
          </IconBtn>
        </div>
      </header>

      {/* ---- main body ---- */}
      <main className="relative z-10 flex flex-1 flex-col">
        <AnimatePresence mode="wait">
          {isIdle ? (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-1 flex-col px-6 py-6"
            >
              <div className="mb-2 text-xs font-bold uppercase tracking-[0.25em]" style={{ color: "var(--color-ink-soft)" }}>
                next focus · {Math.round(config.focusTarget / 60)}m
              </div>
              <input
                value={taskInput}
                onChange={(e) => setTaskInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") startFocus();
                }}
                placeholder="What are you working on? (optional)"
                className="w-full border-b-2 bg-transparent py-3 text-xl font-bold placeholder:font-normal placeholder:text-[var(--color-ink-soft)] focus:outline-none"
                style={{ borderColor: "var(--color-ink)" }}
              />
              <div className="flex flex-1 flex-col items-center justify-center">
                <button onClick={startFocus} aria-label="start focus" className="block">
                  <Blob fatigue={0} variant="seed" />
                </button>
                <div className="mt-6 text-xs font-bold uppercase tracking-[0.3em]" style={{ color: "var(--color-ink)" }}>
                  start
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="run"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="flex flex-1 flex-col items-center justify-center px-6"
            >
              <div className="mb-4 max-w-full truncate text-center text-sm font-semibold" style={{ color: "var(--color-ink-soft)" }}>
                {state.taskLabel || "focused work"}
              </div>
              <Timer
                remaining={remaining}
                phase={state.phase}
                onPrimary={() => {
                  if (state.phase === "focus" || state.phase === "autoflow") stopFocus();
                  else if (state.phase === "rest") void endRest();
                }}
              />
              <div className="mt-8 flex gap-3">
                {state.phase === "rest" && (
                  <BigBtn onClick={() => void endRest()} variant="ghost">
                    skip rest
                  </BigBtn>
                )}
                {(state.phase === "focus" || state.phase === "autoflow") && (
                  <BigBtn onClick={stopFocus} variant="solid">
                    {state.phase === "autoflow" ? "end & rate" : "end early"}
                  </BigBtn>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ---- stats strip (idle only) ---- */}
      {isIdle && <Stats stats={stats} />}

      {/* ---- rating overlay ---- */}
      <Rating
        show={state.phase === "rating"}
        onPick={rate}
        onSkip={() => dispatch({ type: "SKIP_RATING", now: Date.now() })}
        focusActualSeconds={lastFocusRef.current?.actualSeconds ?? 0}
      />
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  active,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex h-7 w-7 items-center justify-center text-sm transition-transform active:translate-y-0.5"
      style={{
        color: active ? "var(--color-accent)" : "var(--color-ink)",
      }}
    >
      {children}
    </button>
  );
}

function BigBtn({
  children,
  onClick,
  variant,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant: "solid" | "ghost";
}) {
  return (
    <button
      onClick={onClick}
      className="border-2 px-6 py-3 text-xs font-extrabold uppercase tracking-[0.25em] transition-transform active:translate-y-0.5"
      style={{
        borderColor: "var(--color-ink)",
        background: variant === "solid" ? "var(--color-accent)" : "transparent",
        color: variant === "solid" ? "#fff" : "var(--color-ink)",
      }}
    >
      {children}
    </button>
  );
}
