import type { ReturnSeries } from "./types";

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

/** Annualized volatility from monthly returns. */
export function annualizedVol(monthly: number[]): number {
  return stdDev(monthly) * Math.sqrt(12);
}

/** Annualized Sharpe ratio from monthly returns and monthly risk-free rates. */
export function sharpe(monthly: number[], rfMonthly: number[]): number {
  const n = Math.min(monthly.length, rfMonthly.length);
  const excess = monthly.slice(-n).map((r, i) => r - rfMonthly.slice(-n)[i]);
  const sd = stdDev(excess);
  return sd === 0 ? 0 : (mean(excess) * 12) / (sd * Math.sqrt(12));
}

/** Maximum drawdown (positive fraction) of a value series. */
export function maxDrawdown(values: number[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const v of values) {
    peak = Math.max(peak, v);
    worst = Math.max(worst, 1 - v / peak);
  }
  return worst;
}

/** Historical VaR at the given confidence (positive number = loss). */
export function historicalVaR(returns: number[], confidence = 0.95): number {
  if (returns.length === 0) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const idx = Math.floor((1 - confidence) * sorted.length + 1e-9);
  return -sorted[Math.min(idx, sorted.length - 1)];
}

/** Expected shortfall beyond VaR (positive number = loss). */
export function cvar(returns: number[], confidence = 0.95): number {
  if (returns.length === 0) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const cut = Math.max(1, Math.floor((1 - confidence) * sorted.length + 1e-9));
  return -mean(sorted.slice(0, cut));
}

export function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return NaN;
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? NaN : num / den;
}

const MIN_OVERLAP = 60;

/** Pairwise correlation matrix over each pair's common labels (NaN if < 60 obs). */
export function correlationMatrix(seriesList: ReturnSeries[]): number[][] {
  const n = seriesList.length;
  const out: number[][] = Array.from({ length: n }, () => Array(n).fill(NaN));
  for (let i = 0; i < n; i++) {
    out[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const byLabel = new Map(seriesList[j].labels.map((l, k) => [l, seriesList[j].returns[k]]));
      const a: number[] = [];
      const b: number[] = [];
      for (let k = 0; k < seriesList[i].labels.length; k++) {
        const other = byLabel.get(seriesList[i].labels[k]);
        if (other !== undefined) {
          a.push(seriesList[i].returns[k]);
          b.push(other);
        }
      }
      out[i][j] = out[j][i] = a.length >= MIN_OVERLAP ? correlation(a, b) : NaN;
    }
  }
  return out;
}
