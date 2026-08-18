"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const LEAF_ARC_LENGTH = 14;
const MIN_TREE_RADIUS = 300;
const LABEL_WIDTH = 260;
const TRAIT_RING_SPACING = 18;
const TRAIT_RING_GAP = 14;
const LABEL_GAP = 12;
const HEADER_HEIGHT = 42;
const MARGIN = { top: 8, right: 16, bottom: 16, left: 16 };
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.2;

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
    colorOf: (v: number | string | null | undefined) =>
      typeof v === "number" ? scale(v) : NO_DATA_COLOR,
    legend,
  };
}

function polarPoint(radius: number, angle: number) {
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

function radialBranchPath(
  sourceRadius: number,
  sourceAngle: number,
  targetRadius: number,
  targetAngle: number
) {
  const target = polarPoint(targetRadius, targetAngle);
  if (sourceRadius === 0) return `M0,0 L${target.x},${target.y}`;

  const start = polarPoint(sourceRadius, sourceAngle);
  const bend = polarPoint(sourceRadius, targetAngle);
  const delta = targetAngle - sourceAngle;
  const largeArc = Math.abs(delta) > Math.PI ? 1 : 0;
  const sweep = delta >= 0 ? 1 : 0;
  return `M${start.x},${start.y} A${sourceRadius},${sourceRadius} 0 ${largeArc},${sweep} ${bend.x},${bend.y} L${target.x},${target.y}`;
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
  const [zoom, setZoom] = useState(1);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const zoomFocusRef = useRef<{
    x: number;
    y: number;
    viewportX: number;
    viewportY: number;
  } | null>(null);
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

  const { nodes, links, radiusScale, treeRadius, columnRenderers, legends, selectedLegends, subfamilyColorOf } = useMemo(() => {
    const nodes = root.descendants() as Positioned[];
    const leaves = root.leaves() as Positioned[];

    nodes.forEach((d) => {
      d.x = d.parent ? (d.parent as Positioned).x + (d.data.length || 0) : 0;
    });
    leaves.forEach((d, i) => {
      d.y = (i / leaves.length) * Math.PI * 2 - Math.PI / 2;
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
    const treeRadius = Math.max(
      MIN_TREE_RADIUS,
      (leaves.length * LEAF_ARC_LENGTH) / (Math.PI * 2)
    );
    const radiusScale = scaleLinear().domain([0, maxX || 1]).range([0, treeRadius]);
    const links = root.links() as { source: Positioned; target: Positioned }[];

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
      radiusScale,
      treeRadius,
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

  const traitRadius = treeRadius + TRAIT_RING_GAP;
  const labelRadius = traitRadius + columns.length * TRAIT_RING_SPACING + LABEL_GAP;
  const outerRadius = labelRadius + LABEL_WIDTH;
  const diameter = outerRadius * 2;
  const width = MARGIN.left + diameter + MARGIN.right;
  const svgHeight = MARGIN.top + HEADER_HEIGHT + diameter + MARGIN.bottom;
  const centerX = MARGIN.left + outerRadius;
  const centerY = MARGIN.top + HEADER_HEIGHT + outerRadius;
  const renderedWidth = width * zoom;
  const renderedHeight = svgHeight * zoom;

  const changeZoom = useCallback((nextZoom: number, viewportFocus?: { x: number; y: number }) => {
    const clampedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
    if (clampedZoom === zoom) return;

    const container = scrollContainerRef.current;
    if (container) {
      const viewportX = viewportFocus?.x ?? container.clientWidth / 2;
      const viewportY = viewportFocus?.y ?? container.clientHeight / 2;
      zoomFocusRef.current = {
        x: (container.scrollLeft + viewportX) / zoom,
        y: (container.scrollTop + viewportY) / zoom,
        viewportX,
        viewportY,
      };
    }
    setZoom(clampedZoom);
  }, [zoom]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const focus = zoomFocusRef.current;
    if (focus) {
      container.scrollLeft = Math.max(0, focus.x * zoom - focus.viewportX);
      container.scrollTop = Math.max(0, focus.y * zoom - focus.viewportY);
      zoomFocusRef.current = null;
      return;
    }
    container.scrollLeft = Math.max(0, centerX * zoom - container.clientWidth / 2);
  }, [centerX, zoom]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleWheel = (event: WheelEvent) => {
      // Browsers expose a trackpad pinch as a wheel event with Ctrl/Meta held.
      // Unmodified two-finger gestures retain the container's normal panning.
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();

      const bounds = container.getBoundingClientRect();
      const multiplier = Math.exp(-event.deltaY * 0.008);
      changeZoom(zoom * multiplier, {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [changeZoom, zoom]);

  if (!prunedData) {
    return (
      <p className="py-12 text-center text-black">
        No species are left to show. Try unchecking a filter or removing an excluded species.
      </p>
    );
  }

  return (
    <>
      <div className="mb-2 flex items-center justify-end gap-2 print:hidden" role="toolbar" aria-label="Tree zoom controls">
        <button
          type="button"
          onClick={() => changeZoom(zoom - ZOOM_STEP)}
          disabled={zoom <= MIN_ZOOM}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-black bg-white text-lg font-semibold text-black shadow-sm transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Zoom out"
          title="Zoom out"
        >
          &minus;
        </button>
        <button
          type="button"
          onClick={() => changeZoom(1)}
          className="h-9 min-w-16 rounded-md border border-black bg-white px-2 text-sm font-medium text-black shadow-sm transition-colors hover:bg-blue-50"
          aria-label={`Reset zoom, currently ${Math.round(zoom * 100)} percent`}
          title="Reset zoom"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={() => changeZoom(zoom + ZOOM_STEP)}
          disabled={zoom >= MAX_ZOOM}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-black bg-white text-lg font-semibold text-black shadow-sm transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Zoom in"
          title="Zoom in"
        >
          +
        </button>
      </div>
      <div ref={scrollContainerRef} className="phylo-tree w-full overflow-auto rounded-lg border border-blue-100 bg-white shadow-sm" style={{ maxHeight: "75vh" }}>
      <svg width={renderedWidth} height={renderedHeight} viewBox={`0 0 ${width} ${svgHeight}`} preserveAspectRatio="xMinYMin meet">
        {columns.length > 0 ? (
          <text x={centerX} y={MARGIN.top + 17} fontSize={10} fontWeight={600} fill="#0b0b0b" textAnchor="middle">
            Trait rings, inner to outer: {columns.map((column) => column.label).join(" / ")}
          </text>
        ) : null}
        <g transform={`translate(${centerX},${centerY})`}>
          {links.map((link, i) => {
            const target = link.target as Positioned;
            const stroke = target.subfamily ? subfamilyColorOf(target.subfamily) : null;
            return (
              <path
                key={i}
                d={radialBranchPath(
                  radiusScale(link.source.x),
                  link.source.y,
                  radiusScale(link.target.x),
                  link.target.y
                )}
                fill="none"
                stroke={stroke ?? MIXED_BRANCH_COLOR}
                strokeWidth={1.5}
              />
            );
          })}
          {nodes
            .filter((d) => !d.children)
            .map((leaf) => {
              const angleDegrees = (leaf.y * 180) / Math.PI;
              const isLeft = Math.cos(leaf.y) < 0;
              const leafRadius = radiusScale(leaf.x);
              return (
              <g key={leaf.data.name} transform={`rotate(${angleDegrees})`}>
                <g transform={`translate(${leafRadius},0)`}>
                  <circle
                    r={4}
                    fill={(leaf.subfamily && subfamilyColorOf(leaf.subfamily)) || OTHER_COLOR}
                    stroke="#fcfcfb"
                    strokeWidth={2}
                  />
                  <text
                    transform={`translate(${labelRadius - leafRadius},0) rotate(${isLeft ? 180 : 0})`}
                    x={isLeft ? -7 : 7}
                    dy="0.32em"
                    fontSize={10}
                    fontStyle="italic"
                    fill="#0b0b0b"
                    textAnchor={isLeft ? "end" : "start"}
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
                  const value = leaf.data.traits?.[renderer.col.key];
                  const color = renderer.scale.colorOf(value);
                  const displayValue =
                    renderer.kind === "status" && typeof value === "string"
                      ? IUCN_STATUS_LABEL[value] ?? value
                      : formatTraitValue(renderer.col.key, value);
                  return (
                    <g
                      key={renderer.col.key}
                      transform={`translate(${traitRadius + ci * TRAIT_RING_SPACING},0)`}
                    >
                      <title>{`${leaf.data.name?.replace("_", " ")}: ${renderer.col.label} = ${displayValue ?? "no data"}`}</title>
                      <circle r={5} fill={color} />
                    </g>
                  );
                })}
              </g>
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








