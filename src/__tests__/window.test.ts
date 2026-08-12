import { describe, it, expect, vi, afterEach } from "vitest";

// The window mock must supply a Retina (scaleFactor 2) monitor whose
// size/workArea are PHYSICAL pixels and expose toLogical(), exactly like
// Tauri's runtime. setMode must convert before calling setSize.
const { setSize, center } = vi.hoisted(() => ({
  setSize: vi.fn().mockResolvedValue(undefined),
  center: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ setSize, center }),
  LogicalSize: class {
    constructor(public w: number, public h: number) {}
  },
  currentMonitor: vi.fn().mockResolvedValue({
    scaleFactor: 2,
    size: {
      width: 2880,
      height: 1800,
      toLogical: (f: number) => ({ width: 2880 / f, height: 1800 / f }),
    },
    workArea: {
      size: {
        width: 2880,
        height: 1780,
        toLogical: (f: number) => ({ width: 2880 / f, height: 1780 / f }),
      },
    },
  }),
}));

import { setMode } from "../window";

afterEach(() => {
  setSize.mockClear();
  center.mockClear();
});

/*
 * Regression for the Retina expanded-window bug: Tauri's Monitor.size/workArea
 * are PHYSICAL pixels, but Window.setSize takes LOGICAL units. The old code
 * fed physical straight into LogicalSize, so on a 2x display it asked for ~2x
 * the screen and macOS clamped expanded → effectively fullscreen. The fix
 * converts via monitor.scaleFactor (and prefers workArea to clear the menu
 * bar / dock). These tests lock the conversion in.
 */
describe("window.setMode sizing", () => {
  it("expanded converts the physical work-area size to logical (Retina 2x)", async () => {
    await setMode("expanded");
    expect(setSize).toHaveBeenCalledTimes(1);
    const arg = setSize.mock.calls[0][0];
    // workArea 2880x1780 physical → /2 = 1440x890 logical → −80/−120
    expect(arg.w).toBe(1360);
    expect(arg.h).toBe(770);
    expect(center).toHaveBeenCalledTimes(1);
  });

  it("small keeps the fixed small size", async () => {
    setSize.mockClear();
    await setMode("small");
    expect(setSize).toHaveBeenCalledTimes(1);
    expect(setSize.mock.calls[0][0]).toMatchObject({ w: 360, h: 480 });
    expect(center).not.toHaveBeenCalled();
  });
});
