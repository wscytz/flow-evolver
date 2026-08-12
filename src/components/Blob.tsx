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

  // hero: full-bleed morphing blob. motion.path cycles through BLOB_PATHS.
  // Opacity lives on the <svg> wrapper, not on motion.path — putting it on the
  // animated path conflicts with Framer's value pipeline and renders the fill
  // fully opaque (verified: turned the whole focus view solid dark).
  const dur = morphDuration(fatigue);
  return (
    <svg
      viewBox="0 0 200 200"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full"
      style={{ opacity: 0.16 }}
      aria-hidden
    >
      <motion.path
        d={BLOB_PATHS[0]}
        fill={fill}
        animate={{ d: BLOB_PATHS }}
        transition={{
          duration: dur,
          repeat: Infinity,
          repeatType: "mirror",
          ease: "easeInOut",
        }}
      />
    </svg>
  );
}
