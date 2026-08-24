import type { Portfolio } from "../engine/types";

export type ApplyMode = "replace" | "merge";

/**
 * Replace: the statement IS the portfolio (multi-account users re-importing a
 * newer statement of the same account want this). Merge: add another account
 * on top — same symbol sums shares, cash balances add.
 */
export function mergePortfolio(
  existing: Portfolio,
  imported: Portfolio,
  mode: ApplyMode,
): Portfolio {
  if (mode === "replace") {
    return {
      holdings: imported.holdings.filter((h) => h.shares > 0),
      cash: Math.max(0, imported.cash),
    };
  }
  const bySymbol = new Map(existing.holdings.map((h) => [h.symbol, h.shares]));
  for (const h of imported.holdings) {
    if (h.shares <= 0) continue;
    bySymbol.set(h.symbol, (bySymbol.get(h.symbol) ?? 0) + h.shares);
  }
  return {
    holdings: [...bySymbol.entries()].map(([symbol, shares]) => ({ symbol, shares })),
    cash: Math.max(0, existing.cash) + Math.max(0, imported.cash),
  };
}
