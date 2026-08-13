import { motion } from "framer-motion";
import { formatClock } from "../timer/engine";
import type { Phase } from "../timer/engine";

/**
 * The giant countdown. Neo-brutalism: the number IS the layout.
 *
 * During focus it counts DOWN to the target. At target it does NOT stop — it
 * silently flips (state machine: focus → autoflow) and starts counting UP,
 * shown with a leading "+". That silent overflow is the auto-flow contract: we
 * protect hyperfocus instead of beeping.
 */
export function Timer({
  remaining,
  phase,
  onPrimary,
}: {
  remaining: number; // seconds; negative during auto-flow
  phase: Phase;
  onPrimary: () => void;
}) {
  const isAuto = phase === "autoflow";
  // Rest never shows negative garbage: once the rest target elapses we clamp the
  // display at 00:00 (the user is free to keep resting; the phase stays 'rest'
  // until they tap). Auto-flow, by contrast, is DESIGNED to go negative (count-up).
  const restOver = phase === "rest" && remaining < 0;
  // No nested ternary (review rule) — explicit branches.
  let display: string;
  if (isAuto) display = `+${formatClock(Math.abs(remaining))}`;
  else if (restOver) display = "00:00";
  else display = formatClock(remaining);
  const accent = phase === "rest" ? "var(--color-rest)" : "var(--color-accent)";

  return (
    <button
      onClick={onPrimary}
      className="flex w-full flex-col items-center justify-center bg-transparent p-0"
      style={{ cursor: "pointer" }}
    >
      <motion.div
        key={isAuto ? "auto" : "down"}
        initial={{ opacity: 0.2, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="tabular leading-none"
        style={{
          fontSize: "clamp(3.5rem, 18vw, 7rem)",
          fontWeight: 800,
          letterSpacing: "-0.04em",
          color: isAuto ? accent : "var(--color-ink)",
        }}
      >
        {display}
      </motion.div>
      <div
        className="mt-2 text-xs font-bold uppercase tracking-[0.25em]"
        style={{ color: "var(--color-ink-soft)" }}
      >
        {phase === "focus" && "专注中"}
        {phase === "autoflow" && "自动流 · 点击结束"}
        {phase === "rest" && "休息"}
      </div>
    </button>
  );
}
