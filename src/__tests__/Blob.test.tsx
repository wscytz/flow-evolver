import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { Blob } from "../components/Blob";
import { lerpPath, BLOB_PATHS } from "../blob";

// jsdom shims (same as App.test setup)
if (!window.matchMedia) {
  // @ts-ignore
  window.matchMedia = () => ({ matches: false, media: "", addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){}, onchange: null, dispatchEvent: () => false });
}

describe("HeroBlob fatigue→speed", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // The smooth-morph rAF loop must not fire outside act() under fake timers —
    // stub it to a no-op; the step cadence (setInterval) drives these tests.
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("morph step interval tracks morphDuration(fatigue)", () => {
    // fatigue=0 → 4s cycle; render with fatigue=0, advance 4s → index should step.
    const { rerender } = render(<Blob fatigue={0} variant="hero" />);
    // find the <path> and its d — at t0 it's BLOB_PATHS[0]→[1]
    let p = document.querySelector("svg path")!;
    const d0 = p.getAttribute("d");

    act(() => { vi.advanceTimersByTime(4000); });
    p = document.querySelector("svg path")!;
    const d1 = p.getAttribute("d");
    expect(d1).not.toBe(d0); // stepped to next path after 4s (calm speed)

    // Now fatigue jumps → dur shrinks to 1s. Re-render; the interval should be
    // rebuilt at 1s, so a 1s advance steps again.
    act(() => { rerender(<Blob fatigue={1.5} variant="hero" />); });
    const before = document.querySelector("svg path")!.getAttribute("d");
    act(() => { vi.advanceTimersByTime(1000); });
    const after = document.querySelector("svg path")!.getAttribute("d");
    expect(after).not.toBe(before); // fast agitation at high fatigue
  });

  it("morph still steps while fatigue drifts each tick (regression: frozen blob)", () => {
    // Real session: fatigue increases by ~1/target each 1s tick. With a float
    // dur that drifted every tick, the old `setInterval(..., dur*1000)` was
    // torn down before its deadline → blob never stepped (frozen countdown).
    // The fixed 1s cadence must still step once 4s (dur at fatigue 0) elapse.
    const { rerender } = render(<Blob fatigue={0} variant="hero" />);
    const d0 = document.querySelector("svg path")!.getAttribute("d");

    // Simulate 6 real seconds of a 25m session: fatigue drifts 0 → 0.004.
    // Step should happen at t≈4s (dur≈4.0, tiny drift), and possibly again by 6s.
    for (let t = 1; t <= 6; t++) {
      const f = t / 1500; // ≈ a 25-min session's fatigue growth
      act(() => {
        rerender(<Blob fatigue={f} variant="hero" />);
        vi.advanceTimersByTime(1000);
      });
    }
    const d1 = document.querySelector("svg path")!.getAttribute("d");
    expect(d1).not.toBe(d0); // MUST have stepped — the old code never did
  });
});

describe("lerpPath (liquid morph)", () => {
  it("returns from at t=0 and to at t=1 (positions preserved)", () => {
    expect(lerpPath(BLOB_PATHS[0], BLOB_PATHS[1], 0)).toBe(BLOB_PATHS[0]);
    expect(lerpPath(BLOB_PATHS[0], BLOB_PATHS[1], 1)).toBe(BLOB_PATHS[1]);
  });

  it("interpolates coordinates between the two shapes at t=0.5", () => {
    const mid = lerpPath(BLOB_PATHS[0], BLOB_PATHS[1], 0.5);
    expect(mid).not.toBe(BLOB_PATHS[0]);
    expect(mid).not.toBe(BLOB_PATHS[1]);
    expect(mid.startsWith("M")).toBe(true);
    // command skeleton preserved — same number of numeric tokens
    const nums = (s: string) => (s.match(/-?\d+\.?\d*/g) ?? []).length;
    expect(nums(mid)).toBe(nums(BLOB_PATHS[0]));
  });
});
