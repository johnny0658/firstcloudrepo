import { useEffect, useMemo, useState } from "react";
import { loadEpisodes, loadFactorTables, loadMeta, loadPrices, loadTickers, type Meta } from "../data/loader";
import { buildFactorMatrix, defaultBetas, regressOnFactors } from "../engine/factors";
import { dailyReturns, portfolioValueSeries, toMonthly, valueSeriesToReturns } from "../engine/returns";
import type { Episode } from "../engine/scenarios";
import type { FactorMatrix, Portfolio, PriceSeries, RegressionResult, ReturnSeries, TickerInfo } from "../engine/types";

export interface StaticData {
  meta: Meta;
  tickerInfo: Map<string, TickerInfo>;
  factors: FactorMatrix;
  episodes: Episode[];
}

export function useStaticData(): { data: StaticData | null; error: string | null } {
  const [data, setData] = useState<StaticData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const meta = await loadMeta();
        const [tickerInfo, tables, episodes] = await Promise.all([
          loadTickers(),
          loadFactorTables(),
          loadEpisodes(),
        ]);
        setData({ meta, tickerInfo, factors: buildFactorMatrix(tables.ff3, tables.mom), episodes });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);
  return { data, error };
}

export function usePrices(symbols: string[]): Map<string, PriceSeries> | null {
  const [prices, setPrices] = useState<Map<string, PriceSeries> | null>(null);
  const key = symbols.slice().sort().join(",");
  useEffect(() => {
    let alive = true;
    loadPrices(key ? key.split(",") : []).then((m) => {
      if (alive) setPrices(m);
    });
    return () => {
      alive = false;
    };
  }, [key]);
  return prices;
}

export interface PortfolioAnalytics {
  valueSeries: { dates: string[]; values: number[] };
  /** True when shorts drove the historical portfolio value to zero or below —
   * return math breaks down there, so analytics tabs must refuse to render. */
  shortsTooLarge: boolean;
  dailyReturns: ReturnSeries;
  monthlyReturns: ReturnSeries;
  regressions: Map<string, RegressionResult | null>;
  /** Regression (or type-default fallback) per holding, for scenario math. */
  scenarioRegressions: Map<string, RegressionResult>;
  portfolioRegression: RegressionResult | null;
  holdingMonthly: Map<string, ReturnSeries>;
}

export function usePortfolioAnalytics(
  portfolio: Portfolio,
  prices: Map<string, PriceSeries> | null,
  staticData: StaticData | null,
): PortfolioAnalytics | null {
  return useMemo(() => {
    if (!prices || !staticData) return null;
    const series = portfolioValueSeries(portfolio, prices);
    const shortsTooLarge = series.values.some((v) => v <= 0);
    const daily = shortsTooLarge ? { labels: [], returns: [] } : valueSeriesToReturns(series);
    const monthly = toMonthly(daily);

    const regressions = new Map<string, RegressionResult | null>();
    const scenarioRegressions = new Map<string, RegressionResult>();
    const holdingMonthly = new Map<string, ReturnSeries>();
    for (const h of portfolio.holdings) {
      const s = prices.get(h.symbol);
      if (!s) continue;
      const m = toMonthly(dailyReturns(s));
      holdingMonthly.set(h.symbol, m);
      const reg = regressOnFactors(m, staticData.factors);
      regressions.set(h.symbol, reg);
      scenarioRegressions.set(h.symbol, reg ?? defaultBetas(staticData.tickerInfo.get(h.symbol)));
    }
    return {
      valueSeries: series,
      shortsTooLarge,
      dailyReturns: daily,
      monthlyReturns: monthly,
      regressions,
      scenarioRegressions,
      portfolioRegression: regressOnFactors(monthly, staticData.factors),
      holdingMonthly,
    };
  }, [portfolio, prices, staticData]);
}
