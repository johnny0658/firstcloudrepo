import { describe, expect, it } from "vitest";
import { runEpisode, runHypothetical, type Episode } from "../../src/engine/scenarios";
import type { PriceSeries, RegressionResult, TickerInfo } from "../../src/engine/types";

const episode: Episode = {
  id: "test",
  name: "Test Crash",
  start: "2020-02-19",
  end: "2020-03-23",
  factorReturns: { MktRF: -33.0, SMB: -5.0, HML: -3.0, MOM: 2.0 },
  rateChangeBps: -125,
  cashReturn: 0.1,
  notes: "",
};

function mkSeries(ticker: string, dates: string[], closes: number[]): PriceSeries {
  return { ticker, dates, adjClose: closes };
}

const unitReg: RegressionResult = {
  betas: { alpha: 0, mktRF: 1, smb: 0, hml: 0, mom: 0 },
  tStats: { alpha: 0, mktRF: 0, smb: 0, hml: 0, mom: 0 },
  r2: 0.9,
  adjR2: 0.9,
  residualStd: 0.02,
  nObs: 60,
};

describe("scenarios", () => {
  it("uses direct replay when history covers the episode", () => {
    const prices = new Map([
      ["OLD", mkSeries("OLD", ["2020-01-02", "2020-02-19", "2020-03-23", "2025-01-02"], [100, 100, 66, 120])],
    ]);
    const result = runEpisode(
      {
        portfolio: { holdings: [{ symbol: "OLD", shares: 10 }], cash: 0 },
        prices,
        tickerInfo: new Map<string, TickerInfo>([["OLD", { symbol: "OLD", name: "", type: "equity_etf" }]]),
        regressions: new Map(),
      },
      episode,
    );
    expect(result.holdings[0].method).toBe("replay");
    expect(result.holdings[0].returnPct).toBeCloseTo(-0.34, 10); // 66/100 - 1
    expect(result.portfolioReturnPct).toBeCloseTo(-0.34, 10);
  });

  it("falls back to factor projection for young tickers", () => {
    const prices = new Map([["NEW", mkSeries("NEW", ["2023-01-03", "2025-01-02"], [50, 60])]]);
    const result = runEpisode(
      {
        portfolio: { holdings: [{ symbol: "NEW", shares: 1 }], cash: 0 },
        prices,
        tickerInfo: new Map<string, TickerInfo>([["NEW", { symbol: "NEW", name: "", type: "stock" }]]),
        regressions: new Map([["NEW", unitReg]]),
      },
      episode,
    );
    expect(result.holdings[0].method).toBe("factor");
    expect(result.holdings[0].returnPct).toBeCloseTo(-0.33, 10);
  });

  it("applies duration math to young bond ETFs", () => {
    const prices = new Map([["BONDX", mkSeries("BONDX", ["2023-01-03", "2025-01-02"], [50, 50])]]);
    const result = runEpisode(
      {
        portfolio: { holdings: [{ symbol: "BONDX", shares: 2 }], cash: 0 },
        prices,
        tickerInfo: new Map<string, TickerInfo>([
          ["BONDX", { symbol: "BONDX", name: "", type: "bond_etf", duration: 8 }],
        ]),
        regressions: new Map(),
      },
      episode,
    );
    expect(result.holdings[0].method).toBe("duration");
    // -8y duration x -125bps = +10%
    expect(result.holdings[0].returnPct).toBeCloseTo(0.1, 10);
  });

  it("short positions gain when the market falls", () => {
    const prices = new Map([["SHRT", mkSeries("SHRT", ["2024-01-02", "2025-01-02"], [100, 100])]]);
    const result = runHypothetical(
      {
        portfolio: { holdings: [{ symbol: "SHRT", shares: -10 }], cash: 2000 },
        prices,
        tickerInfo: new Map<string, TickerInfo>([["SHRT", { symbol: "SHRT", name: "", type: "equity_etf" }]]),
        regressions: new Map([["SHRT", unitReg]]),
      },
      -20,
      0,
    );
    const short = result.holdings.find((h) => h.symbol === "SHRT")!;
    expect(short.startValue).toBeCloseTo(-1000, 10); // -10 shares x $100
    expect(short.returnPct).toBeCloseTo(-0.2, 10); // the security falls 20%...
    expect(short.dollarPnL).toBeCloseTo(200, 10); // ...so the short GAINS $200
    expect(result.portfolioPnL).toBeCloseTo(200, 10);
    expect(result.startValue).toBeCloseTo(1000, 10); // net: 2000 cash - 1000 short
  });

  it("hypothetical shock: beta-scaled equity + duration-scaled bonds + flat cash", () => {
    const prices = new Map([
      ["EQ", mkSeries("EQ", ["2024-01-02", "2025-01-02"], [100, 100])],
      ["TLTX", mkSeries("TLTX", ["2024-01-02", "2025-01-02"], [100, 100])],
    ]);
    const result = runHypothetical(
      {
        portfolio: { holdings: [{ symbol: "EQ", shares: 1 }, { symbol: "TLTX", shares: 1 }], cash: 100 },
        prices,
        tickerInfo: new Map<string, TickerInfo>([
          ["EQ", { symbol: "EQ", name: "", type: "equity_etf" }],
          ["TLTX", { symbol: "TLTX", name: "", type: "bond_etf", duration: 16.5 }],
        ]),
        regressions: new Map([["EQ", unitReg]]),
      },
      -20,
      100,
    );
    const bySymbol = Object.fromEntries(result.holdings.map((h) => [h.symbol, h]));
    expect(bySymbol["EQ"].returnPct).toBeCloseTo(-0.2, 10);
    expect(bySymbol["TLTX"].returnPct).toBeCloseTo(-0.165, 10); // -16.5 x 100bps
    expect(bySymbol["Cash"].returnPct).toBe(0);
  });
});
