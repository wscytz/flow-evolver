/**
 * The morphing blob — the visual heart of the product.
 *
 * No progress bar, no dial. A single organic SVG shape that morphs between
 * three hard-coded closed Bézier paths. Its morph SPEED and COLOR are functions
 * of "fatigue" (elapsed vs target, climbing past 1.0 during auto-flow):
 *
 *   - calm (fatigue ~0):     slow 4s morph, deep-brown ink
 *   - strained (fatigue ~1): faster 1s morph, blood-orange — visual pressure
 *
 * The mapping is the *whole point* of the neo-brutalist variant: you should
 * FEEL the biological load as the shape getting more agitated, not read a
 * number. But per the design discipline this is a behavioral proxy, not a
 * claim of measuring the user's brain.
 */

// Three organic closed paths, same viewBox 0 0 200 200, roughly centered.
// Hand-tuned cubic Béziers. Differ enough that morphing between them reads as
// "living" rather than a transform.
const PATHS = [
  "M100,20 C150,20 180,55 180,100 C180,145 150,180 100,180 C55,180 20,145 20,100 C20,55 55,20 100,20 Z",
  "M100,18 C160,30 175,60 175,105 C175,150 140,178 98,178 C50,178 22,140 25,95 C28,50 55,10 100,18 Z",
  "M105,22 C155,15 182,50 178,98 C174,150 138,182 95,176 C45,169 18,135 25,90 C32,48 65,28 105,22 Z",
] as const;

export const BLOB_PATHS: string[] = [...PATHS];

/**
 * Interpolate between two same-structure SVG paths (same number of numeric
 * coordinates). `t` 0→1 morphs `from` into `to`: command letters are kept
 * verbatim and each coordinate is lerped positionally. This is what drives the
 * liquid morph — Framer's `d` animation was unreliable in the installed
 * version (keyed remount snapped between shapes; unkeyed didn't animate), so
 * we interpolate the paths ourselves, which is fully controlled and testable.
 */
export function lerpPath(from: string, to: string, t: number): string {
  const nums = /-?\d+\.?\d*/g;
  const fromNums = (from.match(nums) ?? []).map(Number);
  const toNums = (to.match(nums) ?? []).map(Number);
  let n = 0;
  return from.replace(nums, () => {
    const f = fromNums[n];
    const g = toNums[n] ?? f;
    n++;
    return String(Math.round((f + (g - f) * t) * 100) / 100);
  });
}

/** Morph cycle duration in seconds for a given fatigue level [0,∞).
 *  fatigue 0 → 4s (calm), fatigue ≥1 → 1s (agitated). Linear between,
 *  1s floor so deep auto-flow accelerates but never looks strobe-broken. */
export function morphDuration(fatigue: number): number {
  const t = Math.max(0, fatigue);
  return Math.max(1, 4 - 3 * Math.min(1, t));
}

/** Blob fill color — interpolates ink→accent as fatigue climbs to 1.0,
 *  then saturates further into a deeper orange as it overdraws in auto-flow. */
export function blobColor(fatigue: number): string {
  // Below target: lerp brown(0.266 0.079 36.259) → orange(0.646 0.222 41.116)
  // by lightness/chroma/hue. Past 1.0, push chroma harder for alarm.
  const t = Math.min(1, Math.max(0, fatigue));
  const L = 0.266 + (0.646 - 0.266) * t;
  const C = 0.079 + (0.222 - 0.079) * t + Math.max(0, fatigue - 1) * 0.05;
  const H = 36.259 + (41.116 - 36.259) * t;
  return `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${H.toFixed(1)})`;
}

/**
 * Morph delivery: Framer Motion's <motion.path> animates a string-array `d`
 * prop by interpolating between matching command skeletons. All three paths
 * above share the M / C / C / C / Z skeleton, so Framer morphs them directly —
 * no flubber, no manual sampling. See <Blob/> in components.
 */


