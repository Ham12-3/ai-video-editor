import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-start justify-center min-h-screen gap-6 px-12 py-16 max-w-[640px]">
      <span className="tag">404 · page not found</span>
      <h2 className="font-heading text-[112px] tracking-[-0.04em] leading-none">404.</h2>
      <p className="font-heading italic text-[22px] tracking-[-0.015em] leading-[1.45] text-muted-foreground">
        We looked, we really did. This page isn&rsquo;t here.
      </p>
      <div className="flex items-center gap-2.5 pt-2">
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 bg-foreground text-foreground-inverse px-5 py-3 text-sm font-medium hover:bg-foreground/90 transition-colors"
        >
          Back to projects <span aria-hidden>→</span>
        </Link>
        <Link
          href="/"
          className="inline-flex items-center px-5 py-3 text-sm hover:bg-muted transition-colors"
        >
          Home
        </Link>
      </div>
    </div>
  );
}
