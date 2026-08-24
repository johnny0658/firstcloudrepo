import { factorMimickedReturns } from "../engine/factors";
import { hasEnoughHistory, mulberry32, normalFrom, project, type ProjectionResult } from "../engine/montecarlo";
import { lastClose } from "../engine/returns";
import { runEpisode, runHypothetical, type Episode, type ScenarioResult } from "../engine/scenarios";
import { runSpeculative, SPECULATIVE_SCENARIOS, type SpeculativeScenario } from "../engine/speculative";
import { annualizedVol, correlationMatrix, cvar, historicalVaR, maxDrawdown, sharpe } from "../engine/stats";
import type { Portfolio, PriceSeries, RegressionResult } from "../engine/types";
import { fmtMoney, fmtNum, fmtPct, fmtSignedPct } from "../ui/format";
import type { PortfolioAnalytics, StaticData } from "../ui/useAnalytics";

export const REPORT_HORIZON_YEARS = 20;
export const HYPO_EQUITY_SHOCK = -20;
export const HYPO_RATE_SHOCK_BPS = 100;

export interface ReportHolding {
  symbol: string;
  name: string;
  shares: number;
  value: number;
  weight: number;
}

export interface ReportRisk {
  vol: number;
  sharpe: number;
  maxDD: number;
  var95: number;
  cvar95: number;
  months: number;
}

/** Everything the report needs, computed once by the same engine paths the
 * tabs use. The LLM only ever sees the formatted-string summary of this. */
export interface ReportData {
  generatedDate: string;
  dataAsOf: string;
  totalValue: number;
  cash: number;
  holdings: ReportHolding[];
  risk: ReportRisk | null;
  episodes: Array<{ episode: Episode; result: ScenarioResult }>;
  speculative: Array<{ scenario: SpeculativeScenario; result: ScenarioResult }>;
  hypothetical: ScenarioResult;
  projection: ProjectionResult | null;
  projectionBasis: string;
  regression: RegressionResult | null;
  correlation: { labels: string[]; matrix: number[][] } | null;
}

export function buildReportData(
  portfolio: Portfolio,
  prices: Map<string, PriceSeries>,
  staticData: StaticData,
  analytics: PortfolioAnalytics,
): ReportData {
  const holdings: ReportHolding[] = portfolio.holdings
    .filter((h) => prices.has(h.symbol))
    .map((h) => ({
      symbol: h.symbol,
      name: staticData.tickerInfo.get(h.symbol)?.name ?? "",
      shares: h.shares,
      value: h.shares * lastClose(prices.get(h.symbol)!),
      weight: 0,
    }));
  const totalValue = holdings.reduce((a, h) => a + h.value, 0) + portfolio.cash;
  for (const h of holdings) h.weight = totalValue ? h.value / totalValue : 0;
  holdings.sort((a, b) => b.value - a.value);

  let risk: ReportRisk | null = null;
  const monthly = analytics.monthlyReturns;
  if (monthly.returns.length >= 6) {
    const rfByMonth = new Map(staticData.factors.months.map((m, i) => [m, staticData.factors.rf[i]]));
    risk = {
      vol: annualizedVol(monthly.returns),
      sharpe: sharpe(monthly.returns, monthly.labels.map((m) => rfByMonth.get(m) ?? 0)),
      maxDD: maxDrawdown(analytics.valueSeries.values),
      var95: historicalVaR(monthly.returns),
      cvar95: cvar(monthly.returns),
      months: monthly.returns.length,
    };
  }

  const scenarioInputs = {
    portfolio,
    prices,
    tickerInfo: staticData.tickerInfo,
    regressions: analytics.scenarioRegressions,
  };
  const episodes = staticData.episodes.map((episode) => ({
    episode,
    result: runEpisode(scenarioInputs, episode),
  }));
  const hypothetical = runHypothetical(scenarioInputs, HYPO_EQUITY_SHOCK, HYPO_RATE_SHOCK_BPS);
  const speculative = SPECULATIVE_SCENARIOS.map((scenario) => ({
    scenario,
    result: runSpeculative({ portfolio, prices, tickerInfo: staticData.tickerInfo }, scenario),
  }));

  let projection: ProjectionResult | null = null;
  let projectionBasis = "";
  const initialValue = analytics.valueSeries.values.at(-1) ?? 0;
  if (initialValue > 0) {
    let series = monthly;
    projectionBasis = `bootstrapped from the portfolio's own ${series.returns.length}-month history`;
    if (!hasEnoughHistory(series) && analytics.portfolioRegression) {
      series = factorMimickedReturns(analytics.portfolioRegression, staticData.factors, normalFrom(mulberry32(11)));
      projectionBasis = "bootstrapped from a factor-mimicking series (portfolio history is short)";
    }
    if (series.returns.length >= 6) {
      projection = project({
        monthlyReturns: series.returns,
        initialValue,
        monthlyContribution: 0,
        years: REPORT_HORIZON_YEARS,
        seed: 42,
      });
    }
  }

  let correlation: { labels: string[]; matrix: number[][] } | null = null;
  const corrLabels = holdings.map((h) => h.symbol);
  if (corrLabels.length >= 2) {
    const seriesList = corrLabels.map((s) => {
      const p = prices.get(s)!;
      const labels: string[] = [];
      const returns: number[] = [];
      for (let i = 1; i < p.dates.length; i++) {
        labels.push(p.dates[i]);
        returns.push(p.adjClose[i] / p.adjClose[i - 1] - 1);
      }
      return { labels, returns };
    });
    correlation = { labels: corrLabels, matrix: correlationMatrix(seriesList) };
  }

  return {
    generatedDate: staticData.meta.lastUpdated.slice(0, 10),
    dataAsOf: staticData.meta.lastUpdated.slice(0, 10),
    totalValue,
    cash: portfolio.cash,
    holdings,
    risk,
    episodes,
    speculative,
    hypothetical,
    projection,
    projectionBasis,
    regression: analytics.portfolioRegression,
    correlation,
  };
}

