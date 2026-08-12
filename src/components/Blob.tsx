import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { BLOB_PATHS, morphDuration, blobColor } from "../blob";

/**
 * The hero blob. Renders as an absolutely-positioned full-bleed SVG behind the
 * focus-screen content. Its morph speed and color react to `fatigue` (elapsed
 * vs target — a behavioral proxy, not a brain-metabolism claim).
 *
 * Two variants:
 *  - "hero" : the big background morphing shape on the running screen
 *  - "seed" : the small filled square used as the idle-screen start button
 *
 * Design note: we deliberately do NOT share a layoutId between seed and hero.
 * Framer Motion's shared-element transitions require matching element types
 * (div↔div, path↔path); cross-type (div↔path) sharing produces broken layout
 * math and can swallow the viewport. The seed and hero are different element
 * types, so we animate them independently with a simple enter/exit fade.
 *
 * Speed control: we DRIVE the morph from a timer instead of letting Framer
 * auto-cycle. Passing the stable BLOB_PATHS array to `animate={{ d: ... }}`
 * means Framer never sees a value change and won't restart the cycle, so
 * `transition.duration` updates are ignored (only `fill` moved). A controlled
 * index flip gives a fresh `d` string each step, so the duration — and thus
 * the fatigue-driven agitation — actually applies.
 */
export function Blob({
  fatigue,
  variant,
}: {
  fatigue: number;
  variant: "hero" | "seed";
}) {
  const fill = blobColor(fatigue);

  if (variant === "seed") {
    return (
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="rounded-none"
        style={{ width: 96, height: 96, background: fill }}
      />
    );
  }

  return <HeroBlob fatigue={fatigue} fill={fill} />;
}

function HeroBlob({ fatigue, fill }: { fatigue: number; fill: string }) {
  const dur = morphDuration(fatigue); // seconds per morph step, shrinks with fatigue
  const [i, setI] = useState(0);
  // Last step timestamp, kept in a ref so it survives effect re-runs.
  const lastStepAt = useRef(0);

  // Controlled cycle: a FIXED 1s cadence checks whether `dur` seconds have
  // elapsed since the last step; when they have, advance the morph. This always
  // fires — the old `setInterval(..., dur*1000)` re-created on every `dur`
  // change never reached its deadline while fatigue drifted each tick, so the
  // blob stayed frozen for the whole countdown (only worked once dur hit the
  // stable 1.0 floor in autoflow). `dur` only decides how many ticks elapse
  // between steps, so agitation still accelerates with fatigue.
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = performance.now();
      if (now - lastStepAt.current >= dur * 1000) {
        lastStepAt.current = now;
        setI((n) => (n + 1) % BLOB_PATHS.length);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [dur]);

  const from = BLOB_PATHS[i];
  const to = BLOB_PATHS[(i + 1) % BLOB_PATHS.length];

  return (
    <svg
      viewBox="0 0 200 200"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full"
      style={{ opacity: 0.16 }}
      aria-hidden
    >
      <motion.path
        // Key on the step index so each new target starts a fresh tween with the
        // CURRENT duration — this is what makes the speed react to fatigue.
        key={i}
        d={from}
        fill={fill}
        initial={false}
        animate={{ d: to }}
        transition={{ duration: dur, ease: "easeInOut" }}
      />
    </svg>
  );
}
