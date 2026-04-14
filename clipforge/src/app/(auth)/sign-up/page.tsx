"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signUp } from "@/app/actions/auth";
import { FieldInput, GoogleGlyph } from "@/app/(auth)/sign-in/page";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await signUp({ email, password, name });
      if (result.error && !result.success) {
        setError(result.error);
      } else {
        const signInResult = await signIn("credentials", {
          email,
          password,
          redirect: false,
        });
        if (signInResult?.error) {
          router.push("/sign-in");
        } else {
          router.push("/projects");
          router.refresh();
        }
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
        <span className="tag">Create account</span>
        <h1 className="font-heading text-[56px] tracking-[-0.032em] leading-[0.95]">
          Start editing.
        </h1>
        <p className="text-[13px] text-muted-foreground mt-1">
          Free forever. You bring your own API keys, you control the cost.
        </p>
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
            id="name"
            label="Name"
            type="text"
            placeholder="Abdulhamid Sonaike"
            value={name}
            onChange={setName}
            autoComplete="name"
            required
          />
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
            placeholder="At least 8 characters"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            required
            minLength={8}
          />

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 bg-foreground text-foreground-inverse px-5 py-3.5 text-sm font-medium hover:bg-foreground/90 transition-colors disabled:opacity-40"
          >
            {loading ? "Creating account…" : <>Create account <span aria-hidden>→</span></>}
          </button>
        </form>
      </div>

      <p className="text-[13px] text-muted-foreground">
        Already signed up?{" "}
        <Link
          href="/sign-in"
          className="text-foreground underline underline-offset-4 hover:opacity-70 transition-opacity"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
