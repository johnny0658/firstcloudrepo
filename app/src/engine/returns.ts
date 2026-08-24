import type { PriceSeries, Portfolio, ReturnSeries } from "./types";

function intersectSorted(sets: Set<string>[]): string[] {
  if (sets.length === 0) return [];
  let common = sets[0];
  for (let i = 1; i < sets.length; i++) {
    const next = sets[i];
    common = new Set([...common].filter((x) => next.has(x)));
  }
  return [...common].sort();
}

export function dailyReturns(series: { dates: string[]; adjClose: number[] }): ReturnSeries {
  const labels: string[] = [];
  const returns: number[] = [];
  for (let i = 1; i < series.dates.length; i++) {
    labels.push(series.dates[i]);
    returns.push(series.adjClose[i] / series.adjClose[i - 1] - 1);
  }
  return { labels, returns };
}

/** Compound daily returns into calendar-month returns labeled YYYY-MM. */
export function toMonthly(daily: ReturnSeries): ReturnSeries {
  const labels: string[] = [];
  const returns: number[] = [];
  let current = "";
  let acc = 1;
  for (let i = 0; i < daily.labels.length; i++) {
    const month = daily.labels[i].slice(0, 7);
    if (month !== current) {
      if (current) {
        labels.push(current);
        returns.push(acc - 1);
      }
      current = month;
      acc = 1;
    }
    acc *= 1 + daily.returns[i];
  }
  if (current) {
    labels.push(current);
    returns.push(acc - 1);
  }
  return { labels, returns };
}

/**
 * Buy-and-hold portfolio value series over the intersection of all holdings'
 * trading dates. Cash is carried flat. Latest close is used for weights.
 */
export function portfolioValueSeries(
  portfolio: Portfolio,
  prices: Map<string, PriceSeries>,
): { dates: string[]; values: number[] } {
  const held = portfolio.holdings.filter((h) => h.shares !== 0 && prices.has(h.symbol));
  if (held.length === 0) return { dates: [], values: [] };

  const dates = intersectSorted(held.map((h) => new Set(prices.get(h.symbol)!.dates)));

  const closeByDate = new Map<string, Map<string, number>>();
  for (const h of held) {
    const s = prices.get(h.symbol)!;
    const m = new Map<string, number>();
    for (let i = 0; i < s.dates.length; i++) m.set(s.dates[i], s.adjClose[i]);
    closeByDate.set(h.symbol, m);
  }

  const values = dates.map((d) => {
    let v = portfolio.cash;
    for (const h of held) v += h.shares * closeByDate.get(h.symbol)!.get(d)!;
    return v;
  });
  return { dates, values };
}

export function valueSeriesToReturns(series: { dates: string[]; values: number[] }): ReturnSeries {
  return dailyReturns({ dates: series.dates, adjClose: series.values });
}

/** Latest adjusted close of a series. */
export function lastClose(series: PriceSeries): number {
  return series.adjClose[series.adjClose.length - 1];
}

/** Align several labeled return series on their common labels. */
export function alignReturns(seriesList: ReturnSeries[]): { labels: string[]; matrix: number[][] } {
  if (seriesList.length === 0) return { labels: [], matrix: [] };
  const labels = intersectSorted(seriesList.map((s) => new Set(s.labels)));
  const matrix = seriesList.map((s) => {
    const byLabel = new Map(s.labels.map((l, i) => [l, s.returns[i]]));
    return labels.map((l) => byLabel.get(l)!);
  });
  return { labels, matrix };
}
