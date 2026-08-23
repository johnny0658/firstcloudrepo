import { useState } from "react";

/**
 * Correlation heatmap as a CSS table. Diverging color: negative = --neg wash,
 * positive = --pos wash, near-zero recedes to the surface.
 */
export function CorrHeatmap({ labels, matrix }: { labels: string[]; matrix: number[][] }) {
  const [hover, setHover] = useState<string | null>(null);
  if (labels.length < 2) return null;

  const cellStyle = (v: number): React.CSSProperties => {
    if (Number.isNaN(v)) return { color: "var(--text-muted)" };
    const alpha = Math.min(1, Math.abs(v)) * 0.85;
    const base = v >= 0 ? "var(--pos)" : "var(--neg)";
    return {
      background: `color-mix(in oklab, ${base} ${Math.round(alpha * 100)}%, var(--surface-1))`,
      color: Math.abs(v) > 0.55 ? "#fff" : "var(--text-primary)",
    };
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="heatmap" aria-label="Correlation matrix">
        <thead>
          <tr>
            <th />
            {labels.map((l) => (
              <th key={l}>{l}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((row, i) => (
            <tr key={row}>
              <th style={{ textAlign: "right" }}>{row}</th>
              {labels.map((col, j) => {
                const v = matrix[i][j];
                const id = `${row}-${col}`;
                return (
                  <td
                    key={col}
                    style={cellStyle(v)}
                    onPointerEnter={() => setHover(id)}
                    onPointerLeave={() => setHover(null)}
                    title={`${row} vs ${col}: ${Number.isNaN(v) ? "insufficient overlap" : v.toFixed(2)}`}
                  >
                    {Number.isNaN(v) ? "–" : (hover === id || i === j ? v.toFixed(2) : v.toFixed(1))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
