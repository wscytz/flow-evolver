import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { Blob } from "../components/Blob";

// jsdom shims (same as App.test setup)
if (!window.matchMedia) {
  // @ts-ignore
  window.matchMedia = () => ({ matches: false, media: "", addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){}, onchange: null, dispatchEvent: () => false });
}

describe("HeroBlob fatigue→speed", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

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
});
