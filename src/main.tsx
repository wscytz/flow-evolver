import React from "react";
import ReactDOM from "react-dom/client";
import { MotionConfig } from "framer-motion";
import App from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      {/* reducedMotion="user" makes Framer skip transitions when the OS has
          "reduce motion" on (prefers-reduced-motion), so spring entrances, the
          rating-sheet slide, and the Timer number shift collapse to instant for
          vestibular-sensitive users. The HeroBlob's hand-rolled rAF morph is
          not Framer-driven and is handled separately in Blob.tsx. */}
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </ErrorBoundary>
  </React.StrictMode>,
);
