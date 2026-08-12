import { AnimatePresence, motion } from "framer-motion";
import { RATING_DEFS, RATING_ORDER, formatMinutes } from "../timer/heuristic";
import type { RatingKey } from "../timer/reducer";

/**
 * The four-bucket self-rating that slides up from the bottom when a focus
 * interval ends. Each bucket carries a fixed delta; the chosen one feeds the
 * heuristic to set the next target, then we drop into rest.
 */
export function Rating({
  show,
  onPick,
  onSkip,
  focusActualSeconds,
}: {
  show: boolean;
  onPick: (r: RatingKey) => void;
  onSkip: () => void;
  focusActualSeconds: number;
}) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 120, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          className="absolute inset-x-0 bottom-0 border-t-2 bg-[var(--color-bg)] p-4"
          style={{ borderColor: "var(--color-ink)" }}
        >
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-extrabold uppercase tracking-tight">
              How was that?
            </h2>
            <span className="tabular text-xs" style={{ color: "var(--color-ink-soft)" }}>
              {formatMinutes(focusActualSeconds)} focused
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {RATING_ORDER.map((key) => {
              const def = RATING_DEFS[key];
              const positive = def.deltaMinutes > 0;
              const negative = def.deltaMinutes < 0;
              return (
                <button
                  key={key}
                  onClick={() => onPick(key)}
                  className="border-2 p-3 text-left transition-transform active:translate-y-0.5"
                  style={{
                    borderColor: "var(--color-ink)",
                    background:
                      key === "flow"
                        ? "var(--color-accent)"
                        : key === "distracted"
                          ? "var(--color-accent-soft)"
                          : "transparent",
                    color: key === "flow" ? "#fff" : "var(--color-ink)",
                  }}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-base font-extrabold">{def.label}</span>
                    <span
                      className="tabular text-sm font-bold"
                      style={{
                        color:
                          key === "flow"
                            ? "#fff"
                            : positive
                              ? "var(--color-accent)"
                              : negative
                                ? "var(--color-accent)"
                                : "var(--color-ink-soft)",
                      }}
                    >
                      {def.deltaMinutes > 0 ? "+" : ""}
                      {def.deltaMinutes}
                    </span>
                  </div>
                  <p
                    className="mt-1 text-[11px] leading-tight"
                    style={{ opacity: 0.85 }}
                  >
                    {def.blurb}
                  </p>
                </button>
              );
            })}
          </div>
          <button
            onClick={onSkip}
            className="mt-3 w-full py-2 text-xs font-bold uppercase tracking-[0.2em]"
            style={{ color: "var(--color-ink-soft)" }}
          >
            skip & end
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
