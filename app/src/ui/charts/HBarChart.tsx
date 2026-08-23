import { useState } from "react";

export interface HBarDatum {
  label: string;
  value: number; // already in display units
  display: string; // formatted value label
  sublabel?: string;
}

const BAR_H = 18;
const GAP = 10;
const LABEL_W = 76;
const VALUE_W = 76;
const W = 640;

/**
 * Horizontal diverging bar chart: positive bars in --pos, negative in --neg,
 * 4px rounded data-end (square at the shared baseline), value at the tip.
 */
export function HBarChart({ data }: { data: HBarDatum[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (data.length === 0) return null;
  const maxAbs = Math.max(...data.map((d) => Math.abs(d.value)), 1e-9);
  const plotW = W - LABEL_W - VALUE_W - 16;
  const zeroX = LABEL_W + plotW / 2;
  const scale = plotW / 2 / maxAbs;
  const height = data.length * (BAR_H + GAP) + 8;

  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Contribution bar chart">
      <line x1={zeroX} x2={zeroX} y1={0} y2={height - 4} stroke="var(--baseline)" strokeWidth={1} />
      {data.map((d, i) => {
        const yTop = i * (BAR_H + GAP) + 4;
        const w = Math.abs(d.value) * scale;
        const isPos = d.value >= 0;
        const xStart = isPos ? zeroX : zeroX - w;
        const r = Math.min(4, w);
        // rounded corners on the data end only
        const path = isPos
          ? `M${xStart},${yTop} H${xStart + w - r} Q${xStart + w},${yTop} ${xStart + w},${yTop + r} V${yTop + BAR_H - r} Q${xStart + w},${yTop + BAR_H} ${xStart + w - r},${yTop + BAR_H} H${xStart} Z`
          : `M${xStart + w},${yTop} H${xStart + r} Q${xStart},${yTop} ${xStart},${yTop + r} V${yTop + BAR_H - r} Q${xStart},${yTop + BAR_H} ${xStart + r},${yTop + BAR_H} H${xStart + w} Z`;
        // keep the value label clear of the category-label column: if a
        // negative bar's label would collide, hang it off the baseline instead
        const estWidth = d.display.length * 6.4;
        const negFits = xStart - 6 - estWidth > LABEL_W;
        const labelX = isPos ? xStart + w + 6 : negFits ? xStart - 6 : zeroX + 6;
        const labelAnchor = isPos ? "start" : negFits ? "end" : "start";
        return (
          <g
            key={d.label}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
            style={{ opacity: hover === null || hover === i ? 1 : 0.55 }}
          >
            <rect x={0} y={yTop - GAP / 2} width={W} height={BAR_H + GAP} fill="transparent" />
            <text x={LABEL_W - 8} y={yTop + BAR_H / 2 + 4} textAnchor="end" fontSize={12} fill="var(--text-primary)">
              {d.label}
            </text>
            <path d={path} fill={isPos ? "var(--pos)" : "var(--neg)"} />
            <text
              x={labelX}
              y={yTop + BAR_H / 2 + 4}
              textAnchor={labelAnchor}
              fontSize={11.5}
              fill="var(--text-secondary)"
            >
              {d.display}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
