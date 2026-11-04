"use client";

import { useMemo, useRef, useState } from "react";
import { formatTraitField, formatTraitValue, getTraitValueOptions } from "@/utils/traitLabels";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const PREVIEW_ROW_LIMIT = 300;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const fieldClass =
  "h-9 w-full rounded-md border border-black bg-white px-2.5 text-sm text-black shadow-sm focus:border-[#1b7cb2] focus:outline-none focus:ring-2 focus:ring-white";
const buttonClass =
  "rounded-full border border-black bg-white px-4 py-1.5 text-xs font-semibold text-black shadow-sm hover:bg-black hover:text-white disabled:opacity-40";

type Change = {
  row: number;
  genus: string;
  species: string;
  field_name: string;
  field_value: string;
  current_value: string | null;
  kind: "fills_gap" | "differs";
  is_custom: boolean;
  source_citation: string;
};

type Preview = {
  changes: Change[];
  errors: { row: number; field: string | null; message: string }[];
  error_count: number;
  unknown_species: string[];
  unchanged_count: number;
  already_submitted_count: number;
  rows_read: number;
  warnings: string[];
  fields: { field_name: string; column: string; is_custom: boolean }[];
  max_changes: number;
};

const CATEGORY_FIELDS = ["Fertilization", "ParentalCare", "RepGuild1", "RepGuild2"];

