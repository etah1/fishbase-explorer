"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { formatTraitField, formatTraitValue } from "@/utils/traitLabels";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type CommunityContribution = {
  display_name: string;
  field_name: string;
  field_value: string;
  source_citation: string;
  applied: boolean;
};

type ContributionDetailsProps = {
  genus: string;
  species: string;
  contributions: CommunityContribution[];
  onClose: () => void;
};

export default function ContributionDetails({ genus, species, contributions, onClose }: ContributionDetailsProps) {
  const [note, setNote] = useState("");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [noteStatus, setNoteStatus] = useState<"loading" | "signed-out" | "ready">("loading");
  const [noteMessage, setNoteMessage] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    // Load only the signed-in user's note for this species.
    let cancelled = false;
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      const token = data.session?.access_token ?? null;
      setAccessToken(token);
      if (!token) {
        setNoteStatus("signed-out");
        return;
      }
      try {
        const params = new URLSearchParams({ genus, species });
        const response = await fetch(`${API}/species-notes?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error("Unable to load your note.");
        const body = await response.json();
        if (!cancelled) {
          setNote(body.note ?? "");
          setNoteStatus("ready");
        }
      } catch (error) {
        if (!cancelled) {
          setNoteMessage(error instanceof Error ? error.message : "Unable to load your note.");
          setNoteStatus("ready");
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [genus, species]);

  async function saveNote(event: React.FormEvent) {
    event.preventDefault();
    if (!accessToken) return;
    setSavingNote(true);
    setNoteMessage("");
    try {
      const response = await fetch(`${API}/species-notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ genus, species, note }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail ?? "Unable to save your note.");
      setNote(body.note ?? "");
      setNoteMessage(body.note ? "Private note saved." : "Private note removed.");
    } catch (error) {
      setNoteMessage(error instanceof Error ? error.message : "Unable to save your note.");
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <div
      className="modal-overlay flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="contribution-title"
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-xl border border-black bg-white p-4 text-black shadow-xl [scrollbar-gutter:stable]"
      >
        <div className="sticky top-0 z-10 mb-4 flex items-start justify-between gap-4 bg-white py-1">
          <div>
            <h2 id="contribution-title" className="text-base font-bold">Researcher submissions</h2>
            <p className="text-sm italic text-black/65">{genus} {species}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-black px-2.5 py-1 text-xs font-semibold hover:bg-black hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {contributions.length === 0 ? (
            <p className="rounded-lg border border-black/15 p-3 text-sm text-black/55">
              No contributions.
            </p>
          ) : contributions.map((item, index) => (
            <article key={`${item.field_name}-${index}`} className="rounded-lg border border-black/20 p-3 text-sm">
              <p className="mb-2 text-xs font-semibold text-[#1b7cb2]">
                Submitted by {item.display_name || "Researcher"}
              </p>
              <p>
                <span className="font-semibold">{formatTraitField(item.field_name)}:</span>{" "}
                {formatTraitValue(item.field_name, item.field_value)}
              </p>
              <p className="mt-1 text-xs text-black/65">
                <span className="font-semibold">Source:</span>{" "}
                {item.source_citation || "Not provided"}
              </p>
              <p className={`mt-2 text-xs font-semibold ${item.applied ? "text-green-700" : "text-amber-700"}`}>
                {item.applied
                  ? "Applied to a FishBase data gap"
                  : "Not applied because FishBase already has a value"}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-5 border-t border-black/15 pt-4">
          <h3 className="text-sm font-bold">Your private note</h3>
          {noteStatus === "loading" ? (
            <p className="mt-2 text-xs text-black/55">Loading note...</p>
          ) : noteStatus === "signed-out" ? (
            <p className="mt-2 text-xs text-black/55">Log in to add a note visible only to you.</p>
          ) : (
            <form onSubmit={saveNote} className="mt-2">
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={2000}
                rows={4}
                placeholder="Add a private note about this species..."
                className="w-full resize-y rounded-lg border border-black/20 bg-white p-2 text-sm text-black outline-none focus:border-[#1b7cb2] focus:ring-2 focus:ring-[#9fd1ff]"
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-xs text-black/55">Only you can view this note.</p>
                <button
                  type="submit"
                  disabled={savingNote}
                  className="h-8 shrink-0 rounded-full border border-black px-4 text-xs font-semibold hover:bg-black hover:text-white disabled:opacity-40"
                >
                  {savingNote ? "Saving..." : "Save note"}
                </button>
              </div>
            </form>
          )}
          {noteMessage && <p className="mt-2 text-xs text-black/60">{noteMessage}</p>}
        </div>
      </section>
    </div>
  );
}
