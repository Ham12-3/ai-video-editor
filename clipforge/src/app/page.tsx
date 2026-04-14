import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) {
    redirect("/projects");
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Nav */}
      <nav className="px-12 py-6 flex items-center justify-between">
        <Link href="/" className="font-heading text-[28px] tracking-[-0.025em] font-medium leading-none">
          ClipForge
        </Link>
        <div className="flex items-center gap-8 text-sm">
          <Link href="/projects" className="hover:opacity-70 transition-opacity">
            Projects
          </Link>
          <Link href="/sign-in" className="hover:opacity-70 transition-opacity">
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="inline-flex items-center gap-2 bg-foreground text-foreground-inverse px-5 py-2.5 hover:bg-foreground/90 transition-colors"
          >
            Start editing <span aria-hidden>→</span>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col justify-end px-12 pb-18 gap-7">
        <span className="tag">An AI video editor</span>
        <h1 className="font-heading font-normal text-[clamp(64px,16vw,180px)] tracking-[-0.04em] leading-[0.92]">
          Cut less.
          <br />
          Ship more.
        </h1>

        <div className="flex items-end justify-between gap-16 flex-wrap pt-6">
          <div className="max-w-[480px] flex flex-col gap-4">
            <p className="text-base leading-[1.55]">
              Upload a talking head. Describe the edit in plain English. ClipForge trims the dead
              air, speeds up the slow bits, drops in captions, reframes to vertical, and fills the
              screen with real photos of whatever you mention.
            </p>
            <p className="text-sm italic text-muted-foreground leading-[1.55]">
              Bring your own OpenAI and Gemini keys. You control the cost. We control the taste.
            </p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <span className="tag">v0.4 · in development</span>
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-3 bg-foreground text-foreground-inverse px-7 py-4.5 text-base font-medium hover:bg-foreground/90 transition-colors"
            >
              Start your first edit <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
