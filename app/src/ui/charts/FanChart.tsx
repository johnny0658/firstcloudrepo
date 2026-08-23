import { useMemo, useRef, useState } from "react";
import type { ProjectionResult } from "../../engine/montecarlo";
import { fmtMoney } from "../format";

const W = 720;
const H = 300;
const PAD = { top: 12, right: 16, bottom: 26, left: 58 };

function niceTicks(max: number, count = 5): number[] {
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => max / s <= count) ?? raw;
  const ticks: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) ticks.push(v);
  return ticks;
}

/** Percentile fan chart: 10-90 and 25-75 washes plus a 2px median line. */
export function FanChart({ result }: { result: ProjectionResult }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hoverYear, setHoverYear] = useState<number | null>(null);

  const maxY = Math.max(...result.p90) * 1.05;
  const nYears = result.years.length - 1;
  const x = (year: number) => PAD.left + (year / nYears) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - v / maxY) * (H - PAD.top - PAD.bottom);

  const bandPath = (upper: number[], lower: number[]) => {
    const up = result.years.map((yr, i) => `${i === 0 ? "M" : "L"}${x(yr)},${y(upper[i])}`).join("");
    const down = [...result.years]
      .reverse()
      .map((yr) => `L${x(yr)},${y(lower[yr])}`)
      .join("");
    return `${up}${down}Z`;
  };
  const linePath = result.years.map((yr, i) => `${i === 0 ? "M" : "L"}${x(yr)},${y(result.p50[i])}`).join("");
  const ticks = useMemo(() => niceTicks(maxY), [maxY]);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const year = Math.round(((px - PAD.left) / (W - PAD.left - PAD.right)) * nYears);
    setHoverYear(year >= 0 && year <= nYears ? year : null);
  };

  const tooltipRows: Array<[string, number]> | null =
    hoverYear === null
      ? null
      : [
          ["90th percentile", result.p90[hoverYear]],
          ["75th percentile", result.p75[hoverYear]],
          ["Median", result.p50[hoverYear]],
          ["25th percentile", result.p25[hoverYear]],
          ["10th percentile", result.p10[hoverYear]],
        ];

  return (
    <div className="chart-wrap" ref={wrapRef}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        onPointerMove={onMove}
        onPointerLeave={() => setHoverYear(null)}
        role="img"
        aria-label="Projected portfolio value fan chart"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--text-muted)">
              {fmtMoney(t)}
            </text>
          </g>
        ))}
        {result.years
          .filter((yr) => yr % Math.ceil(nYears / 10) === 0)
          .map((yr) => (
            <text key={yr} x={x(yr)} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--text-muted)">
              {yr}y
            </text>
          ))}
        <path d={bandPath(result.p90, result.p10)} fill="var(--wash)" />
        <path d={bandPath(result.p75, result.p25)} fill="var(--wash)" />
        <path d={linePath} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} stroke="var(--baseline)" strokeWidth={1} />
        {hoverYear !== null && (
          <g>
            <line x1={x(hoverYear)} x2={x(hoverYear)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--baseline)" strokeWidth={1} />
            <circle cx={x(hoverYear)} cy={y(result.p50[hoverYear])} r={4} fill="var(--series-1)" stroke="var(--surface-1)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {tooltipRows && wrapRef.current && (
        <div
          className="chart-tooltip"
          style={{
            left: `${Math.min((x(hoverYear!) / W) * 100, 72)}%`,
            top: 8,
          }}
        >
          <div style={{ color: "var(--text-secondary)", marginBottom: 4 }}>Year {hoverYear}</div>
          {tooltipRows.map(([name, v]) => (
            <div className="row" key={name}>
              <span className="name">{name}</span>
              <span className="val">{fmtMoney(v)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="legend">
        <span className="item"><span className="line-key" style={{ background: "var(--series-1)" }} /> Median path</span>
        <span className="item"><span className="swatch" style={{ background: "var(--wash)" }} /> 25–75% band</span>
        <span className="item"><span className="swatch" style={{ background: "var(--wash)", opacity: 0.6 }} /> 10–90% band</span>
      </div>
    </div>
  );
}
