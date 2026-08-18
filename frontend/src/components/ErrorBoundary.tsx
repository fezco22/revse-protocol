"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * App-wide error boundary: catches render/runtime errors so a single failing
 * component never white-screens the app. Errors are logged (and forwarded to
 * analytics/monitoring if wired) and the user gets a recoverable fallback.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // Forwarded to console; Vercel Analytics + Speed Insights capture the rest.
    console.error("[Revse] runtime error:", error, info.componentStack);
    if (typeof window !== "undefined") {
      const w = window as unknown as {
        va?: (event: string, props?: Record<string, unknown>) => void;
      };
      w.va?.("event", { name: "client_error", message: error.message });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
          <h2 className="text-lg font-semibold text-ink">Something broke.</h2>
          <p className="text-sm leading-relaxed text-ink-muted">
            A part of the app hit an unexpected error. Your funds and positions
            are safe on-chain. Try reloading.
          </p>
          <button
            onClick={() => {
              this.setState({ error: null });
              if (typeof window !== "undefined") window.location.reload();
            }}
            className="bg-signal px-5 py-2.5 text-sm font-bold text-carbon transition-colors hover:bg-[#38c98e]"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
