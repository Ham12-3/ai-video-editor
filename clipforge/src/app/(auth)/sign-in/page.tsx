"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (result?.error) {
        setError("Invalid email or password");
      } else {
        router.push("/projects");
        router.refresh();
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    await signIn("google", { callbackUrl: "/projects" });
  }

  return (
    <div className="w-full max-w-[440px] flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <span className="tag">Sign in</span>
        <h1 className="font-heading text-[56px] tracking-[-0.032em] leading-[0.95]">
          Welcome back.
        </h1>
      </div>

      <div className="flex flex-col gap-5">
        <button
          type="button"
          onClick={handleGoogleSignIn}
          className="inline-flex items-center justify-center gap-3 w-full px-5 py-3.5 border border-foreground text-sm font-medium hover:bg-foreground hover:text-foreground-inverse transition-colors"
        >
          <GoogleGlyph />
          Continue with Google
        </button>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border" />
          <span className="tag">Or</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="border border-accent px-4 py-3 text-sm text-accent">{error}</div>
          )}

          <FieldInput
            id="email"
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            required
          />
          <FieldInput
            id="password"
            label="Password"
            type="password"
            placeholder="Your password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            required
          />

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 bg-foreground text-foreground-inverse px-5 py-3.5 text-sm font-medium hover:bg-foreground/90 transition-colors disabled:opacity-40"
          >
            {loading ? "Signing in…" : <>Sign in <span aria-hidden>→</span></>}
          </button>
        </form>
      </div>

      <p className="text-[13px] text-muted-foreground">
        New here?{" "}
        <Link href="/sign-up" className="text-foreground underline underline-offset-4 hover:opacity-70 transition-opacity">
          Create an account
        </Link>
      </p>
    </div>
  );
}

export function FieldInput({
  id,
  label,
  type,
  placeholder,
  value,
  onChange,
  autoComplete,
  required,
  minLength,
}: {
  id: string;
  label: string;
  type: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="tag">
        {label}
      </label>
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        className="w-full px-4 py-3 text-[15px] bg-transparent border-b border-foreground focus:outline-none placeholder:italic placeholder:text-muted-foreground/60"
      />
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export { GoogleGlyph };
