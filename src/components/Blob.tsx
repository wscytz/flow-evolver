import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { BLOB_PATHS, lerpPath, morphDuration, blobColor } from "../blob";

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
  const reduce = useReducedMotion();
  // Slow the morph 4× when the user has "reduce motion" on — we don't freeze it
  // (the living shape is core to the product), but a slower cycle is far less
  // stimulating for vestibular-sensitive users. Continuous rAF morph is not
  // covered by <MotionConfig reducedMotion="user">, so we gate it here.
  const dur = morphDuration(fatigue) * (reduce ? 4 : 1); // seconds per full morph step
  const [i, setI] = useState(0);
  // t ∈ [0,1] — progress within the current from→to step, advanced every rAF
  // frame. Kept in React state so the interpolated `d` is fully controlled.
  const [t, setT] = useState(0);
  // Last step timestamp, kept in a ref so it survives effect re-runs.
  const stepAtRef = useRef(performance.now());

  // Step cadence: a FIXED 1s interval checks whether `dur` seconds have
  // elapsed since the last step; when they have, advance the morph. This always
  // fires — the old `setInterval(..., dur*1000)` re-created on every `dur`
  // change never reached its deadline while fatigue drifted each tick, so the
  // blob stayed frozen for the whole countdown. `dur` only decides how many
  // ticks elapse between steps, so agitation still accelerates with fatigue.
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = performance.now();
      if (now - stepAtRef.current >= dur * 1000) {
        stepAtRef.current = now;
        setI((n) => (n + 1) % BLOB_PATHS.length);
        setT(0);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [dur]);

  // Liquid morph: interpolate t 0→1 across `dur` every frame. We lerp the two
  // same-structure paths ourselves instead of animating motion.path's `d` —
  // Framer's d animation snapped between shapes when keyed on the step index
  // and didn't animate at all unkeyed in the installed version. Stepping at
  // t=1 (new from == old to) keeps the shape continuous.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      // Skip re-rendering while the window is hidden — a focus timer spends most
      // of a session in the background, and re-tessellating a full-screen SVG the
      // user can't see is pure waste. rAF stays armed, so on the next visible
      // frame we resume exactly where we left off (t continues from its last
      // value; the 1s step interval below is the watchdog that keeps timing sane).
      if (document.visibilityState === "visible") {
        setT(Math.min(1, (performance.now() - stepAtRef.current) / (dur * 1000)));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [dur]);

  const d = lerpPath(BLOB_PATHS[i], BLOB_PATHS[(i + 1) % BLOB_PATHS.length], t);

  return (
    <svg
      viewBox="0 0 200 200"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full"
      style={{ opacity: 0.16 }}
      aria-hidden
    >
      <path d={d} fill={fill} />
    </svg>
  );
}
