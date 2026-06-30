type Fish = {
  SpecCode: number;
  Genus: string;
  Species: string;
  FBname: string | null;
  Fresh: number | null;
  Saltwater: number | null;
  Brackish: number | null;
  Dangerous: string | null;
  Length: number | null;
  BodyShapeI: string | null;
  AnaCat: string | null;
};

export type SortKey = "species" | "common_name" | "habitat" | "length" | "dangerous" | "body_shape" | "migration";
export type SortDir = "asc" | "desc";

type FishTableProps = {
  fish: Fish[];
  onSort: (key: SortKey) => void;
};

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "species", label: "Species" },
  { key: "common_name", label: "Common Name" },
  { key: "habitat", label: "Habitat" },
  { key: "length", label: "Max Length (cm)" },
  { key: "dangerous", label: "Dangerous" },
  { key: "body_shape", label: "Body Shape" },
  { key: "migration", label: "Migration" },
];

function formatLabel(value: string) {
  return value
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatLength(value: number | null) {
  return value == null ? "-" : value.toFixed(3);
}

export default function FishTable({ fish, onSort }: FishTableProps) {
  if (fish.length === 0) {
    return <p className="py-12 text-center text-blue-300">No cichlids matched your filters.</p>;
  }

  return (
    <div className="light-surface w-full overflow-x-auto rounded-lg border border-blue-100 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-blue-50 text-left text-blue-900">
          <tr>
            {COLUMNS.map((column) => (
              <th key={column.key} className="p-0 font-medium">
                <button
                  type="button"
                  className="h-full w-full whitespace-nowrap px-4 py-3 text-left font-medium text-blue-900 transition-colors hover:bg-blue-100 hover:text-blue-950"
                  onClick={() => onSort(column.key)}
                >
                  <span>{column.label}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-blue-50">
          {fish.map((f) => (
            <tr key={f.SpecCode} className="transition-colors hover:bg-blue-50">
              <td className="px-4 py-3 italic text-black">{f.Genus} {f.Species}</td>
              <td className="px-4 py-3 text-black">{f.FBname ?? "-"}</td>
              <td className="px-4 py-3 text-black">
                {[f.Fresh && "Fresh", f.Saltwater && "Salt", f.Brackish && "Brackish"]
                  .filter(Boolean).join(", ") || "-"}
              </td>
              <td className="px-4 py-3 text-black">{formatLength(f.Length)}</td>
              <td className="px-4 py-3 text-black">{f.Dangerous ? formatLabel(f.Dangerous) : "-"}</td>
              <td className="px-4 py-3 text-black">{f.BodyShapeI ? formatLabel(f.BodyShapeI) : "-"}</td>
              <td className="px-4 py-3 text-black">{f.AnaCat ? formatLabel(f.AnaCat) : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
