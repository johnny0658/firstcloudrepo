import type { TickerInfo } from "./types";

const DEFAULT_BOND_DURATION = 6.0;

/** Duration in years for rate-shock math; tickers.json is the primary source. */
export function durationFor(info: TickerInfo): number {
  return info.duration ?? DEFAULT_BOND_DURATION;
}
