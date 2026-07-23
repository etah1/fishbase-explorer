"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

const fieldClass =
  "h-9 w-full rounded-md border border-black bg-white px-2.5 text-sm text-black shadow-sm focus:border-[#1b7cb2] focus:outline-none focus:ring-2 focus:ring-[#9fd1ff]";

export default function LoginModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const titleId = useId();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);
    const supabase = createClient();

    if (mode === "login") {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      setSubmitting(false);
      if (authError) return setError(authError.message);
      onClose();
      router.refresh();
      return;
    }

    const { error: authError } = await supabase.auth.signUp({ email, password });
    setSubmitting(false);
    if (authError) return setError(authError.message);
    setMessage("Check your email to confirm your account, then log in.");
  }

  return (
    <div
      className="modal-overlay flex items-center justify-center bg-black/20 px-4 backdrop-blur-[3px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
        className="relative w-full max-w-sm rounded-2xl border border-black/15 bg-white p-6 text-black shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-3 text-lg text-black/40 hover:text-black"
          aria-label="Close login dialog"
        >
          x
        </button>
        <h1 id={titleId} className="mb-1 pr-8 text-lg font-bold">
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
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
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
              onChange={(event) => setPassword(event.target.value)}
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
          className="mt-4 w-full text-xs font-medium text-black/60 underline hover:text-black"
        >
          {mode === "login" ? "Need an account? Sign up" : "Already have an account? Log in"}
        </button>
      </section>
    </div>
  );
}
