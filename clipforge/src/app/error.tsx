"use client";

import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-start justify-center min-h-screen gap-6 px-12 py-16 max-w-[640px]">
      <span className="tag !text-accent">Something broke</span>
      <h2 className="font-heading text-[56px] tracking-[-0.032em] leading-[0.95]">
        This one&rsquo;s on us.
      </h2>
      <p className="text-base text-muted-foreground leading-[1.55]">
        The app hit an unexpected error. Try again, and if this keeps happening tell us what
        you were doing so we can fix it.
      </p>
      {error.digest && (
        <span className="font-mono text-[11px] text-muted-foreground tracking-wide">
          Error ref · {error.digest}
        </span>
      )}
      <div className="flex items-center gap-2.5 pt-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 bg-foreground text-foreground-inverse px-5 py-3 text-sm font-medium hover:bg-foreground/90 transition-colors"
        >
          Try again <span aria-hidden>→</span>
        </button>
        <a
          href="/projects"
          className="inline-flex items-center px-5 py-3 text-sm hover:bg-muted transition-colors"
        >
          Back to projects
        </a>
      </div>
    </div>
  );
}
