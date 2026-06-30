"use client";

import { useEffect, useMemo } from "react";
import { hierarchy } from "d3-hierarchy";
import { scaleLinear, scaleOrdinal, scaleSequential } from "d3-scale";
import { interpolateViridis, schemeTableau10 } from "d3-scale-chromatic";

export type TreeNode = {
  length: number;
  name?: string;
  traits?: Record<string, string | number | null>;
  children?: TreeNode[];
};

const LEAF_HEIGHT = 14;
const TREE_WIDTH = 1100;
const LABEL_WIDTH = 320;
const MARGIN = { top: 16, right: 16, bottom: 16, left: 16 };
const NO_DATA_COLOR = "#bfdbfe";

export type LegendItem = { label: string; color: string };

type Positioned = ReturnType<typeof hierarchy<TreeNode>> & { x: number; y: number };

export function formatLegendLabel(label: string) {
  return label
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}


export default function PhyloTree({
  data,
  trait,
  isContinuous,
  onLegendChange,
}: {
  data: TreeNode;
  trait: string;
  isContinuous: boolean;
  onLegendChange?: (legend: LegendItem[]) => void;
}) {
  const root = useMemo(() => hierarchy(data, (d) => d.children), [data]);

  const { nodes, links, xScale, height, colorOf, legend } = useMemo(() => {
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

    const maxX = Math.max(...leaves.map((d) => d.x));
    const xScale = scaleLinear().domain([0, maxX || 1]).range([0, TREE_WIDTH]);
    const links = root.links() as { source: Positioned; target: Positioned }[];
    const height = leaves.length * LEAF_HEIGHT;

    let colorOf: (leaf: Positioned) => string;
    let legend: LegendItem[];

    const hasMissing = leaves.some((d) => d.data.traits?.[trait] == null);

    if (isContinuous) {
      const values = leaves
        .map((d) => d.data.traits?.[trait])
        .filter((v): v is number => typeof v === "number");
      const scale = scaleSequential(interpolateViridis).domain([
        Math.min(...values),
        Math.max(...values),
      ]);
      colorOf = (leaf) => {
        const v = leaf.data.traits?.[trait];
        return typeof v === "number" ? scale(v) : NO_DATA_COLOR;
      };
      legend = values.length
        ? [
            { label: `low (${Math.min(...values).toFixed(2)})`, color: scale(Math.min(...values)) },
            { label: `high (${Math.max(...values).toFixed(2)})`, color: scale(Math.max(...values)) },
          ]
        : [];
    } else {
      const categories = Array.from(
        new Set(
          leaves
            .map((d) => d.data.traits?.[trait])
            .filter((v): v is string => typeof v === "string")
        )
      ).sort();
      const scale = scaleOrdinal<string, string>().domain(categories).range(schemeTableau10 as string[]);
      colorOf = (leaf) => {
        const v = leaf.data.traits?.[trait];
        return typeof v === "string" ? scale(v) : NO_DATA_COLOR;
      };
      legend = categories.map((c) => ({ label: c, color: scale(c) }));
    }
    if (hasMissing) legend.push({ label: "no data", color: NO_DATA_COLOR });

    return { nodes, links, xScale, height, colorOf, legend };
  }, [root, trait, isContinuous]);

  useEffect(() => {
    onLegendChange?.(legend);
  }, [legend, onLegendChange]);

  const width = MARGIN.left + TREE_WIDTH + LABEL_WIDTH + MARGIN.right;
  const svgHeight = MARGIN.top + height + MARGIN.bottom;

  return (
    <div>
      <div className="phylo-tree w-full overflow-auto rounded-lg border border-blue-100 bg-white shadow-sm" style={{ maxHeight: "75vh" }}>
        <svg width={width} height={svgHeight}>
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            {links.map((link, i) => {
              const sx = xScale(link.source.x);
              const sy = link.source.y;
              const tx = xScale(link.target.x);
              const ty = link.target.y;
              return (
                <path
                  key={i}
                  d={`M${sx},${sy} L${sx},${ty} L${tx},${ty}`}
                  fill="none"
                  stroke="#93c5fd"
                  strokeWidth={1}
                />
              );
            })}
            {nodes
              .filter((d) => !d.children)
              .map((leaf) => (
                <g key={leaf.data.name} transform={`translate(${xScale(leaf.x)},${leaf.y})`}>
                  <circle r={3.5} fill={colorOf(leaf)} stroke="#1d4ed8" strokeWidth={0.5} />
                  <text
                    x={7}
                    dy="0.32em"
                    fontSize={10}
                    fontStyle="italic"
                    fill="#1e3a8a"
                  >
                    {leaf.data.name?.replace("_", " ")}
                  </text>
                </g>
              ))}
          </g>
        </svg>
      </div>
    </div>
  );
}




