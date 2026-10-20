"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Rendered instead of children when a descendant throws. */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Generic error boundary. Wrap any subsystem that can fail independently of
 * the rest of the organism (WebGL, third-party map scripts, the AI
 * concierge) so a failure there degrades gracefully instead of blanking the
 * whole page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // client-side only — no server log sink reachable from here; the
    // console is sufficient for now (picked up by any browser monitoring
    // integration added later).
    console.error("[ErrorBoundary]", error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}
