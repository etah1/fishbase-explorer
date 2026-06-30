"use client";

import { useEffect, useState, useCallback } from "react";
import FishTable from "@/components/FishTable";

const API = "http://localhost:8000";
const PER_PAGE = 50;

export default function FishPage() {
  const [fish, setFish] = useState([]);
  const [families, setFamilies] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [family, setFamily] = useState("");
  const [habitat, setHabitat] = useState("");
  const [maxLength, setMaxLength] = useState("");
  const [dangerous, setDangerous] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetch(`${API}/fish/families`)
      .then((r) => r.json())
      .then((d) => setFamilies(d.families));
  }, []);

  const fetchFish = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (family) params.set("family", family);
    if (habitat) params.set("habitat", habitat);
    if (maxLength) params.set("max_length", maxLength);
    if (dangerous) params.set("dangerous", dangerous);
    params.set("limit", String(PER_PAGE));
    params.set("offset", String((page - 1) * PER_PAGE));

    const res = await fetch(`${API}/fish?${params}`);
    const data = await res.json();
    setFish(data.data);
    setTotal(data.total);
    setLoading(false);
  }, [family, habitat, maxLength, dangerous, page]);

  useEffect(() => {
    fetchFish();
  }, [fetchFish]);

  function handleFilterChange(setter: (v: string) => void) {
    return (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
      setter(e.target.value);
      setPage(1);
    };
  }

  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <main className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Fish Explorer</h1>
      <p className="text-gray-500 mb-8">Powered by FishBase — {total} species found</p>

      <div className="flex flex-wrap gap-3 mb-6">
        <select
          className="border rounded-lg px-3 py-2 text-sm text-gray-700"
          value={family}
          onChange={handleFilterChange(setFamily)}
        >
          <option value="">All families</option>
          {families.map((f) => <option key={f}>{f}</option>)}
        </select>

        <select
          className="border rounded-lg px-3 py-2 text-sm text-gray-700"
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
          className="border rounded-lg px-3 py-2 text-sm text-gray-700 w-40"
          placeholder="Max length (cm)"
          value={maxLength}
          onChange={handleFilterChange(setMaxLength)}
        />

        <select
          className="border rounded-lg px-3 py-2 text-sm text-gray-700"
          value={dangerous}
          onChange={handleFilterChange(setDangerous)}
        >
          <option value="">Any danger level</option>
          <option value="true">Dangerous only</option>
          <option value="false">Non-dangerous only</option>
        </select>
      </div>

      {loading ? (
        <p className="text-center text-gray-400 py-12">Loading...</p>
      ) : (
        <FishTable fish={fish} />
      )}

      {totalPages > 1 && (
        <div className="flex items-center gap-3 mt-6">
          <button
            className="px-4 py-2 border rounded-lg text-sm disabled:opacity-40"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
          <button
            className="px-4 py-2 border rounded-lg text-sm disabled:opacity-40"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </main>
  );
}
