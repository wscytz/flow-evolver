/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/__tests__/setup.ts"],
    // App uses setInterval + Date.now which are fine under jsdom, but we drive
    // time via vi.useFakeTimers in the component test.
    globals: true,
  },
});
