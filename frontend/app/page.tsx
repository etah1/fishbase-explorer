"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import FishTable, { SortDir, SortKey } from "@/components/FishTable";
import DarkModeToggle from "@/components/DarkModeToggle";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const PER_PAGE = 50;

function formatLabel(value: string) {
  return value
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default function FishPage() {
  const [fish, setFish] = useState([]);
  const [genera, setGenera] = useState<string[]>([]);
  const [dangerCategories, setDangerCategories] = useState<string[]>([]);
  const [bodyShapes, setBodyShapes] = useState<string[]>([]);
  const [migrationCategories, setMigrationCategories] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [fishbaseVersion, setFishbaseVersion] = useState("");

  const [genus, setGenus] = useState("");
  const [habitat, setHabitat] = useState("");
  const [maxLength, setMaxLength] = useState("");
  const [dangerous, setDangerous] = useState("");
  const [bodyShape, setBodyShape] = useState("");
  const [migration, setMigration] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortKey>("species");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    fetch(`${API}/fish/genera`)
      .then((r) => r.json())
      .then((d) => setGenera(d.genera));
    fetch(`${API}/fish/dangerous-categories`)
      .then((r) => r.json())
      .then((d) => setDangerCategories(d.categories));
    fetch(`${API}/fish/body-shapes`)
      .then((r) => r.json())
      .then((d) => setBodyShapes(d.shapes));
    fetch(`${API}/fish/migration-categories`)
      .then((r) => r.json())
      .then((d) => setMigrationCategories(d.categories));
  }, []);

  const fetchFish = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (genus) params.set("genus", genus);
    if (habitat) params.set("habitat", habitat);
    const parsedMaxLength = Number(maxLength);
    if (maxLength !== "" && Number.isFinite(parsedMaxLength)) {
      params.set("max_length", String(parsedMaxLength));
    }
    if (dangerous) params.set("dangerous", dangerous);
    if (bodyShape) params.set("body_shape", bodyShape);
    if (migration) params.set("migration", migration);
    params.set("sort_by", sortBy);
    params.set("sort_dir", sortDir);
    params.set("limit", String(PER_PAGE));
    params.set("offset", String((page - 1) * PER_PAGE));

    const res = await fetch(`${API}/fish?${params}`);
    const data = await res.json();
    setFish(data.data);
    setTotal(data.total);
    setFishbaseVersion(data.fishbase_version);
    setLoading(false);
  }, [genus, habitat, maxLength, dangerous, bodyShape, migration, page, sortBy, sortDir]);

  useEffect(() => {
    fetchFish();
  }, [fetchFish]);

  function handleFilterChange(setter: (v: string) => void) {
    return (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
      setter(e.target.value);
      setPage(1);
    };
  }

  function handleSort(key: SortKey) {
    if (sortBy === key) {
      setSortDir((direction) => direction === "asc" ? "desc" : "asc");
    } else {
      setSortBy(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <main className="min-h-screen w-full bg-transparent px-4 py-8 text-black sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-blue-100 pb-4">
        <div>
          <h1 className="text-3xl font-bold text-black">Cichlid Explorer</h1>
          <p className="mt-1 text-xs text-black">
            Powered by FishBase{fishbaseVersion ? ` v${fishbaseVersion}` : ""}, {total} cichlid species found
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DarkModeToggle />
          <Link
            href="/tree"
            className="rounded-full border border-black px-4 py-2 text-sm font-medium text-black hover:bg-blue-50"
          >
            View phylogeny
          </Link>
        </div>
      </div>

      <div className="mb-6 flex w-full flex-wrap items-center gap-3">
        <select
          className="w-44 rounded-lg border border-black bg-white px-3 py-2 text-sm text-black shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          value={genus}
          onChange={handleFilterChange(setGenus)}
        >
          <option value="">All</option>
          {genera.map((g) => <option key={g}>{g}</option>)}
        </select>

        <select
          className="rounded-lg border border-black bg-white px-3 py-2 text-sm text-black shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          value={habitat}
          onChange={handleFilterChange(setHabitat)}
        >
          <option value="">Any habitat</option>
          <option value="fresh">Freshwater</option>
          <option value="salt">Saltwater</option>
          <option value="brackish">Brackish</option>
        </select>

        <input
          type="number"
          className="w-40 rounded-lg border border-black bg-white px-3 py-2 text-sm text-black shadow-sm placeholder:text-black focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          min="0"
          step="0.001"
          placeholder="Under length (cm)"
          value={maxLength}
          onChange={handleFilterChange(setMaxLength)}
        />

        <select
          className="rounded-lg border border-black bg-white px-3 py-2 text-sm text-black shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          value={dangerous}
          onChange={handleFilterChange(setDangerous)}
        >
          <option value="">Any danger level</option>
          {dangerCategories.map((c) => <option key={c} value={c}>{formatLabel(c)}</option>)}
        </select>

        <select
          className="rounded-lg border border-black bg-white px-3 py-2 text-sm text-black shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          value={bodyShape}
          onChange={handleFilterChange(setBodyShape)}
        >
          <option value="">Any body shape</option>
          {bodyShapes.map((s) => <option key={s} value={s}>{formatLabel(s)}</option>)}
        </select>

        <select
          className="rounded-lg border border-black bg-white px-3 py-2 text-sm text-black shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          value={migration}
          onChange={handleFilterChange(setMigration)}
        >
          <option value="">Any migration pattern</option>
          {migrationCategories.map((c) => <option key={c} value={c}>{formatLabel(c)}</option>)}
        </select>

        {totalPages > 1 && (
        <div className="ml-auto flex items-center gap-3">
          <button
            className="rounded-lg border border-black px-4 py-2 text-sm font-medium text-black hover:bg-blue-50 disabled:opacity-40"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span className="text-sm text-black">Page {page} of {totalPages}</span>
          <button
            className="rounded-lg border border-black px-4 py-2 text-sm font-medium text-black hover:bg-blue-50 disabled:opacity-40"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
      </div>

      {loading ? (
        <p className="py-12 text-center text-black">Loading...</p>
      ) : (
        <FishTable fish={fish} onSort={handleSort} />
      )}
    </main>
  );
}










