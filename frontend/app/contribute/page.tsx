"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import MultiSelectDropdown from "@/components/MultiSelectDropdown";
import { createClient } from "@/utils/supabase/client";
import { formatTraitField, formatTraitValue, getTraitValueOptions } from "@/utils/traitLabels";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const FIELD_OPTIONS = [
  { key: "Fertilization", label: "Fertilization site" },
  { key: "ParentalCare", label: formatTraitField("ParentalCare") },
  { key: "RepGuild1", label: formatTraitField("RepGuild1") },
  { key: "RepGuild2", label: formatTraitField("RepGuild2") },
  { key: "MatingSystem", label: "Mating system" },
  { key: "FeedingType", label: "Diet" },
  { key: "Encephalization", label: "Brain size (relative to body)" },
  { key: "Lake", label: "Lake" },
  { key: "Country", label: "Country" },
  { key: "Continent", label: "Continent" },
  { key: "IUCN_Code", label: "Conservation status" },
  { key: "GrowthRate", label: "Growth rate (K)" },
  { key: "__custom__", label: "Other (custom field)" },
];

const fieldClass =
  "h-9 w-full rounded-md border border-black bg-white px-2.5 text-sm text-black shadow-sm focus:border-[#1b7cb2] focus:outline-none focus:ring-2 focus:ring-white";

type Submission = {
  id: string;
  genus: string;
  species: string;
  field_name: string;
  field_value: string;
  source_citation: string;
  status: "pending" | "approved" | "rejected";
  review_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
};

