import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

import { Button } from "@/components/ui/button";

interface State {
  error: Error | null;
}

/**
 * Without this, one unexpected shape from a core command takes the whole window to a blank page —
 * indistinguishable, from the user's side, from "the app froze". Contain the damage to a message
 * they can act on.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("render error", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    return (
      <div className="bg-background flex h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="space-y-1">
          <h1 className="text-dialog font-semibold">
            Something broke while rendering
          </h1>
          <p className="text-body text-muted-foreground">
            Your sessions are stored on disk and are unaffected.
          </p>
        </div>
        <pre className="rounded-control bg-muted/50 text-metadata max-h-52 max-w-2xl overflow-auto border px-4 py-3 text-left font-mono">
          {error.stack ?? String(error)}
        </pre>
        <div className="flex gap-2">
          <Button onClick={() => this.setState({ error: null })}>
            Try again
          </Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      </div>
    );
  }
}
