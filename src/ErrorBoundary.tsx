import { Component } from "react";
import type { ReactNode } from "react";

/**
 * Last-resort render guard: if anything in the tree throws during render, show
 * a plain Chinese fallback instead of a white window. No recovery attempt —
 * a broken render has no safe state, so the message suggests restarting.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex h-full items-center justify-center"
          style={{ color: "var(--color-ink-soft)" }}
        >
          出错了,请重启应用
        </div>
      );
    }
    return this.props.children;
  }
}
