"use client";

import { useEffect, useState, useCallback } from "react";
import FishTable, { SortDir, SortKey } from "@/components/FishTable";

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

  const [search, setSearch] = useState("");
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
    if (search) params.set("q", search);
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
  }, [search, genus, habitat, maxLength, dangerous, bodyShape, migration, page, sortBy, sortDir]);

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
  const fieldClass = "h-8 shrink-0 rounded-md border border-black bg-white px-2.5 text-xs text-black shadow-sm focus:border-[#1b7cb2] focus:outline-none focus:ring-2 focus:ring-white";

  return (
    <main className="min-h-screen w-full bg-transparent px-4 py-8 text-black sm:px-6 lg:px-8">
      <div className="mb-6 flex w-full flex-nowrap items-center gap-2 overflow-x-auto pb-1">
        <input
          type="search"
          className={`${fieldClass} w-44 rounded-full placeholder:text-slate-500`}
          placeholder="Search species"
          value={search}
          onChange={handleFilterChange(setSearch)}
        />

        <select
          className={`${fieldClass} w-28`}
          value={genus}
          onChange={handleFilterChange(setGenus)}
        >
          <option value="">All</option>
          {genera.map((g) => <option key={g}>{g}</option>)}
        </select>

        <select
          className={`${fieldClass} w-32`}
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
          className={`${fieldClass} w-32 placeholder:text-slate-500`}
          min="0"
          step="0.001"
          placeholder="Under length (cm)"
          value={maxLength}
          onChange={handleFilterChange(setMaxLength)}
        />

        <select
          className={`${fieldClass} w-36`}
          value={dangerous}
          onChange={handleFilterChange(setDangerous)}
        >
          <option value="">Any danger level</option>
          {dangerCategories.map((c) => <option key={c} value={c}>{formatLabel(c)}</option>)}
        </select>

        <select
          className={`${fieldClass} w-36`}
          value={bodyShape}
          onChange={handleFilterChange(setBodyShape)}
        >
          <option value="">Any body shape</option>
          {bodyShapes.map((s) => <option key={s} value={s}>{formatLabel(s)}</option>)}
        </select>

        <select
          className={`${fieldClass} w-40`}
          value={migration}
          onChange={handleFilterChange(setMigration)}
        >
          <option value="">Any migration pattern</option>
          {migrationCategories.map((c) => <option key={c} value={c}>{formatLabel(c)}</option>)}
        </select>

        {totalPages > 1 && (
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <button
              className="h-8 rounded-md border border-black bg-white px-2 text-xs font-medium text-black hover:bg-black hover:text-white disabled:opacity-40"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <span className="whitespace-nowrap text-xs text-black">{page}/{totalPages}</span>
            <button
              className="h-8 rounded-md border border-black bg-white px-2 text-xs font-medium text-black hover:bg-black hover:text-white disabled:opacity-40"
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

      <p className="mt-6 bottom-blue-divider border-t pt-4 text-xs text-black">
        Powered by FishBase{fishbaseVersion ? ` v${fishbaseVersion}` : ""}, {total} cichlid species found
      </p>
    </main>
  );
}

