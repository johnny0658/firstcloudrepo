import { describe, expect, it } from "vitest";
import { categoryFor, runSpeculative, SPECULATIVE_SCENARIOS } from "../../src/engine/speculative";
import type { PriceSeries, TickerInfo } from "../../src/engine/types";

const multipolar = SPECULATIVE_SCENARIOS.find((s) => s.id === "multipolar_shift")!;
const aiBoom = SPECULATIVE_SCENARIOS.find((s) => s.id === "ai_boom")!;

function series(ticker: string, close: number): PriceSeries {
  return { ticker, dates: ["2026-08-01", "2026-08-21"], adjClose: [close, close] };
}

const tickerInfo = new Map<string, TickerInfo>([
  ["GLD", { symbol: "GLD", name: "Gold", type: "commodity_etf" }],
  ["TCHI", { symbol: "TCHI", name: "China tech", type: "equity_etf", category: "em_china" }],
  ["IGV", { symbol: "IGV", name: "Software", type: "equity_etf", category: "us_tech" }],
  ["KO", { symbol: "KO", name: "Coca-Cola", type: "stock" }],
  ["TLT", { symbol: "TLT", name: "Long treasuries", type: "bond_etf", duration: 16.5 }],
]);

describe("speculative scenarios", () => {
  it("category defaults: commodity -> gold, untagged equity -> us_broad", () => {
    expect(categoryFor(tickerInfo.get("GLD"))).toBe("gold");
    expect(categoryFor(tickerInfo.get("KO"))).toBe("us_broad");
    expect(categoryFor(tickerInfo.get("TCHI"))).toBe("em_china");
    expect(categoryFor(undefined)).toBe("us_broad");
  });

  it("multipolar shift: gold and China rise, a software SHORT gains, bonds fall by duration", () => {
    const prices = new Map([
      ["GLD", series("GLD", 100)],
      ["TCHI", series("TCHI", 20)],
      ["IGV", series("IGV", 100)],
      ["TLT", series("TLT", 80)],
    ]);
    const result = runSpeculative(
      {
        portfolio: {
          holdings: [
            { symbol: "GLD", shares: 10 }, // $1000
            { symbol: "TCHI", shares: 50 }, // $1000
            { symbol: "IGV", shares: -5 }, // -$500 short
            { symbol: "TLT", shares: 5 }, // $400
          ],
          cash: 600,
        },
        prices,
        tickerInfo,
      },
      multipolar,
    );
    const by = Object.fromEntries(result.holdings.map((h) => [h.symbol, h]));
    expect(by.GLD.returnPct).toBeCloseTo(0.6, 10); // gold +60%
    expect(by.GLD.dollarPnL).toBeCloseTo(600, 10);
    expect(by.TCHI.returnPct).toBeCloseTo(0.4, 10); // EM/China +40%
    expect(by.IGV.returnPct).toBeCloseTo(-0.35, 10); // software falls 35%...
    expect(by.IGV.dollarPnL).toBeCloseTo(175, 10); // ...so the short GAINS
    expect(by.TLT.returnPct).toBeCloseTo(-16.5 * 250 / 10000, 10); // rates +250bps
    expect(by.Cash.returnPct).toBe(0);
    // portfolio P&L: 600 + 400 + 175 - 165 = 1010
    expect(result.portfolioPnL).toBeCloseTo(1010, 6);
  });

  it("AI boom: tech shock applies and every scenario keeps returns above -100%", () => {
    const prices = new Map([["IGV", series("IGV", 100)]]);
    const inputs = { portfolio: { holdings: [{ symbol: "IGV", shares: 1 }], cash: 0 }, prices, tickerInfo };
    expect(runSpeculative(inputs, aiBoom).holdings[0].returnPct).toBeCloseTo(0.8, 10);
    for (const scn of SPECULATIVE_SCENARIOS) {
      for (const h of runSpeculative(inputs, scn).holdings) {
        expect(h.returnPct).toBeGreaterThanOrEqual(-1);
      }
    }
  });
});
