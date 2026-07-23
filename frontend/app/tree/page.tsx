"use client";

import { useEffect, useMemo, useState } from "react";
import PhyloTree, { collectLeafNames, ColumnDef, ColumnLegend, formatLegendLabel, TreeNode } from "@/components/PhyloTree";
import MultiSelectDropdown from "@/components/MultiSelectDropdown";
import { formatTraitField } from "@/utils/traitLabels";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const AVAILABLE_COLUMNS: ColumnDef[] = [
  { key: "RepGuild2", label: formatTraitField("RepGuild2"), type: "categorical" },
  { key: "RepGuild1", label: formatTraitField("RepGuild1"), type: "categorical" },
  { key: "Fertilization", label: "Fertilization site", type: "categorical" },
  { key: "ParentalCare", label: formatTraitField("ParentalCare"), type: "categorical" },
  { key: "MatingSystem", label: "Mating system", type: "categorical" },
  { key: "FeedingType", label: "Diet", type: "categorical" },
  { key: "Encephalization", label: "Brain size (relative to body)", type: "continuous" },
  { key: "Lake", label: "Lake", type: "categorical" },
  { key: "Country", label: "Country", type: "categorical" },
  { key: "Continent", label: "Continent", type: "categorical" },
  { key: "IUCN_Code", label: "Conservation status", type: "status" },
  { key: "GrowthRate", label: "Growth rate (K)", type: "continuous" },
];

