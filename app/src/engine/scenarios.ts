import { lastClose } from "./returns";
import type { PriceSeries, Portfolio, RegressionResult, TickerInfo } from "./types";
import { durationFor } from "./durations";

export interface Episode {
  id: string;
  name: string;
  start: string;
  end: string;
  factorReturns: { MktRF: number; SMB: number; HML: number; MOM: number }; // cumulative %
  rateChangeBps: number;
  cashReturn: number; // %
  notes: string;
}

export type ScenarioMethod = "replay" | "factor" | "duration" | "cash";

export interface HoldingImpact {
  symbol: string;
  method: ScenarioMethod;
  returnPct: number; // decimal
  startValue: number;
  dollarPnL: number;
}

export interface ScenarioResult {
  portfolioReturnPct: number;
  portfolioPnL: number;
  startValue: number;
  holdings: HoldingImpact[];
}

interface ScenarioInputs {
  portfolio: Portfolio;
  prices: Map<string, PriceSeries>;
  tickerInfo: Map<string, TickerInfo>;
  regressions: Map<string, RegressionResult | null>;
}

function replayReturn(series: PriceSeries, start: string, end: string): number | null {
  if (series.dates[0] > start || series.dates[series.dates.length - 1] < end) return null;
  let iStart = series.dates.findIndex((d) => d >= start);
  let iEnd = series.dates.length - 1;
  while (iEnd > 0 && series.dates[iEnd] > end) iEnd--;
  if (iStart < 0 || iEnd <= iStart) return null;
  return series.adjClose[iEnd] / series.adjClose[iStart] - 1;
}

function factorReturn(reg: RegressionResult, ep: Episode): number {
  // Linear approximation: betas (estimated on monthly data) applied to the
  // episode's cumulative factor returns. Rough by design; labeled "estimated".
  // Clamped at -100%: a security's price cannot fall below zero, but the
  // linear model happily extrapolates past it for high-beta holdings.
  const f = ep.factorReturns;
  const { mktRF, smb, hml, mom } = reg.betas;
  return Math.max(-1, (mktRF * f.MktRF + smb * f.SMB + hml * f.HML + mom * f.MOM) / 100);
}

export function runEpisode(inputs: ScenarioInputs, ep: Episode): ScenarioResult {
  const impacts: HoldingImpact[] = [];

  for (const h of inputs.portfolio.holdings) {
    const series = inputs.prices.get(h.symbol);
    if (!series || h.shares === 0) continue;
    const info = inputs.tickerInfo.get(h.symbol);
    const startValue = h.shares * lastClose(series);

    let method: ScenarioMethod;
    let ret: number;
    const replayed = replayReturn(series, ep.start, ep.end);
    if (replayed !== null) {
      method = "replay";
      ret = replayed;
    } else if (info?.type === "bond_etf") {
      method = "duration";
      ret = Math.max(-1, (-durationFor(info) * ep.rateChangeBps) / 10000);
    } else {
      method = "factor";
      const reg = inputs.regressions.get(h.symbol);
      ret = reg ? factorReturn(reg, ep) : 0;
    }
    impacts.push({ symbol: h.symbol, method, returnPct: ret, startValue, dollarPnL: startValue * ret });
  }

  if (inputs.portfolio.cash > 0) {
    impacts.push({
      symbol: "Cash",
      method: "cash",
      returnPct: ep.cashReturn / 100,
      startValue: inputs.portfolio.cash,
      dollarPnL: (inputs.portfolio.cash * ep.cashReturn) / 100,
    });
  }

  const startValue = impacts.reduce((a, i) => a + i.startValue, 0);
  const pnl = impacts.reduce((a, i) => a + i.dollarPnL, 0);
  return {
    portfolioReturnPct: startValue ? pnl / startValue : 0,
    portfolioPnL: pnl,
    startValue,
    holdings: impacts,
  };
}

/** Hypothetical shock: equities move by beta x equityShockPct, bonds by -duration x rate move. */
export function runHypothetical(
  inputs: ScenarioInputs,
  equityShockPct: number, // e.g. -20 for a 20% equity selloff
  rateShockBps: number, // e.g. +200 for rates up 2%
): ScenarioResult {
  const impacts: HoldingImpact[] = [];

  for (const h of inputs.portfolio.holdings) {
    const series = inputs.prices.get(h.symbol);
    if (!series || h.shares === 0) continue;
    const info = inputs.tickerInfo.get(h.symbol);
    const startValue = h.shares * lastClose(series);

    let method: ScenarioMethod;
    let ret: number;
    if (info?.type === "bond_etf") {
      method = "duration";
      ret = Math.max(-1, (-durationFor(info) * rateShockBps) / 10000);
    } else {
      method = "factor";
      const reg = inputs.regressions.get(h.symbol);
      const beta = reg ? reg.betas.mktRF : 1.0;
      ret = Math.max(-1, (beta * equityShockPct) / 100);
    }
    impacts.push({ symbol: h.symbol, method, returnPct: ret, startValue, dollarPnL: startValue * ret });
  }

  if (inputs.portfolio.cash > 0) {
    impacts.push({ symbol: "Cash", method: "cash", returnPct: 0, startValue: inputs.portfolio.cash, dollarPnL: 0 });
  }

  const startValue = impacts.reduce((a, i) => a + i.startValue, 0);
  const pnl = impacts.reduce((a, i) => a + i.dollarPnL, 0);
  return {
    portfolioReturnPct: startValue ? pnl / startValue : 0,
    portfolioPnL: pnl,
    startValue,
    holdings: impacts,
  };
}