function extreme(result: ScenarioResult, worst: boolean): string {
  const rows = result.holdings.filter((h) => h.method !== "cash");
  if (rows.length === 0) return "n/a";
  const pick = rows.reduce((a, b) => ((worst ? a.returnPct < b.returnPct : a.returnPct > b.returnPct) ? a : b));
  return `${pick.symbol} (${fmtSignedPct(pick.returnPct)})`;
}

/** Compact, display-string summary for the LLM. Strings are quoted verbatim
 * by the model, which is the cheapest defense against invented numbers. */
export function buildLlmSummary(data: ReportData): Record<string, unknown> {
  const top = data.holdings.slice(0, 10);
  const otherValue = data.holdings.slice(10).reduce((a, h) => a + h.value, 0);
  return {
    dataAsOf: data.dataAsOf,
    totalValue: fmtMoney(data.totalValue),
    cash: fmtMoney(data.cash),
    holdings: [
      ...top.map((h) => ({
        symbol: h.symbol,
        name: h.shares < 0 ? `${h.name} (SHORT position — profits when its price falls)` : h.name,
        value: fmtMoney(h.value),
        weight: fmtPct(h.weight),
      })),
      ...(otherValue > 0 ? [{ symbol: "other", name: `${data.holdings.length - 10} smaller holdings`, value: fmtMoney(otherValue), weight: fmtPct(otherValue / data.totalValue) }] : []),
    ],
    risk: data.risk
      ? {
          annualizedVolatility: fmtPct(data.risk.vol),
          sharpeRatio: fmtNum(data.risk.sharpe),
          maxDrawdown: fmtPct(data.risk.maxDD),
          monthlyVaR95: fmtPct(data.risk.var95),
          monthlyCVaR95: fmtPct(data.risk.cvar95),
          monthsOfHistory: data.risk.months,
        }
      : null,
    historicalScenarios: data.episodes.map(({ episode, result }) => ({
      name: episode.name,
      period: `${episode.start} to ${episode.end}`,
      portfolioReturn: fmtSignedPct(result.portfolioReturnPct),
      dollarImpact: fmtMoney(result.portfolioPnL),
      worstHolding: extreme(result, true),
      bestHolding: extreme(result, false),
    })),
    forwardLookingScenarios: data.speculative.map(({ scenario, result }) => ({
      name: scenario.name,
      premise: scenario.story,
      portfolioReturn: fmtSignedPct(result.portfolioReturnPct),
      dollarImpact: fmtMoney(result.portfolioPnL),
      worstHolding: extreme(result, true),
      bestHolding: extreme(result, false),
      note: scenario.cashNote,
    })),
    hypotheticalShock: {
      assumption: `stocks ${HYPO_EQUITY_SHOCK}%, interest rates +${HYPO_RATE_SHOCK_BPS}bps`,
      portfolioReturn: fmtSignedPct(data.hypothetical.portfolioReturnPct),
      dollarImpact: fmtMoney(data.hypothetical.portfolioPnL),
    },
    projection20y: data.projection
      ? {
          basis: data.projectionBasis,
          pessimistic10th: fmtMoney(data.projection.terminal.p10),
          median: fmtMoney(data.projection.terminal.p50),
          optimistic90th: fmtMoney(data.projection.terminal.p90),
          startingValue: fmtMoney(data.totalValue),
        }
      : null,
    factorExposures: data.regression
      ? {
          marketBeta: fmtNum(data.regression.betas.mktRF),
          sizeBeta: fmtNum(data.regression.betas.smb),
          valueBeta: fmtNum(data.regression.betas.hml),
          momentumBeta: fmtNum(data.regression.betas.mom),
          annualAlpha: fmtSignedPct(data.regression.betas.alpha * 12),
          alphaSignificant: Math.abs(data.regression.tStats.alpha) > 2,
          rSquared: fmtPct(data.regression.r2, 0),
        }
      : null,
  };
}
