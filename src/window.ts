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
    return {
      w: Math.max(640, monitor.size.width - 80),
      h: Math.max(560, monitor.size.height - 120),
    };
  } catch {
    return null;
  }
}

export async function setMode(mode: WinMode): Promise<void> {
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
}

export async function toggleAlwaysOnTop(on: boolean): Promise<void> {
  try {
    await getCurrentWindow().setAlwaysOnTop(on);
  } catch {
    /* non-fatal when running outside Tauri */
  }
}
