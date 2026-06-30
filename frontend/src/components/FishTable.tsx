type Fish = {
  SpecCode: number;
  Genus: string;
  Species: string;
  FBname: string | null;
  Family: string;
  Fresh: number | null;
  Saltwater: number | null;
  Brackish: number | null;
  Dangerous: string | null;
  Length: number | null;
};

export default function FishTable({ fish }: { fish: Fish[] }) {
  if (fish.length === 0) {
    return <p className="text-center text-gray-400 py-12">No fish matched your filters.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-gray-600">
          <tr>
            <th className="px-4 py-3 font-medium">Species</th>
            <th className="px-4 py-3 font-medium">Common Name</th>
            <th className="px-4 py-3 font-medium">Family</th>
            <th className="px-4 py-3 font-medium">Habitat</th>
            <th className="px-4 py-3 font-medium">Max Length (cm)</th>
            <th className="px-4 py-3 font-medium">Dangerous</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {fish.map((f) => (
            <tr key={f.SpecCode} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 italic text-gray-800">{f.Genus} {f.Species}</td>
              <td className="px-4 py-3 text-gray-700">{f.FBname ?? "—"}</td>
              <td className="px-4 py-3 text-gray-600">{f.Family}</td>
              <td className="px-4 py-3 text-gray-600">
                {[f.Fresh && "Fresh", f.Saltwater && "Salt", f.Brackish && "Brackish"]
                  .filter(Boolean).join(", ") || "—"}
              </td>
              <td className="px-4 py-3 text-gray-600">{f.Length ?? "—"}</td>
              <td className="px-4 py-3">
                {f.Dangerous
                  ? <span className="text-red-500 text-xs font-medium">{f.Dangerous}</span>
                  : <span className="text-gray-300">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
