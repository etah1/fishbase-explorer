"use client";

import { useEffect, useRef, useState } from "react";
import MultiSelectDropdown from "@/components/MultiSelectDropdown";
import { formatTraitValue } from "@/utils/traitLabels";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type EditableField = {
  key: string;
  label: string;
  type: "text" | "integer" | "number";
};

type DataOverride = {
  id: string;
  genus: string;
  species: string;
  field_name: string;
  field_value: string;
  updated_at: string;
};

type SpeciesRecord = { genus: string; species: string };

const inputClass =
  "h-9 w-full rounded-md border border-black bg-white px-2.5 text-sm text-black shadow-sm focus:border-[#1b7cb2] focus:outline-none focus:ring-2 focus:ring-white";

export default function AdminDataEditor({ accessToken }: { accessToken: string }) {
  const [speciesOptions, setSpeciesOptions] = useState<{ key: string; label: string }[]>([]);
  const [speciesSelection, setSpeciesSelection] = useState<string[]>([]);
  const [fields, setFields] = useState<EditableField[]>([]);
  const [fieldName, setFieldName] = useState("");
  const [fieldValue, setFieldValue] = useState("");
  const [overrides, setOverrides] = useState<DataOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const editorRef = useRef<HTMLFormElement>(null);

  async function loadOverrides() {
    const response = await fetch(`${API}/admin/data-overrides`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error(`Could not load overrides (${response.status})`);
    const body = await response.json();
    setOverrides(body.data);
    setFields(body.fields);
    setFieldName((current) => current || body.fields[0]?.key || "");
  }

  useEffect(() => {
    Promise.all([
      fetch(`${API}/fish/species`).then((response) => {
        if (!response.ok) throw new Error(`Could not load species (${response.status})`);
        return response.json();
      }),
      fetch(`${API}/admin/data-overrides`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then((response) => {
        if (!response.ok) throw new Error(`Could not load overrides (${response.status})`);
        return response.json();
      }),
    ])
      .then(([speciesBody, overrideBody]) => {
        setSpeciesOptions(
          speciesBody.species.map(({ genus, species }: SpeciesRecord) => ({
            key: `${genus}_${species}`,
            label: `${genus} ${species}`,
          }))
        );
        setOverrides(overrideBody.data);
        setFields(overrideBody.fields);
        setFieldName(overrideBody.fields[0]?.key || "");
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "Could not load the editor.");
      })
      .finally(() => setLoading(false));
  }, [accessToken]);

  function selectSpecies(keys: string[]) {
    setSpeciesSelection(keys.length ? [keys[keys.length - 1]] : []);
  }

  async function saveOverride(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!speciesSelection.length || !fieldName || !fieldValue.trim()) {
      setError("Species, field, and value are required.");
      return;
    }
    const separator = speciesSelection[0].indexOf("_");
    const genus = speciesSelection[0].slice(0, separator);
    const species = speciesSelection[0].slice(separator + 1);
    setSaving(true);
    try {
      const response = await fetch(`${API}/admin/data-overrides`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ genus, species, field_name: fieldName, field_value: fieldValue }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail ?? `Save failed (${response.status})`);
      setFieldValue("");
      setMessage("Override saved. Public data now uses this value.");
      await loadOverrides();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save override.");
    } finally {
      setSaving(false);
    }
  }

  async function removeOverride(item: DataOverride) {
    // Removing an override restores the original FishBase value.
    if (!window.confirm("Remove this override and restore the original FishBase value?")) return;
    setRemoving(item.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${API}/admin/data-overrides/${item.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error(`Remove failed (${response.status})`);
      setOverrides((current) => current.filter((override) => override.id !== item.id));
      setMessage("Override removed. The original value is restored.");
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Could not remove override.");
    } finally {
      setRemoving(null);
    }
  }

  function editOverride(item: DataOverride) {
    setSpeciesSelection([`${item.genus}_${item.species}`]);
    setFieldName(item.field_name);
    setFieldValue(item.field_value);
    setMessage("Loaded override into the editor.");
    editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const selectedField = fields.find((field) => field.key === fieldName);

  return (
    <section className="mt-10 border-t border-black/15 pt-6">
      <h2 className="text-base font-bold">Manual data overrides</h2>
      <p className="mt-1 text-xs text-black/60">
        Admin overrides replace the displayed value. Removing one restores FishBase data.
      </p>

      {loading ? (
        <p className="mt-4 text-xs text-black/60">Loading editor...</p>
      ) : (
        <>
          <form ref={editorRef} onSubmit={saveOverride} className="mt-4 scroll-mt-4 grid gap-3 rounded-lg border border-black bg-white/80 p-4 shadow-sm sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Species
              <MultiSelectDropdown
                options={speciesOptions}
                selected={speciesSelection}
                onChange={selectSpecies}
                placeholder="Search species..."
                searchable
                searchPlaceholder="Search species..."
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Field
              <select className={inputClass} value={fieldName} onChange={(event) => setFieldName(event.target.value)}>
                {fields.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">
              New value
              <input
                className={inputClass}
                type={selectedField?.type === "text" ? "text" : "number"}
                step={selectedField?.type === "number" ? "any" : undefined}
                value={fieldValue}
                onChange={(event) => setFieldValue(event.target.value)}
              />
            </label>
            <button
              type="submit"
              disabled={saving}
              className="h-9 rounded-full border border-black bg-white px-4 text-sm font-semibold hover:bg-black hover:text-white disabled:opacity-40 sm:col-span-2"
            >
              {saving ? "Saving..." : "Save override"}
            </button>
          </form>

          {error && <p className="mt-3 text-xs text-red-700">{error}</p>}
          {message && <p className="mt-3 text-xs text-green-700">{message}</p>}

          <h3 className="mt-6 text-sm font-bold">Active overrides</h3>
          {overrides.length === 0 ? (
            <p className="mt-2 text-xs text-black/60">No manual overrides.</p>
          ) : (
            <div className="mt-2 max-h-[28rem] overflow-auto overscroll-contain rounded-lg border border-black [scrollbar-gutter:stable]">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10 border-b border-black bg-white shadow-[0_1px_0_0_rgba(0,0,0,1)]">
                  <tr>
                    <th className="px-2 py-1.5">Species</th>
                    <th className="px-2 py-1.5">Field</th>
                    <th className="px-2 py-1.5">Value</th>
                    <th className="px-2 py-1.5"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {overrides.map((item) => (
                    <tr key={item.id} className="border-b border-black/10 last:border-0">
                      <td className="px-2 py-1.5 italic">{item.genus} {item.species}</td>
                      <td className="px-2 py-1.5">{fields.find((field) => field.key === item.field_name)?.label ?? item.field_name}</td>
                      <td className="px-2 py-1.5">{formatTraitValue(item.field_name, item.field_value)}</td>
                      <td className="flex justify-end gap-2 px-2 py-1.5">
                        <button type="button" onClick={() => editOverride(item)} className="font-semibold hover:text-[#1b7cb2]">Edit</button>
                        <button
                          type="button"
                          disabled={removing !== null}
                          onClick={() => removeOverride(item)}
                          className="font-semibold text-red-700 hover:text-red-900 disabled:opacity-40"
                        >
                          {removing === item.id ? "Removing..." : "Remove"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
