import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// jsdom doesn't implement layout; framer-motion's layout animations and
// getBoundingClientRect all read 0s — that's fine, we assert on text content.
// SVG namespace: jsdom supports <svg>/<path> well enough for our assertions.

// matchMedia shim (framer-motion may touch it).
if (!window.matchMedia) {
  // @ts-ignore
  window.matchMedia = () => ({
    matches: false,
    media: "",
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  });
}

// ResizeObserver stub.
// @ts-ignore
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
