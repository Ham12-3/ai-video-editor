import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Film, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) {
    redirect("/projects");
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Nav */}
      <nav className="border-b border-border/50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Film className="h-6 w-6 text-primary" />
          <span className="text-lg font-semibold tracking-tight">
            ClipForge
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/sign-in">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </Link>
          <Link href="/sign-up">
            <Button size="sm">Get started</Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-2xl text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/5 text-sm text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            AI-powered video editing
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-tight">
            Edit videos with
            <br />
            <span className="text-primary">natural language</span>
          </h1>

          <p className="text-lg text-muted-foreground max-w-lg mx-auto leading-relaxed">
            Upload a video, describe what you want, and ClipForge handles the
            rest. Remove silences, add captions, reframe for vertical, all
            powered by your own OpenAI API key.
          </p>

          <div className="flex items-center justify-center gap-4">
            <Link href="/sign-up">
              <Button size="lg" className="gap-2">
                <Zap className="h-4 w-4" />
                Start editing
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-8 text-sm text-muted-foreground">
            <div className="space-y-2">
              <div className="font-medium text-foreground">Your API key</div>
              <p>Bring your own OpenAI key. Full control over costs.</p>
            </div>
            <div className="space-y-2">
              <div className="font-medium text-foreground">Smart editing</div>
              <p>AI understands your video and makes intelligent cuts.</p>
            </div>
            <div className="space-y-2">
              <div className="font-medium text-foreground">Short-form ready</div>
              <p>Optimized for TikTok, Reels, and YouTube Shorts.</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
