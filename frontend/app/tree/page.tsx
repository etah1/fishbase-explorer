"use client";

import { useEffect, useMemo, useState } from "react";
import PhyloTree, { collectLeafNames, ColumnDef, ColumnLegend, formatLegendLabel, TreeNode } from "@/components/PhyloTree";
import MultiSelectDropdown from "@/components/MultiSelectDropdown";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const AVAILABLE_COLUMNS: ColumnDef[] = [
  { key: "RepGuild2", label: "Brooding behavior", type: "categorical" },
  { key: "RepGuild1", label: "Parenting style", type: "categorical" },
  { key: "Fertilization", label: "Fertilization site", type: "categorical" },
  { key: "ParentalCare", label: "Parental care", type: "categorical" },
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
  const [shownLeaves, setShownLeaves] = useState(0);
  const [excluded, setExcluded] = useState<string[]>([]);

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
        />

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
        {legends.length > 0 && (
          <div className="phylo-legend mb-4 flex flex-col gap-1.5 rounded-lg border border-blue-100 bg-white p-3 text-xs text-black shadow-sm">
            {legends.map((section) => (
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
            excludedNames={excludedNames}
            onLegendChange={setLegends}
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
          <a href="https://opentreeoflife.org" className="text-black underline" target="_blank">
            Open Tree of Life
          </a>
          . Species without an exact match there are placed next to their genus
          (or subfamily, if no relative is available) as an unresolved branch
          rather than a claimed exact position. Shown as a cladogram, not a
          time-calibrated tree.
        </p>
      </div>
    </main>
  );
}




