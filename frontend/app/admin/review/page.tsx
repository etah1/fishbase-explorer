"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AdminDataEditor from "@/components/AdminDataEditor";
import { createClient } from "@/utils/supabase/client";
import { formatTraitField, formatTraitValue } from "@/utils/traitLabels";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type PendingSubmission = {
  id: string;
  submitter_email: string;
  submitter_display_name: string;
  genus: string;
  species: string;
  field_name: string;
  field_value: string;
  source_citation: string;
  created_at: string;
};

type Status = "loading" | "unauthenticated" | "forbidden" | "ready" | "error";

export default function AdminReviewPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingSubmission[]>([]);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token ?? null;
      setAccessToken(token);
      if (!token) {
        setStatus("unauthenticated");
        return;
      }
      fetch(`${API}/submissions/pending`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (res.status === 403) {
            setStatus("forbidden");
            return null;
          }
          if (!res.ok) throw new Error(`Request failed (${res.status})`);
          return res.json();
        })
        .then((body) => {
          if (body) {
            setPending(body.data);
            setStatus("ready");
          }
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Could not load submissions.");
          setStatus("error");
        });
    });
  }, []);

  async function act(id: string, action: "approve" | "reject") {
    if (!accessToken) return;
    setActingOn(id);
    setError("");
    try {
      const res = await fetch(`${API}/submissions/${id}/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ review_notes: reviewNotes[id]?.trim() || null }),
      });
      if (!res.ok) throw new Error(`Action failed (${res.status})`);
      setPending((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setActingOn(null);
    }
  }

  if (status === "loading") {
    return <main className="px-4 py-12 text-center text-black">Loading...</main>;
  }

  if (status === "unauthenticated") {
    return (
      <main className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center px-4 py-12 text-center text-black">
        <p className="mb-4 text-sm">Log in as an admin to review submissions.</p>
        <Link
          href="/login"
          className="rounded-full border border-black bg-white px-4 py-1.5 text-xs font-semibold text-black shadow-sm hover:bg-black hover:text-white"
        >
          Log in
        </Link>
      </main>
    );
  }

  if (status === "forbidden") {
    return (
      <main className="px-4 py-12 text-center text-sm text-black">
        This account doesn&apos;t have review access.
      </main>
    );
  }

  if (status === "error") {
    return <main className="px-4 py-12 text-center text-sm text-black">{error}</main>;
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 text-black sm:px-6">
      <h1 className="mb-1 text-lg font-bold">Review submissions</h1>
      <p className="mb-6 text-xs text-black/60">
        {pending.length} pending submission{pending.length === 1 ? "" : "s"}.
      </p>

      {error && <p className="mb-4 text-xs text-red-600">{error}</p>}

      {pending.length === 0 ? (
        <p className="text-xs text-black/60">Nothing to review.</p>
      ) : (
        <div className="flex max-h-[32rem] flex-col gap-3 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]">
          {pending.map((s) => (
            <div key={s.id} className="rounded-lg border border-black bg-white/80 p-3 shadow-sm">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-xs">
                <span className="font-semibold italic">
                  {s.genus} {s.species}
                </span>
                <span className="text-black/60">
                  {s.submitter_display_name} ({s.submitter_email})
                </span>
              </div>
              <p className="mb-1 text-xs">
                <span className="font-semibold">{formatTraitField(s.field_name)}:</span>{" "}
                {formatTraitValue(s.field_name, s.field_value)}
              </p>
              <p className="mb-1 text-xs text-black/70">
                <span className="font-semibold">Source:</span>{" "}
                {s.source_citation || "Not provided"}
              </p>
              <input
                type="text"
                placeholder="Review notes (optional)"
                value={reviewNotes[s.id] ?? ""}
                onChange={(e) =>
                  setReviewNotes((prev) => ({ ...prev, [s.id]: e.target.value }))
                }
                className="mt-2 h-8 w-full rounded-md border border-black bg-white px-2 text-xs text-black shadow-sm focus:border-[#1b7cb2] focus:outline-none focus:ring-2 focus:ring-white"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={actingOn === s.id}
                  onClick={() => act(s.id, "approve")}
                  className="h-7 rounded-full border border-black bg-white px-3 text-xs font-semibold text-black shadow-sm hover:bg-black hover:text-white disabled:opacity-40"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={actingOn === s.id}
                  onClick={() => act(s.id, "reject")}
                  className="h-7 rounded-full border border-black bg-white px-3 text-xs font-semibold text-black shadow-sm hover:bg-black hover:text-white disabled:opacity-40"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {accessToken && <AdminDataEditor accessToken={accessToken} />}
    </main>
  );
}
