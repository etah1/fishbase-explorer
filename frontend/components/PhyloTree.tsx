"use client";

import { useEffect, useMemo, useState } from "react";
import { hierarchy } from "d3-hierarchy";
import { scaleLinear } from "d3-scale";
import ContributionDetails, { type CommunityContribution } from "@/components/ContributionDetails";
import { formatTraitValue } from "@/utils/traitLabels";

export type TreeNode = {
  length: number;
  name?: string;
  traits?: Record<string, string | number | null>;
  contributions?: CommunityContribution[];
  children?: TreeNode[];
};

export type ColumnDef = {
  key: string;
  label: string;
  type: "categorical" | "continuous" | "status";
};

export type LegendItem = { label: string; color: string };
export type ColumnLegend = { title: string; items: LegendItem[] };

const LEAF_HEIGHT = 14;
const TREE_WIDTH = 900;
const LABEL_WIDTH = 260;
const COLUMN_WIDTH = 128;
const HEADER_HEIGHT = 82;
const MARGIN = { top: 8, right: 16, bottom: 16, left: 16 };

// Stable category colors keep trait colors comparable between filters.
const CATEGORICAL_PALETTE = [
  "#2a78d6",
  "#1baf7a",
  "#eda100",
  "#008300",
  "#4a3aa7",
  "#e34948",
  "#e87ba4",
  "#eb6834",
];
const OTHER_COLOR = "#898781";
const NO_DATA_COLOR = "#e1e0d9";
const MIXED_BRANCH_COLOR = "#c3c2b7";
// Continuous traits use one blue ramp from low to high.
const SEQUENTIAL_STEPS = [
  "#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5",
  "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b",
];
const BAR_FILL = "#2a78d6";

// IUCN status uses an ordered severity palette.
const STATUS_COLORS = { good: "#0ca30c", warning: "#fab219", serious: "#ec835a", critical: "#d03b3b" };
const IUCN_STATUS_BUCKET: Record<string, keyof typeof STATUS_COLORS> = {
  LC: "good",
  NT: "warning",
  VU: "warning",
  EN: "serious",
  CR: "critical",
  EW: "critical",
  EX: "critical",
};
const IUCN_STATUS_LABEL: Record<string, string> = {
  LC: "Least concern",
  NT: "Near threatened",
  VU: "Vulnerable",
  EN: "Endangered",
  CR: "Critically endangered",
  EW: "Extinct in the wild",
  EX: "Extinct",
};

export function formatLegendLabel(label: string) {
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : label;
}

// Prune to species with all selected traits, then collapse single-child branches.
export function pruneTree(
  node: TreeNode,
  columns: ColumnDef[],
  excludedNames: ReadonlySet<string> = new Set()
): TreeNode | null {
  if (!node.children) {
    if (node.name && excludedNames.has(node.name)) return null;
    const hasAllData = columns.every((col) => node.traits?.[col.key] != null);
    return hasAllData ? node : null;
  }
  const prunedChildren = node.children
    .map((c) => pruneTree(c, columns, excludedNames))
    .filter((c): c is TreeNode => c !== null);
  if (prunedChildren.length === 0) return null;
  if (prunedChildren.length === 1) return prunedChildren[0];
  return { ...node, children: prunedChildren };
}

export function collectLeafNames(node: TreeNode, out: string[] = []): string[] {
  if (!node.children) {
    if (node.name) out.push(node.name);
    return out;
  }
  for (const child of node.children) collectLeafNames(child, out);
  return out;
}

export function countLeaves(node: TreeNode): number {
  if (!node.children) return 1;
  return node.children.reduce((sum, c) => sum + countLeaves(c), 0);
}

// Ladderize branches by descendant count for a steadier visual scan.
export function ladderizeTree(node: TreeNode): TreeNode {
  return ladderizeWithCount(node).node;
}

function ladderizeWithCount(node: TreeNode): { node: TreeNode; count: number } {
  if (!node.children) return { node, count: 1 };
  const ranked = node.children.map(ladderizeWithCount).sort((a, b) => a.count - b.count);
  return {
    node: { ...node, children: ranked.map((r) => r.node) },
    count: ranked.reduce((sum, r) => sum + r.count, 0),
  };
}

type Positioned = ReturnType<typeof hierarchy<TreeNode>> & {
  x: number;
  y: number;
  subfamily?: string | null;
};

