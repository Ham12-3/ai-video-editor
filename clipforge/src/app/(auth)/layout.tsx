import { Film } from "lucide-react";
import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <nav className="border-b border-border/50 px-6 py-4">
        <Link href="/" className="flex items-center gap-2 w-fit">
          <Film className="h-6 w-6 text-primary" />
          <span className="text-lg font-semibold tracking-tight">
            ClipForge
          </span>
        </Link>
      </nav>
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        {children}
      </main>
    </div>
  );
}
