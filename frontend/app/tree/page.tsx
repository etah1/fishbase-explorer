"use client";

import { useState } from "react";
import Link from "next/link";
import PhyloTree, { TreeNode } from "@/components/PhyloTree";

const API = "http://localhost:8000";

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

  async function handleCreate() {
    setLoading(true);
    const res = await fetch(`${API}/fish/tree?trait=${trait}`);
    const data = await res.json();
    setTree(data);
    setBuiltTrait(trait);
    setLoading(false);
  }

  const totalLeaves = tree ? countLeaves(tree) : 0;

  return (
    <main className="min-h-screen w-full bg-white px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-4 border-b border-blue-100 pb-4">
        <h1 className="text-3xl font-bold text-blue-950">Cichlid Phylogeny</h1>
        <Link
          href="/fish"
          className="rounded-full border border-blue-200 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
        >
          Browse cichlids
        </Link>
      </div>
      <p className="mb-6 text-blue-700">
        Pick a trait and build a tree of only the cichlid species that have
        data for it, placed on a time-calibrated phylogeny (
        <a href="https://fishtreeoflife.org" className="text-blue-800 underline" target="_blank">
          Fish Tree of Life
        </a>
        ){tree ? `, ${totalLeaves} species have data for ${TRAIT_OPTIONS.find((t) => t.key === builtTrait)?.label}` : "."}
      </p>

      <div className="mb-6 flex w-full flex-wrap items-center gap-3">
        <select
          className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
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
          className="rounded-full bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Building..." : "Create Phylogeny"}
        </button>
      </div>

      {loading ? (
        <p className="py-12 text-center text-blue-300">Building tree...</p>
      ) : tree && builtTrait ? (
        <PhyloTree data={tree} trait={builtTrait} isContinuous={builtTrait === "Encephalization"} />
      ) : (
        <p className="py-12 text-center text-blue-300">
          Select a trait and click &quot;Create Phylogeny&quot; to build the tree.
        </p>
      )}
    </main>
  );
}