function wrapColumnLabel(label: string) {
  const lines: string[] = [];
  let line = "";

  for (const word of label.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= 15) {
      line = next;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }

  if (line) lines.push(line);
  return lines;
}
function buildCategoricalScale(leaves: Positioned[], key: string) {
  const counts = new Map<string, number>();
  for (const leaf of leaves) {
    const v = leaf.data.traits?.[key];
    if (typeof v === "string") counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  );
  const top = ranked.slice(0, CATEGORICAL_PALETTE.length).map(([label]) => label);
  const colorOf = new Map(top.map((label, i) => [label, CATEGORICAL_PALETTE[i]]));

  const legend: LegendItem[] = ranked.map(([label]) => ({
    label: formatTraitValue(key, label),
    color: colorOf.get(label) ?? OTHER_COLOR,
  }));
  if (leaves.some((l) => l.data.traits?.[key] == null)) {
    legend.push({ label: "No data", color: NO_DATA_COLOR });
  }

  return {
    colorOf: (v: string | number | null | undefined) => {
      if (v == null || typeof v !== "string") return NO_DATA_COLOR;
      return colorOf.get(v) ?? OTHER_COLOR;
    },
    legend,
  };
}

function buildSequentialScale(leaves: Positioned[], key: string) {
  const values = leaves
    .map((l) => l.data.traits?.[key])
    .filter((v): v is number => typeof v === "number");
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const steps = SEQUENTIAL_STEPS.length;
  const scale = scaleLinear<string>()
    .domain(Array.from({ length: steps }, (_, i) => min + (i / (steps - 1)) * (max - min || 1)))
    .range(SEQUENTIAL_STEPS);
  const barScale = scaleLinear().domain([min, max || 1]).range([4, COLUMN_WIDTH - 16]);

  const legend: LegendItem[] = values.length
    ? [
        { label: `low (${min.toFixed(2)})`, color: SEQUENTIAL_STEPS[0] },
        { label: `high (${max.toFixed(2)})`, color: SEQUENTIAL_STEPS[steps - 1] },
      ]
    : [];
  if (leaves.some((l) => l.data.traits?.[key] == null)) {
    legend.push({ label: "No data", color: NO_DATA_COLOR });
  }

  return {
    barWidth: (v: number | string | null | undefined) =>
      typeof v === "number" ? barScale(v) : 0,
    colorOf: (v: number | string | null | undefined) =>
      typeof v === "number" ? scale(v) : NO_DATA_COLOR,
    legend,
  };
}

function buildStatusScale(leaves: Positioned[], key: string) {
  const present = new Set<keyof typeof STATUS_COLORS>();
  for (const leaf of leaves) {
    const code = leaf.data.traits?.[key];
    const bucket = typeof code === "string" ? IUCN_STATUS_BUCKET[code] : undefined;
    if (bucket) present.add(bucket);
  }
  const order: (keyof typeof STATUS_COLORS)[] = ["good", "warning", "serious", "critical"];
  const bucketLabel = { good: "Least/near threatened", warning: "Vulnerable", serious: "Endangered", critical: "Critically endangered/extinct" };
  const legend: LegendItem[] = order
    .filter((b) => present.has(b))
    .map((b) => ({ label: bucketLabel[b], color: STATUS_COLORS[b] }));
  if (leaves.some((l) => {
    const code = l.data.traits?.[key];
    return code == null || typeof code !== "string" || !IUCN_STATUS_BUCKET[code];
  })) {
    legend.push({ label: "Not evaluated / data deficient", color: NO_DATA_COLOR });
  }

  return {
    colorOf: (v: string | number | null | undefined) => {
      const bucket = typeof v === "string" ? IUCN_STATUS_BUCKET[v] : undefined;
      return bucket ? STATUS_COLORS[bucket] : NO_DATA_COLOR;
    },
    legend,
  };
}

