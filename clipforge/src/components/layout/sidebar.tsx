"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/projects", label: "Projects" },
  { href: "/settings", label: "Settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const name = session?.user?.name ?? session?.user?.email?.split("@")[0] ?? "Signed in";
  const email = session?.user?.email ?? "";

  return (
    <aside className="w-[220px] shrink-0 border-r border-border flex flex-col h-screen sticky top-0 px-6 py-8">
      {/* Wordmark */}
      <Link href="/projects" className="text-[22px] font-heading tracking-[-0.02em] leading-none">
        ClipForge
      </Link>

      {/* Nav */}
      <nav className="mt-9 flex flex-col gap-3">
        <div className="tag">Workspace</div>
        <div className="flex flex-col gap-1">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "px-3 py-2.5 text-sm transition-colors",
                  isActive
                    ? "bg-muted text-foreground font-medium"
                    : "text-foreground hover:bg-muted/60"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* User — anchored to bottom */}
      <div className="mt-auto pt-6 border-t border-border">
        <div className="text-[13px] font-medium text-foreground truncate">{name}</div>
        {email && (
          <div className="text-[11px] font-mono text-muted-foreground tracking-wide truncate mt-0.5">
            {email}
          </div>
        )}
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/" })}
          className="mt-3 text-[12px] font-mono tracking-[0.18em] uppercase text-muted-foreground hover:text-foreground transition-colors"
        >
          Sign out →
        </button>
      </div>
    </aside>
  );
}
