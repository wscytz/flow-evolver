import {
  getCurrentWindow,
  LogicalSize,
  currentMonitor,
} from "@tauri-apps/api/window";

/**
 * Window mode controller (Decision A from design): a single window that
 * toggles between a small persistent size and a large "expanded" size.
 *
 * We do NOT use OS fullscreen — true fullscreen hides the title bar and on
 * macOS enters a separate space, too heavy for a focus widget. Instead we
 * toggle between the small default and a large size computed from the
 * monitor's work area. Always-on-top can be flipped independently.
 */
const SMALL = { width: 360, height: 480 };

export type WinMode = "small" | "expanded";

async function workArea(): Promise<{ w: number; h: number } | null> {
  try {
    const monitor = await currentMonitor();
    if (!monitor) return null;
    // Tauri measures Monitor.size/workArea in PHYSICAL pixels, but setSize below
    // expects LOGICAL units. Without a scaleFactor conversion, a Retina (2x)
    // display would request ~2x the screen and macOS clamps expanded to
    // fullscreen instead of ~90% of the work area. Prefer the visible work area
    // (avoids the menu bar / dock) and fall back to the full monitor size.
    const physical = monitor.workArea?.size ?? monitor.size;
    const logical = physical.toLogical(monitor.scaleFactor);
    return {
      w: Math.max(640, Math.round(logical.width - 80)),
      h: Math.max(560, Math.round(logical.height - 120)),
    };
  } catch {
    return null;
  }
}

export async function setMode(mode: WinMode): Promise<void> {
  try {
    const win = getCurrentWindow();
    if (mode === "small") {
      await win.setSize(new LogicalSize(SMALL.width, SMALL.height));
    } else {
      const area = await workArea();
      if (area) {
        await win.setSize(new LogicalSize(area.w, area.h));
        await win.center();
      }
    }
  } catch {
    // Non-fatal: without a Tauri runtime (e.g. pure-web dev) the window APIs
    // don't exist. Callers fire-and-forget this; swallow so the optimistic
    // winMode state change in App still drives the layout.
  }
}

export async function toggleAlwaysOnTop(on: boolean): Promise<void> {
  try {
    await getCurrentWindow().setAlwaysOnTop(on);
  } catch {
    /* non-fatal when running outside Tauri */
  }
}
