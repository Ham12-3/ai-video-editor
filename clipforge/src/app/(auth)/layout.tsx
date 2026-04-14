import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <nav className="px-12 py-6 border-b border-border">
        <Link
          href="/"
          className="font-heading text-[22px] font-medium tracking-[-0.02em] leading-none w-fit"
        >
          ClipForge
        </Link>
      </nav>
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        {children}
      </main>
    </div>
  );
}