function subfamilyColorScale(leaves: Positioned[]) {
  const counts = new Map<string, number>();
  for (const leaf of leaves) {
    const s = leaf.data.traits?.Subfamily;
    if (typeof s === "string") counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked.slice(0, CATEGORICAL_PALETTE.length).map(([label]) => label);
  const colorOf = new Map(top.map((label, i) => [label, CATEGORICAL_PALETTE[i]]));
  const legend: LegendItem[] = ranked.map(([label]) => ({
    label,
    color: colorOf.get(label) ?? OTHER_COLOR,
  }));
  return {
    colorOf: (s: string | null | undefined) => (s ? colorOf.get(s) ?? OTHER_COLOR : null),
    legend,
  };
}

export default function PhyloTree({
  data,
  columns,
  legendColumns = columns,
  excludedNames,
  onLegendChange,
  onSelectedLegendChange,
  onLeafCountChange,
}: {
  data: TreeNode;
  columns: ColumnDef[];
  legendColumns?: ColumnDef[];
  excludedNames?: ReadonlySet<string>;
  onLegendChange?: (legends: ColumnLegend[]) => void;
  onSelectedLegendChange?: (legends: ColumnLegend[]) => void;
  onLeafCountChange?: (count: number) => void;
}) {
  const [selectedLeaf, setSelectedLeaf] = useState<TreeNode | null>(null);
  const prunedData = useMemo(() => {
    const pruned = pruneTree(data, columns, excludedNames);
    return pruned && ladderizeTree(pruned);
  }, [data, columns, excludedNames]);

  useEffect(() => {
    onLeafCountChange?.(prunedData ? countLeaves(prunedData) : 0);
  }, [prunedData, onLeafCountChange]);

  // Keep hook order stable even when filters remove every species.
  const root = useMemo(
    () => hierarchy(prunedData ?? data, (d) => d.children),
    [prunedData, data]
  );

  const { nodes, links, xScale, height, columnRenderers, legends, selectedLegends, subfamilyColorOf } = useMemo(() => {
    const nodes = root.descendants() as Positioned[];
    const leaves = root.leaves() as Positioned[];

    nodes.forEach((d) => {
      d.x = d.parent ? (d.parent as Positioned).x + (d.data.length || 0) : 0;
    });
    leaves.forEach((d, i) => {
      d.y = i * LEAF_HEIGHT;
    });
    root.eachAfter((d) => {
      const node = d as Positioned;
      const children = d.children as Positioned[] | undefined;
      if (children) {
        node.y = (children[0].y + children[children.length - 1].y) / 2;
      }
    });

    const { colorOf: subfamilyColorOf, legend: subfamilyLegend } = subfamilyColorScale(leaves);
    root.eachAfter((d) => {
      const node = d as Positioned;
      if (!node.children) {
        node.subfamily = (node.data.traits?.Subfamily as string | undefined) ?? null;
        return;
      }
      const childSubfamilies = new Set(
        (node.children as Positioned[]).map((c) => c.subfamily)
      );
      node.subfamily = childSubfamilies.size === 1 ? [...childSubfamilies][0] : null;
    });

    const maxX = Math.max(...leaves.map((d) => d.x));
    const xScale = scaleLinear().domain([0, maxX || 1]).range([0, TREE_WIDTH]);
    const links = root.links() as { source: Positioned; target: Positioned }[];
    const height = leaves.length * LEAF_HEIGHT;

    function buildColumnRenderer(col: ColumnDef) {
      if (col.type === "continuous") {
        const scale = buildSequentialScale(leaves, col.key);
        return { col, kind: "continuous" as const, scale };
      }
      if (col.type === "status") {
        const scale = buildStatusScale(leaves, col.key);
        return { col, kind: "status" as const, scale };
      }
      const scale = buildCategoricalScale(leaves, col.key);
      return { col, kind: "categorical" as const, scale };
    }

    const columnRenderers = columns.map(buildColumnRenderer);
    const legends: ColumnLegend[] = [
      { title: "Subfamily (branch color)", items: subfamilyLegend },
      ...legendColumns.map((col) => {
        const renderer = buildColumnRenderer(col);
        return { title: col.label, items: renderer.scale.legend };
      }),
    ];
    const selectedLegends: ColumnLegend[] = [
      { title: "Subfamily (branch color)", items: subfamilyLegend },
      ...columnRenderers.map((renderer) => ({
        title: renderer.col.label,
        items: renderer.scale.legend,
      })),
    ];

    return {
      nodes,
      links,
      xScale,
      height,
      columnRenderers,
      legends,
      selectedLegends,
      subfamilyColorOf,
    };
  }, [root, columns, legendColumns]);

  useEffect(() => {
    onLegendChange?.(legends);
  }, [legends, onLegendChange]);

  useEffect(() => {
    onSelectedLegendChange?.(selectedLegends);
  }, [selectedLegends, onSelectedLegendChange]);

  const treeAreaWidth = TREE_WIDTH + LABEL_WIDTH;
  const columnsWidth = columns.length * COLUMN_WIDTH;
  const width = MARGIN.left + treeAreaWidth + columnsWidth + MARGIN.right;
  const svgHeight = MARGIN.top + HEADER_HEIGHT + height + MARGIN.bottom;

  if (!prunedData) {
    return (
      <p className="py-12 text-center text-black">
        No species are left to show. Try unchecking a filter or removing an excluded species.
      </p>
    );
  }

  return (
    <>
      <div className="phylo-tree w-full overflow-auto rounded-lg border border-blue-100 bg-white shadow-sm" style={{ maxHeight: "75vh" }}>
      <svg width={width} height={svgHeight} viewBox={`0 0 ${width} ${svgHeight}`} preserveAspectRatio="xMinYMin meet">
        <g transform={`translate(${MARGIN.left},${MARGIN.top + HEADER_HEIGHT})`}>
          {links.map((link, i) => {
            const sx = xScale(link.source.x);
            const sy = link.source.y;
            const tx = xScale(link.target.x);
            const ty = link.target.y;
            const target = link.target as Positioned;
            const stroke = target.subfamily ? subfamilyColorOf(target.subfamily) : null;
            return (
              <path
                key={i}
                d={`M${sx},${sy} L${sx},${ty} L${tx},${ty}`}
                fill="none"
                stroke={stroke ?? MIXED_BRANCH_COLOR}
                strokeWidth={1.5}
              />
            );
          })}
          {nodes
            .filter((d) => !d.children)
            .map((leaf) => (
              <g key={leaf.data.name}>
                <g transform={`translate(${xScale(leaf.x)},${leaf.y})`}>
                  <circle
                    r={4}
                    fill={(leaf.subfamily && subfamilyColorOf(leaf.subfamily)) || OTHER_COLOR}
                    stroke="#fcfcfb"
                    strokeWidth={2}
                  />
                  <text
                    x={9}
                    dy="0.32em"
                    fontSize={10}
                    fontStyle="italic"
                    fill="#0b0b0b"
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedLeaf(leaf.data)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedLeaf(leaf.data);
                      }
                    }}
                    className="cursor-pointer transition-colors hover:fill-[#1b7cb2] focus:fill-[#1b7cb2] focus:outline-none"
                  >
                    {leaf.data.name?.replace("_", " ")}
                  </text>
                </g>
                {columnRenderers.map((renderer, ci) => {
                  const cx = LABEL_WIDTH + ci * COLUMN_WIDTH;
                  const value = leaf.data.traits?.[renderer.col.key];
                  if (renderer.kind === "continuous") {
                    const w = renderer.scale.barWidth(value);
                    return (
                      <g key={renderer.col.key} transform={`translate(${TREE_WIDTH + cx},${leaf.y})`}>
                        <title>{`${leaf.data.name?.replace("_", " ")}: ${renderer.col.label} = ${formatTraitValue(renderer.col.key, value)}`}</title>
                        {w > 0 ? (
                          <rect x={4} y={-5} width={w} height={10} rx={4} fill={BAR_FILL} />
                        ) : (
                          <rect x={4} y={-1} width={10} height={2} fill={NO_DATA_COLOR} />
                        )}
                      </g>
                    );
                  }
                  const color = renderer.scale.colorOf(value);
                  const displayValue =
                    renderer.kind === "status" && typeof value === "string"
                      ? IUCN_STATUS_LABEL[value] ?? value
                      : formatTraitValue(renderer.col.key, value);
                  return (
                    <g key={renderer.col.key} transform={`translate(${TREE_WIDTH + cx + COLUMN_WIDTH / 2},${leaf.y})`}>
                      <title>{`${leaf.data.name?.replace("_", " ")}: ${renderer.col.label} = ${displayValue ?? "no data"}`}</title>
                      <rect x={-14} y={-6} width={28} height={12} rx={3} fill={color} />
                    </g>
                  );
                })}
              </g>
            ))}
        </g>
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {columnRenderers.map((renderer, ci) => {
            const x = TREE_WIDTH + LABEL_WIDTH + ci * COLUMN_WIDTH + COLUMN_WIDTH / 2;
            const lines = wrapColumnLabel(renderer.col.label);

            return (
              <text
                key={renderer.col.key}
                x={x}
                y={18}
                fontSize={10}
                fontWeight={600}
                fill="#0b0b0b"
                textAnchor="middle"
              >
                {lines.map((line, index) => (
                  <tspan key={line} x={x} dy={index === 0 ? 0 : 12}>
                    {line}
                  </tspan>
                ))}
              </text>
            );
          })}
        </g>
      </svg>
      </div>
      {selectedLeaf ? (
        <ContributionDetails
          genus={(selectedLeaf.name ?? "").slice(0, (selectedLeaf.name ?? "").indexOf("_"))}
          species={(selectedLeaf.name ?? "").slice((selectedLeaf.name ?? "").indexOf("_") + 1)}
          contributions={selectedLeaf.contributions ?? []}
          onClose={() => setSelectedLeaf(null)}
        />
      ) : null}
    </>
  );
}








