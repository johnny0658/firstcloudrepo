import { describe, expect, it } from "vitest";
import { renderReportHtml, validateNarrative } from "../../src/report/render";
import type { ReportData } from "../../src/report/summary";

const narrative = {
  title: "Test Portfolio Review",
  sections: [
    { heading: "Overview", paragraphs: ["Your portfolio is worth $10.0K.", "It holds two funds."] },
    { heading: "Risk", paragraphs: ["Volatility is 12.0%."] },
  ],
  keyTakeaways: ["Diversified.", "Moderate risk."],
};

const data: ReportData = {
  generatedDate: "2026-08-24",
  dataAsOf: "2026-08-21",
  totalValue: 10000,
  cash: 1000,
  holdings: [
    { symbol: "VOO", name: "Vanguard S&P 500", shares: 10, value: 7000, weight: 0.7 },
    { symbol: "BND", name: "Vanguard Total Bond", shares: 25, value: 2000, weight: 0.2 },
  ],
  risk: { vol: 0.12, sharpe: 0.8, maxDD: 0.23, var95: 0.05, cvar95: 0.08, months: 100 },
  episodes: [
    {
      episode: {
        id: "covid_2020", name: "COVID Crash (Feb-Mar 2020)", start: "2020-02-19", end: "2020-03-23",
        factorReturns: { MktRF: -33, SMB: -2, HML: -17, MOM: 7 }, rateChangeBps: -125, cashReturn: 0.1, notes: "",
      },
      result: {
        portfolioReturnPct: -0.25, portfolioPnL: -2500, startValue: 10000,
        holdings: [
          { symbol: "VOO", method: "replay", returnPct: -0.34, startValue: 7000, dollarPnL: -2380 },
          { symbol: "BND", method: "duration", returnPct: 0.06, startValue: 2000, dollarPnL: 120 },
        ],
      },
    },
  ],
  hypothetical: { portfolioReturnPct: -0.15, portfolioPnL: -1500, startValue: 10000, holdings: [] },
  projection: {
    years: [0, 1, 2], p10: [10000, 10200, 10500], p25: [10000, 10600, 11200],
    p50: [10000, 11000, 12100], p75: [10000, 11500, 13200], p90: [10000, 12000, 14400],
    terminal: { p10: 10500, p25: 11200, p50: 12100, p75: 13200, p90: 14400, mean: 12200 },
    totalContributed: 10000,
  },
  projectionBasis: "bootstrapped from the portfolio's own 100-month history",
  regression: {
    betas: { alpha: 0.001, mktRF: 0.7, smb: 0.1, hml: -0.05, mom: 0.02 },
    tStats: { alpha: 1.1, mktRF: 20, smb: 1.5, hml: -0.8, mom: 0.4 },
    r2: 0.85, adjR2: 0.84, residualStd: 0.01, nObs: 60,
  },
  correlation: { labels: ["VOO", "BND"], matrix: [[1, 0.1], [0.1, 1]] },
};

describe("validateNarrative", () => {
  it("accepts a clean narrative", () => {
    const out = validateNarrative(narrative);
    expect(out.title).toBe("Test Portfolio Review");
    expect(out.sections).toHaveLength(2);
    expect(out.keyTakeaways).toHaveLength(2);
  });

  it("rejects empty or malformed narratives", () => {
    expect(() => validateNarrative(null)).toThrow();
    expect(() => validateNarrative({ sections: [] })).toThrow();
    expect(() => validateNarrative({ sections: [{ heading: "x", paragraphs: [] }] })).toThrow();
  });

  it("drops junk rows and defaults the title", () => {
    const out = validateNarrative({
      sections: [{ heading: 5, paragraphs: ["ok", 7] }, "junk"],
      keyTakeaways: "not-an-array",
    });
    expect(out.title).toBe("Portfolio Review");
    expect(out.sections[0].paragraphs).toEqual(["ok"]);
    expect(out.keyTakeaways).toEqual([]);
  });
});

describe("renderReportHtml", () => {
  it("produces a self-contained document with narrative, tables, charts, disclaimer", async () => {
    const html = await renderReportHtml(data, narrative, "deepseek-chat");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Test Portfolio Review");
    expect(html).toContain("Your portfolio is worth $10.0K.");
    expect(html).toContain("VOO");
    expect((html.match(/<svg/g) ?? []).length).toBeGreaterThanOrEqual(2); // episode bars + fan chart
    expect(html).toContain("not financial advice");
    expect(html).toContain("deepseek-chat");
    expect(html).toContain("Key takeaways");
    // no external references — fully self-contained
    expect(html).not.toMatch(/src="http/);
    expect(html).not.toMatch(/href="http/);
  });

  it("defines every CSS variable that the markup references", async () => {
    const html = await renderReportHtml(data, narrative, "m");
    const used = new Set([...html.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]));
    const styleBlock = html.match(/<style>([\s\S]*?)<\/style>/)![1];
    for (const v of used) {
      expect(styleBlock, `missing CSS variable definition for ${v}`).toContain(`${v}:`);
    }
    expect(used.size).toBeGreaterThan(3); // sanity: charts really do use variables
  });

  it("omits optional blocks when data is missing", async () => {
    const sparse: ReportData = { ...data, risk: null, projection: null, correlation: null, episodes: [] };
    const html = await renderReportHtml(sparse, narrative, "m");
    expect(html).not.toContain("20-year projection");
    expect(html).not.toContain("Risk statistics");
    expect(html).not.toContain("Correlation between holdings");
  });
});