export default function ContributePage() {
  const [userEmail, setUserEmail] = useState<string | null | undefined>(undefined);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const [speciesSel, setSpeciesSel] = useState<string[]>([]);
  const [fieldKey, setFieldKey] = useState(FIELD_OPTIONS[0].key);
  const [customField, setCustomField] = useState("");
  const [fieldValue, setFieldValue] = useState("");
  const [citation, setCitation] = useState("");

  const [speciesOptions, setSpeciesOptions] = useState<{ key: string; label: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [mine, setMine] = useState<Submission[]>([]);
  const [loadingMine, setLoadingMine] = useState(true);
  const valueOptions = getTraitValueOptions(fieldKey);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setUserEmail(data.session?.user.email ?? null);
      setAccessToken(data.session?.access_token ?? null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? null);
      setAccessToken(session?.access_token ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    fetch(`${API}/fish/species`)
      .then((res) => {
        if (!res.ok) throw new Error(`Species request failed (${res.status})`);
        return res.json();
      })
      .then((data) => {
        setSpeciesOptions(
          data.species.map(({ genus, species }: { genus: string; species: string }) => ({
            key: `${genus}_${species}`,
            label: `${genus} ${species}`,
          }))
        );
      })
      .catch(() => setError("Could not load the species list."));
  }, []);

  function handleSpeciesChange(keys: string[]) {
    setSpeciesSel(keys.length === 0 ? [] : [keys[keys.length - 1]]);
  }

  async function loadMine(token: string) {
    try {
      const res = await fetch(`${API}/submissions/mine`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const body = await res.json();
        setMine(body.data);
      }
    } finally {
      setLoadingMine(false);
    }
  }

  useEffect(() => {
    if (!accessToken) return;
    loadMine(accessToken);
  }, [accessToken]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!accessToken) {
      setError("You must be logged in to submit.");
      return;
    }
    if (speciesSel.length === 0) {
      setError("Pick a species.");
      return;
    }
    const separator = speciesSel[0].indexOf("_");
    const genus = speciesSel[0].slice(0, separator);
    const species = speciesSel[0].slice(separator + 1);
    const resolvedFieldName = fieldKey === "__custom__" ? customField.trim() : fieldKey;
    if (!resolvedFieldName) {
      setError("Field name is required.");
      return;
    }
    if (!fieldValue.trim()) {
      setError("Value is required.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API}/submissions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          genus,
          species,
          field_name: resolvedFieldName,
          field_value: fieldValue.trim(),
          source_citation: citation.trim(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ?? `Submission failed (${res.status})`);
      }
      setSuccess("Submitted. It'll appear below once reviewed.");
      setFieldValue("");
      setCitation("");
      await loadMine(accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUndo(submission: Submission) {
    if (!accessToken || undoing) return;
    const approvedWarning =
      submission.status === "approved" ? " It will also be removed from the site." : "";
    if (!window.confirm(`Undo this submission?${approvedWarning}`)) return;

    setUndoing(submission.id);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`${API}/submissions/${submission.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ?? `Undo failed (${res.status})`);
      }
      setMine((current) => current.filter((item) => item.id !== submission.id));
      setSuccess("Submission undone.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not undo submission.");
    } finally {
      setUndoing(null);
    }
  }

  if (userEmail === undefined) {
    return <main className="px-4 py-12 text-center text-black">Loading...</main>;
  }

  if (userEmail === null) {
    return (
      <main className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center px-4 py-12 text-center text-black">
        <p className="mb-4 text-sm">Log in to contribute trait data.</p>
        <Link
          href="/login"
          className="rounded-full border border-black bg-white px-4 py-1.5 text-xs font-semibold text-black shadow-sm hover:bg-black hover:text-white"
        >
          Log in
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 text-black sm:px-6">
      <h1 className="mb-1 text-lg font-bold">Contribute trait data</h1>
      <p className="mb-6 text-xs text-black/60">
        Submissions are reviewed before appearing on the site, and only fill gaps.
        They never override FishBase&apos;s own values. A source citation is highly recommended.
      </p>

      <form onSubmit={handleSubmit} className="mb-10 flex flex-col gap-3 rounded-lg border border-black bg-white/80 p-4 shadow-sm">
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Species
          <MultiSelectDropdown
            options={speciesOptions}
            selected={speciesSel}
            onChange={handleSpeciesChange}
            placeholder="Search species..."
            searchable
            searchPlaceholder="Search species..."
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-semibold">
          Field
          <select
            className={fieldClass}
            value={fieldKey}
            onChange={(e) => {
              setFieldKey(e.target.value);
              setFieldValue("");
            }}
          >
            {FIELD_OPTIONS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </label>

        {fieldKey === "__custom__" && (
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Custom field name
            <input
              className={fieldClass}
              value={customField}
              onChange={(e) => setCustomField(e.target.value)}
              placeholder="e.g. ClutchSize"
            />
          </label>
        )}

        <label className="flex flex-col gap-1 text-xs font-semibold">
          Value
          {valueOptions.length > 0 ? (
            <select className={fieldClass} value={fieldValue} onChange={(e) => setFieldValue(e.target.value)}>
              <option value="">Select a value...</option>
              {valueOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          ) : (
            <input
              className={fieldClass}
              value={fieldValue}
              onChange={(e) => setFieldValue(e.target.value)}
            />
          )}
        </label>

        <label className="flex flex-col gap-1 text-xs font-semibold">
          Source citation (highly recommended)
          <input
            className={fieldClass}
            value={citation}
            onChange={(e) => setCitation(e.target.value)}
            placeholder="Paper, DOI, or field observation with context"
          />
        </label>

        {error && <p className="text-xs text-red-600">{error}</p>}
        {success && <p className="text-xs text-green-700">{success}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 h-9 rounded-full border border-black bg-white text-sm font-semibold text-black shadow-sm hover:bg-black hover:text-white disabled:opacity-40"
        >
          {submitting ? "Submitting..." : "Submit"}
        </button>
      </form>

      <h2 className="mb-2 text-sm font-bold">Your submissions</h2>
      {loadingMine ? (
        <p className="text-xs text-black/60">Loading...</p>
      ) : mine.length === 0 ? (
        <p className="text-xs text-black/60">No submissions yet.</p>
      ) : (
        <div className="max-h-[28rem] overflow-auto overscroll-contain rounded-lg border border-black [scrollbar-gutter:stable]">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_0_rgba(0,0,0,1)]">
              <tr className="border-b border-black bg-black/5">
                <th className="px-2 py-1.5">Species</th>
                <th className="px-2 py-1.5">Field</th>
                <th className="px-2 py-1.5">Value</th>
                <th className="px-2 py-1.5">Status</th>
                <th className="px-2 py-1.5">Review notes</th>
                <th className="px-2 py-1.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {mine.map((s) => (
                <tr key={s.id} className="border-b border-black/10 last:border-0">
                  <td className="px-2 py-1.5 italic">
                    {s.genus} {s.species}
                  </td>
                  <td className="px-2 py-1.5">{formatTraitField(s.field_name)}</td>
                  <td className="px-2 py-1.5">{formatTraitValue(s.field_name, s.field_value)}</td>
                  <td
                    className={`px-2 py-1.5 font-semibold capitalize ${
                      s.status === "approved"
                        ? "text-green-700"
                        : s.status === "rejected"
                          ? "text-red-700"
                          : "text-black"
                    }`}
                  >
                    {s.status}
                  </td>
                  <td className="px-2 py-1.5 text-black/60">{s.review_notes ?? "None"}</td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      type="button"
                      disabled={undoing !== null}
                      onClick={() => handleUndo(s)}
                      className="rounded-full border border-black bg-white px-2.5 py-1 text-xs font-semibold text-black hover:bg-black hover:text-white disabled:opacity-40"
                    >
                      {undoing === s.id ? "Undoing..." : "Undo"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
