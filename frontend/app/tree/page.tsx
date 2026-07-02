"use client";

import { useState } from "react";
import PhyloTree, { formatLegendLabel, LegendItem, TreeNode } from "@/components/PhyloTree";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const TRAIT_OPTIONS = [
  { key: "Fertilization", label: "Fertilization site" },
  { key: "ParentalCare", label: "Parental care" },
  { key: "RepGuild1", label: "Parenting style" },
  { key: "RepGuild2", label: "Brooding behavior" },
  { key: "MatingSystem", label: "Mating system" },
  { key: "FeedingType", label: "Diet" },
  { key: "Encephalization", label: "Brain size (relative to body)" },
];

function countLeaves(node: TreeNode): number {
  if (!node.children) return 1;
  return node.children.reduce((sum, c) => sum + countLeaves(c), 0);
}

export default function TreePage() {
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [trait, setTrait] = useState("RepGuild2");
  const [builtTrait, setBuiltTrait] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [legend, setLegend] = useState<LegendItem[]>([]);

  async function handleCreate() {
    setLoading(true);
    setError("");
    setLegend([]);
    try {
      const res = await fetch(`${API}/fish/tree?trait=${trait}`);
      if (!res.ok) {
        throw new Error(`Tree request failed (${res.status})`);
      }
      const data = await res.json();
      setTree(data);
      setBuiltTrait(trait);
    } catch (err) {
      setTree(null);
      setBuiltTrait(null);
      setError(err instanceof Error ? err.message : "Could not build phylogeny.");
      setLegend([]);
    } finally {
      setLoading(false);
    }
  }

  const totalLeaves = tree ? countLeaves(tree) : 0;
  const builtTraitLabel = TRAIT_OPTIONS.find((t) => t.key === builtTrait)?.label;

  return (
    <main className="min-h-screen w-full bg-transparent px-4 py-8 text-black sm:px-6 lg:px-8">
      <div className="mb-6 flex w-full items-center gap-3">
        <select
          className="rounded-lg border border-black bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          value={trait}
          onChange={(e) => setTrait(e.target.value)}
        >
          {TRAIT_OPTIONS.map((t) => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>

        <button
          onClick={handleCreate}
          disabled={loading}
          className="rounded-full border border-black px-4 py-2 text-sm font-medium text-black hover:bg-blue-50 disabled:opacity-50"
        >
          {loading ? "Building..." : "Create Phylogeny"}
        </button>

        {legend.length > 0 && (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 text-xs text-black">
            {legend.map((item) => (
              <span key={item.label} className="flex items-center gap-2">
                <span
                  className="legend-color inline-block h-4 w-4 rounded-full border border-black"
                  style={{ backgroundColor: item.color }}
                />
                {formatLegendLabel(item.label)}
              </span>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <p className="py-12 text-center text-black">Building tree...</p>
      ) : error ? (
        <p className="py-12 text-center text-black">{error}</p>
      ) : tree && builtTrait ? (
        <PhyloTree data={tree} trait={builtTrait} isContinuous={builtTrait === "Encephalization"} onLegendChange={setLegend} />
      ) : (
        <p className="py-12 text-center text-black">
          Select a trait and click &quot;Create Phylogeny&quot; to build the tree.
        </p>
      )}

      <p className="mt-6 bottom-blue-divider border-t pt-4 text-xs text-black">
        Pick a trait and build a tree of only the cichlid species that have
        data for it, placed on a time-calibrated phylogeny (
        <a href="https://fishtreeoflife.org" className="text-black underline" target="_blank">
          Fish Tree of Life
        </a>
        ){tree && builtTraitLabel ? `, ${totalLeaves} species have data for ${builtTraitLabel}` : "."}
      </p>
    </main>
  );
}

