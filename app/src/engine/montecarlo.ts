import type { ReturnSeries } from "./types";

/** Deterministic 32-bit PRNG so projections are reproducible/testable. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box-Muller on a uniform PRNG. */
export function normalFrom(rng: () => number): () => number {
  return () => {
    let u = 0;
    while (u === 0) u = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
  };
}

export const BLOCK_LENGTH_MONTHS = 6;
export const NUM_PATHS = 2000;

export interface ProjectionInputs {
  monthlyReturns: number[]; // historical monthly portfolio returns (decimal)
  initialValue: number;
  monthlyContribution: number;
  years: number;
  seed?: number;
  numPaths?: number;
}

export interface ProjectionResult {
  years: number[]; // 0..N
  p10: number[];
  p25: number[];
  p50: number[];
  p75: number[];
  p90: number[];
  terminal: { p10: number; p25: number; p50: number; p75: number; p90: number; mean: number };
  totalContributed: number;
}

function percentile(sortedAsc: number[], p: number): number {
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

/**
 * Block-bootstrap Monte Carlo: resample overlapping 6-month blocks of the
 * historical monthly return series, preserving short-run autocorrelation.
 */
export function project(inputs: ProjectionInputs): ProjectionResult {
  const { monthlyReturns, initialValue, monthlyContribution, years } = inputs;
  const numPaths = inputs.numPaths ?? NUM_PATHS;
  const months = years * 12;
  if (monthlyReturns.length < BLOCK_LENGTH_MONTHS) {
    throw new Error("need at least one block of monthly history");
  }
  const rng = mulberry32(inputs.seed ?? 42);
  const maxStart = monthlyReturns.length - BLOCK_LENGTH_MONTHS;

  // valuesAtYear[y] collects each path's value at year y
  const valuesAtYear: number[][] = Array.from({ length: years + 1 }, () => []);
  const terminals: number[] = [];

  for (let p = 0; p < numPaths; p++) {
    let value = initialValue;
    valuesAtYear[0].push(value);
    let monthIdx = 0;
    while (monthIdx < months) {
      const start = Math.floor(rng() * (maxStart + 1));
      for (let b = 0; b < BLOCK_LENGTH_MONTHS && monthIdx < months; b++, monthIdx++) {
        value = value * (1 + monthlyReturns[start + b]) + monthlyContribution;
        if ((monthIdx + 1) % 12 === 0) valuesAtYear[(monthIdx + 1) / 12].push(value);
      }
    }
    terminals.push(value);
  }

  const band = (p: number) => valuesAtYear.map((vs) => percentile([...vs].sort((a, b) => a - b), p));
  const sortedTerm = [...terminals].sort((a, b) => a - b);
  return {
    years: Array.from({ length: years + 1 }, (_, i) => i),
    p10: band(0.1),
    p25: band(0.25),
    p50: band(0.5),
    p75: band(0.75),
    p90: band(0.9),
    terminal: {
      p10: percentile(sortedTerm, 0.1),
      p25: percentile(sortedTerm, 0.25),
      p50: percentile(sortedTerm, 0.5),
      p75: percentile(sortedTerm, 0.75),
      p90: percentile(sortedTerm, 0.9),
      mean: terminals.reduce((a, b) => a + b, 0) / terminals.length,
    },
    totalContributed: initialValue + monthlyContribution * months,
  };
}

/** Convenience: minimum history length (months) before we trust direct bootstrap. */
export const MIN_BOOTSTRAP_MONTHS = 36;

export function hasEnoughHistory(series: ReturnSeries): boolean {
  return series.returns.length >= MIN_BOOTSTRAP_MONTHS;
}
