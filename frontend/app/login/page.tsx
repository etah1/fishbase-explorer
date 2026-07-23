"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

const fieldClass =
  "h-9 w-full rounded-md border border-black bg-white px-2.5 text-sm text-black shadow-sm focus:border-[#1b7cb2] focus:outline-none focus:ring-2 focus:ring-white";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);
    const supabase = createClient();

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setSubmitting(false);
      if (error) {
        setError(error.message);
        return;
      }
      router.push("/");
      router.refresh();
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      setSubmitting(false);
      if (error) {
        setError(error.message);
        return;
      }
      setMessage("Check your email to confirm your account, then log in.");
    }
  }

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-sm flex-col justify-center px-4 py-12 text-black">
      <h1 className="mb-1 text-lg font-bold">
        {mode === "login" ? "Log in" : "Sign up"}
      </h1>
      <p className="mb-6 text-xs text-black/60">
        For researchers contributing trait data to Cichlid Explorer.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Password
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={fieldClass}
          />
        </label>

        {error && <p className="text-xs text-red-600">{error}</p>}
        {message && <p className="text-xs text-green-700">{message}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 h-9 rounded-full border border-black bg-white text-sm font-semibold text-black shadow-sm hover:bg-black hover:text-white disabled:opacity-40"
        >
          {submitting ? "Please wait..." : mode === "login" ? "Log in" : "Sign up"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "login" ? "signup" : "login");
          setError("");
          setMessage("");
        }}
        className="mt-4 text-xs font-medium text-black/60 underline hover:text-black"
      >
        {mode === "login" ? "Need an account? Sign up" : "Already have an account? Log in"}
      </button>

      <Link href="/" className="mt-6 text-xs text-black/45 hover:text-black">
        Back to Cichlid Explorer
      </Link>
    </main>
  );
}