export default function BulkUpload({
  accessToken,
  onSubmitted,
}: {
  accessToken: string;
  onSubmitted: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [excludedFields, setExcludedFields] = useState<Set<string>>(new Set());
  const [defaultCitation, setDefaultCitation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showHelp, setShowHelp] = useState(false);

  const included = useMemo(
    () => (preview ? preview.changes.filter((c) => !excludedFields.has(c.field_name)) : []),
    [preview, excludedFields]
  );

  const fieldSummary = useMemo(() => {
    if (!preview) return [];
    return preview.fields
      .map((f) => {
        const rows = preview.changes.filter((c) => c.field_name === f.field_name);
        return {
          ...f,
          total: rows.length,
          fills: rows.filter((c) => c.kind === "fills_gap").length,
          differs: rows.filter((c) => c.kind === "differs").length,
        };
      })
      .filter((f) => f.total > 0);
  }, [preview]);

  const missingCitations = included.filter((c) => !c.source_citation).length;

  async function downloadTemplate() {
    setDownloading(true);
    setError("");
    try {
      const res = await fetch(`${API}/submissions/template`);
      if (!res.ok) throw new Error(`Template download failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cichlid-traits-template.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Template download failed.");
    } finally {
      setDownloading(false);
    }
  }

  async function handleFile(file: File) {
    setFileName(file.name);
    setPreview(null);
    setExcludedFields(new Set());
    setError("");
    setSuccess("");
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("File is larger than 5 MB. Split it into smaller uploads.");
      return;
    }
    setPreviewing(true);
    try {
      const res = await fetch(
        `${API}/submissions/bulk/preview?filename=${encodeURIComponent(file.name)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            Authorization: `Bearer ${accessToken}`,
          },
          body: file,
        }
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.detail ?? `Could not read the file (${res.status})`);
      setPreview(body as Preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the file.");
    } finally {
      setPreviewing(false);
    }
  }

  function toggleField(field: string) {
    setExcludedFields((current) => {
      const next = new Set(current);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  }

  function reset() {
    setPreview(null);
    setFileName("");
    setExcludedFields(new Set());
    if (fileInput.current) fileInput.current.value = "";
  }

  async function submit() {
    if (!preview || included.length === 0) return;
    if (included.length > preview.max_changes) {
      setError(
        `Upload at most ${preview.max_changes.toLocaleString()} values at a time. Split the file or untick some fields.`
      );
      return;
    }
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`${API}/submissions/bulk`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          default_citation: defaultCitation.trim(),
          changes: included.map((c) => ({
            genus: c.genus,
            species: c.species,
            field_name: c.field_name,
            field_value: c.field_value,
            source_citation: c.source_citation,
          })),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.detail ?? `Upload failed (${res.status})`);
      setSuccess(
        `Submitted ${body.count.toLocaleString()} value${body.count === 1 ? "" : "s"} for review as one upload.`
      );
      reset();
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-black bg-white/80 p-4 shadow-sm">
      <ol className="flex list-decimal flex-col gap-1 pl-4 text-xs text-black/80">
        <li>
          Download the template. It lists every cichlid species with its current public values
          and opens in Excel or Google Sheets.
        </li>
        <li>
          Fill in or correct values. To add a new trait (for example 5 jaw-shape metrics), add one
          column per trait with your own header. Put a citation in the <em>Source citation</em>{" "}
          column or set one for the whole file below.
        </li>
        <li>
          Upload the file as .csv or .xlsx. Only cells that differ from the public data are
          submitted, and you&apos;ll see a preview first.
        </li>
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={downloadTemplate} disabled={downloading} className={buttonClass}>
          {downloading ? "Preparing..." : "Download template (CSV)"}
        </button>
        <label className={`${buttonClass} cursor-pointer`}>
          {previewing ? "Reading file..." : "Upload filled-in file"}
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            disabled={previewing || submitting}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </label>
        {fileName && <span className="text-xs text-black/60">{fileName}</span>}
        <button
          type="button"
          onClick={() => setShowHelp((v) => !v)}
          className="ml-auto text-xs text-black underline"
        >
          {showHelp ? "Hide formatting rules" : "Formatting rules"}
        </button>
      </div>

      {showHelp && (
        <div className="rounded-md border border-black/20 bg-white p-3 text-xs text-black/80">
          <p className="mb-2">
            Your own spreadsheet works too if it has <strong>Genus</strong> and <strong>Species</strong>{" "}
            columns, or one <strong>Scientific name</strong> column. Blank cells are ignored, so
            uploads never delete data. Headers can be the template names or the labels shown on
            the site (for example &quot;Diet&quot;).
          </p>
          <ul className="flex list-disc flex-col gap-1 pl-4">
            {CATEGORY_FIELDS.map((field) => (
              <li key={field}>
                <strong>{field}</strong> ({formatTraitField(field)}):{" "}
                {getTraitValueOptions(field).map((o) => o.value).join(", ")}
              </li>
            ))}
            <li>
              <strong>IUCN_Code</strong>: LC, NT, VU, EN, CR, EW, EX, DD, NE
            </li>
            <li>
              <strong>Encephalization</strong>, <strong>GrowthRate</strong>: numbers
            </li>
            <li>
              <strong>Lake</strong>, <strong>Country</strong>, <strong>Continent</strong>: separate
              several values with semicolons
            </li>
            <li>Any other column is added as a new custom trait (free text or numbers).</li>
          </ul>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
      {success && <p className="text-xs text-green-700">{success}</p>}

      {preview && (
        <div className="flex flex-col gap-3 border-t border-black/10 pt-3">
          <p className="text-xs">
            Read {preview.rows_read.toLocaleString()} rows.{" "}
            <strong>{preview.changes.length.toLocaleString()} new or changed values</strong>
            {preview.unchanged_count > 0 &&
              `, ${preview.unchanged_count.toLocaleString()} already match the public data`}
            {preview.already_submitted_count > 0 &&
              `, ${preview.already_submitted_count.toLocaleString()} you've already submitted`}
            {preview.error_count > 0 && (
              <span className="text-red-600">
                , {preview.error_count >= 200 ? "200+" : preview.error_count} problem
                {preview.error_count === 1 ? "" : "s"}
              </span>
            )}
            .
          </p>

          {preview.warnings.map((w) => (
            <p key={w} className="text-xs text-black/60">
              {w}
            </p>
          ))}

          {preview.errors.length > 0 && (
            <details
              className="rounded-md border border-black/20 bg-white p-2 text-xs"
              open={preview.changes.length === 0}
            >
              <summary className="cursor-pointer font-semibold text-red-600">
                Values that will be skipped ({preview.errors.length >= 200 ? "first 200" : preview.errors.length})
              </summary>
              <ul className="mt-2 max-h-48 overflow-auto">
                {preview.errors.map((e, i) => (
                  <li key={i} className="py-0.5">
                    Row {e.row}
                    {e.field ? `, ${formatTraitField(e.field)}` : ""}: {e.message}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {fieldSummary.length > 0 && (
            <div className="overflow-auto rounded-md border border-black">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-black bg-black/5">
                    <th className="px-2 py-1.5">Include</th>
                    <th className="px-2 py-1.5">Field</th>
                    <th className="px-2 py-1.5">Fills a gap</th>
                    <th className="px-2 py-1.5">Differs from current</th>
                  </tr>
                </thead>
                <tbody>
                  {fieldSummary.map((f) => (
                    <tr key={f.field_name} className="border-b border-black/10 last:border-0">
                      <td className="px-2 py-1.5">
                        <input
                          type="checkbox"
                          checked={!excludedFields.has(f.field_name)}
                          onChange={() => toggleField(f.field_name)}
                          aria-label={`Include ${f.field_name}`}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        {formatTraitField(f.field_name)}
                        {f.is_custom && (
                          <span className="ml-1.5 rounded-full border border-black/30 px-1.5 text-[10px]">
                            new trait
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">{f.fills}</td>
                      <td className="px-2 py-1.5">{f.differs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {preview.changes.some((c) => c.kind === "differs") && (
            <p className="text-xs text-black/60">
              Values that differ from the current data are kept as an alternative record with your
              citation once approved. They don&apos;t replace FishBase&apos;s own value.
            </p>
          )}

          {included.length > 0 && (
            <div className="max-h-72 overflow-auto overscroll-contain rounded-md border border-black [scrollbar-gutter:stable]">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-white shadow-[0_1px_0_0_rgba(0,0,0,1)]">
                  <tr className="bg-black/5">
                    <th className="px-2 py-1.5">Row</th>
                    <th className="px-2 py-1.5">Species</th>
                    <th className="px-2 py-1.5">Field</th>
                    <th className="px-2 py-1.5">Current</th>
                    <th className="px-2 py-1.5">New</th>
                  </tr>
                </thead>
                <tbody>
                  {included.slice(0, PREVIEW_ROW_LIMIT).map((c) => (
                    <tr
                      key={`${c.genus}_${c.species}_${c.field_name}`}
                      className="border-b border-black/10 last:border-0"
                    >
                      <td className="px-2 py-1 text-black/60">{c.row}</td>
                      <td className="px-2 py-1 italic">
                        {c.genus} {c.species}
                      </td>
                      <td className="px-2 py-1">{formatTraitField(c.field_name)}</td>
                      <td className="px-2 py-1 text-black/60">
                        {c.current_value == null ? "None" : formatTraitValue(c.field_name, c.current_value)}
                      </td>
                      <td className="px-2 py-1 font-semibold">{formatTraitValue(c.field_name, c.field_value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {included.length > PREVIEW_ROW_LIMIT && (
                <p className="px-2 py-1.5 text-xs text-black/60">
                  ...and {(included.length - PREVIEW_ROW_LIMIT).toLocaleString()} more
                </p>
              )}
            </div>
          )}

          {included.length > 0 && (
            <>
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Citation for values without one
                {missingCitations > 0 && ` (${missingCitations.toLocaleString()})`}
                <input
                  className={fieldClass}
                  value={defaultCitation}
                  onChange={(e) => setDefaultCitation(e.target.value)}
                  placeholder="Paper, DOI, or dataset this file comes from"
                  maxLength={500}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={submit} disabled={submitting} className={buttonClass}>
                  {submitting
                    ? "Submitting..."
                    : `Submit ${included.length.toLocaleString()} value${included.length === 1 ? "" : "s"} for review`}
                </button>
                <button type="button" onClick={reset} disabled={submitting} className={buttonClass}>
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