export default function TreePage() {
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [legends, setLegends] = useState<ColumnLegend[]>([]);
  const [selectedLegends, setSelectedLegends] = useState<ColumnLegend[]>([]);
  const [shownLeaves, setShownLeaves] = useState(0);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [legendOpen, setLegendOpen] = useState(false);
  const [markerSearch, setMarkerSearch] = useState("");
  const [markerCategory, setMarkerCategory] = useState("");

  useEffect(() => {
    fetch(`${API}/fish/tree`)
      .then((res) => {
        if (!res.ok) throw new Error(`Tree request failed (${res.status})`);
        return res.json();
      })
      .then((data) => setTree(data))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load phylogeny."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!legendOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setLegendOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [legendOpen]);

  const columns = useMemo(
    () => AVAILABLE_COLUMNS.filter((c) => selected.includes(c.key)),
    [selected]
  );

  const speciesOptions = useMemo(() => {
    if (!tree) return [];
    return collectLeafNames(tree)
      .sort()
      .map((name) => ({ key: name, label: name.replace("_", " ") }));
  }, [tree]);
  const excludedNames = useMemo(() => new Set(excluded), [excluded]);
  const markerRows = useMemo(
    () => legends.flatMap((section) =>
      section.items.map((item) => ({
        category: section.title,
        label: formatLegendLabel(item.label),
        color: item.color,
      }))
    ),
    [legends]
  );
  const filteredMarkerRows = useMemo(() => {
    const query = markerSearch.trim().toLowerCase();
    return markerRows.filter((row) =>
      (!markerCategory || row.category === markerCategory)
      && (!query || row.category.toLowerCase().includes(query) || row.label.toLowerCase().includes(query))
    );
  }, [markerRows, markerSearch, markerCategory]);

  function handlePrint() {
    window.print();
  }

  return (
    <main className="phylo-page min-h-screen w-full bg-transparent px-4 py-8 text-black sm:px-6 lg:px-8">
      <div className="no-print mb-4 flex w-full flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-black">Filter to species with data for:</span>
        <MultiSelectDropdown
          options={AVAILABLE_COLUMNS}
          selected={selected}
          onChange={setSelected}
          placeholder="Select filters"
        />

        <span className="ml-2 text-xs font-semibold text-black">Exclude species:</span>
        <MultiSelectDropdown
          options={speciesOptions}
          selected={excluded}
          onChange={setExcluded}
          placeholder="None excluded"
          searchable
          searchPlaceholder="Search species..."
          showSelectAll
        />

        <button
          type="button"
          onClick={() => setLegendOpen(true)}
          disabled={loading || !!error || !tree}
          className="rounded-full border border-black bg-white px-3 py-1.5 text-xs font-semibold text-black shadow-sm hover:bg-black hover:text-white disabled:opacity-40"
        >
          Filter markers &amp; labels
        </button>

        <button
          type="button"
          onClick={handlePrint}
          disabled={loading || !!error || !tree}
          className="ml-auto rounded-full border border-black bg-white px-3 py-1.5 text-xs font-semibold text-black shadow-sm hover:bg-black hover:text-white disabled:opacity-40"
        >
          Print
        </button>
      </div>

      <div className="print-area">
        {selected.length > 0 && selectedLegends.length > 0 && (
          <div className="phylo-legend mb-4 flex flex-col gap-1.5 rounded-lg border border-blue-100 bg-white p-3 text-xs text-black shadow-sm">
            {selectedLegends.map((section) => (
              <div key={section.title} className="flex flex-wrap items-center gap-3">
                <span className="w-44 shrink-0 font-semibold">{section.title}</span>
                {section.items.map((item) => (
                  <span key={item.label} className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-3 w-3 shrink-0 rounded-full border border-black/20"
                      style={{ backgroundColor: item.color }}
                    />
                    {formatLegendLabel(item.label)}
                  </span>
                ))}
              </div>
            ))}
            {(selected.includes("RepGuild1") || selected.includes("RepGuild2")) && (
              <p className="mt-2 border-t border-black/10 pt-2 text-black/60">
                FishBase uses two related levels. Broad care strategy describes whether offspring are guarded or carried. The specific method describes how eggs or young are cared for. External brooding includes mouthbrooding but is not limited to it.
              </p>
            )}
          </div>
        )}

        {loading ? (
          <p className="py-12 text-center text-black">Loading phylogeny...</p>
        ) : error ? (
          <p className="py-12 text-center text-black">{error}</p>
        ) : tree ? (
          <PhyloTree
            data={tree}
            columns={columns}
            legendColumns={AVAILABLE_COLUMNS}
            excludedNames={excludedNames}
            onLegendChange={setLegends}
            onSelectedLegendChange={setSelectedLegends}
            onLeafCountChange={setShownLeaves}
          />
        ) : null}

        <p className="mt-6 bottom-blue-divider border-t pt-4 text-xs text-black">
          {shownLeaves} of 1,790 cichlid species shown
          {columns.length > 0
            ? ` (only those with data for ${columns.map((c) => c.label).join(", ")})`
            : ""}
          {excluded.length > 0 ? ` (${excluded.length} species manually excluded)` : ""}
          , branching based on{" "}
          <a href="https://tree.opentreeoflife.org" className="text-black underline" target="_blank" rel="noopener noreferrer">
            Open Tree of Life
          </a>
          . Species without an exact match there are placed next to their genus
          (or subfamily, if no relative is available) as an unresolved branch
          rather than a claimed exact position. Shown as a cladogram, not a
          time-calibrated tree.
        </p>
      </div>

      {legendOpen && (
        <div
          className="modal-overlay flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setLegendOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="marker-table-title"
            className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-black bg-white text-black shadow-xl"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-black/15 px-4 py-3">
              <div>
                <h2 id="marker-table-title" className="text-base font-bold">Filter markers and labels</h2>
                <p className="text-xs text-black/55">Search labels or narrow them to one category.</p>
              </div>
              <button
                type="button"
                onClick={() => setLegendOpen(false)}
                className="rounded-full border border-black px-3 py-1 text-xs font-semibold hover:bg-black hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="grid shrink-0 gap-2 border-b border-black/15 p-4 sm:grid-cols-[1fr_16rem_auto]">
              <input
                type="search"
                value={markerSearch}
                onChange={(event) => setMarkerSearch(event.target.value)}
                placeholder="Search marker labels..."
                className="h-9 rounded-md border border-black bg-white px-3 text-sm outline-none focus:border-[#1b7cb2] focus:ring-2 focus:ring-[#9fd1ff]"
              />
              <select
                value={markerCategory}
                onChange={(event) => setMarkerCategory(event.target.value)}
                className="h-9 rounded-md border border-black bg-white px-3 text-sm outline-none focus:border-[#1b7cb2] focus:ring-2 focus:ring-[#9fd1ff]"
              >
                <option value="">All categories</option>
                {legends.map((section) => (
                  <option key={section.title} value={section.title}>{section.title}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  setMarkerSearch("");
                  setMarkerCategory("");
                }}
                disabled={!markerSearch && !markerCategory}
                className="h-9 rounded-full border border-black px-4 text-xs font-semibold hover:bg-black hover:text-white disabled:opacity-40"
              >
                Clear
              </button>
            </div>
            <p className="shrink-0 border-b border-black/10 px-4 py-2 text-xs text-black/55">
              {filteredMarkerRows.length} of {markerRows.length} markers shown
            </p>
            <div className="overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 border-b border-black bg-white">
                  <tr>
                    <th className="w-20 px-4 py-2">Marker</th>
                    <th className="px-4 py-2">Category</th>
                    <th className="px-4 py-2">Label</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMarkerRows.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-sm text-black/55">
                        No markers match these filters.
                      </td>
                    </tr>
                  ) : filteredMarkerRows.map((row) => (
                      <tr key={`${row.category}-${row.label}`} className="border-b border-black/10 last:border-0">
                        <td className="px-4 py-2">
                          <span
                            className="inline-block h-4 w-4 rounded-full border border-black/20"
                            style={{ backgroundColor: row.color }}
                            aria-label={row.color}
                          />
                        </td>
                        <td className="px-4 py-2 font-semibold">{row.category}</td>
                        <td className="px-4 py-2">{row.label}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
