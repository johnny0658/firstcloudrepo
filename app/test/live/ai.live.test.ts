/**
 * LIVE tests against a real OpenAI-compatible API (DeepSeek by default).
 * They exercise the app's actual prompts, client, and validators end-to-end
 * with real model behavior — the one thing stubs can't cover.
 *
 * Skipped automatically unless DEEPSEEK_API_KEY is set, so `npm test` and CI
 * never call the network. Run via the "AI Live Test" workflow (dispatch-only)
 * or locally: DEEPSEEK_API_KEY=sk-... npx vitest run test/live
 *
 * Full model responses are logged so prompt regressions can be diagnosed
 * from the workflow logs.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { chatJson } from "../../src/ai/client";
import { validateStatement } from "../../src/ai/importSchema";
import { truncatePages } from "../../src/ai/pdfText";
import {
  buildImportUserPrompt,
  buildReportUserPrompt,
  IMPORT_SYSTEM_PROMPT,
  REPORT_SYSTEM_PROMPT,
} from "../../src/ai/prompts";
import { validateNarrative } from "../../src/report/render";
import type { AiSettings } from "../../src/ai/settings";

const apiKey = process.env.DEEPSEEK_API_KEY ?? "";
const settings: AiSettings = {
  baseUrl: process.env.AI_BASE_URL ?? "https://api.deepseek.com",
  model: process.env.AI_MODEL ?? "deepseek-chat",
  apiKey,
  persistKey: true,
};

const FIXTURES = join(__dirname, "..", "fixtures");
const LLM_TIMEOUT = 120_000;

/** Same joining rules as the app's extractPdfText, using pdf.js's Node build. */
async function extractFixture(name: string): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(readFileSync(join(FIXTURES, name)));
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    let s = "";
    for (const item of content.items) {
      if (!("str" in item)) continue;
      s += item.str;
      s += item.hasEOL ? "\n" : " ";
    }
    pages.push(s.replace(/[ \t]+\n/g, "\n"));
  }
  return truncatePages(pages).text;
}

async function parseFixture(name: string) {
  const text = await extractFixture(name);
  const raw = await chatJson(settings, [
    { role: "system", content: IMPORT_SYSTEM_PROMPT },
    { role: "user", content: buildImportUserPrompt(text) },
  ]);
  console.log(`\n=== raw model output for ${name} ===\n${JSON.stringify(raw, null, 2)}\n`);
  return validateStatement(raw);
}

describe.skipIf(!apiKey)("live statement parsing", () => {
  it(
    "parses the clean fixture statement exactly",
    async () => {
      const out = await parseFixture("sample-statement.pdf");
      const bySymbol = Object.fromEntries(out.holdings.map((h) => [h.symbol, h]));

      expect(bySymbol.VOO?.quantity).toBe(25);
      expect(bySymbol.AAPL?.quantity).toBe(40);
      expect(bySymbol.BND?.quantity).toBe(120);
      expect(bySymbol["BRK-B"]?.quantity).toBe(10);
      // SPAXX is a money market: must land in cash items, not holdings —
      // and the same $2,150 must not be double counted with the cash line
      expect(bySymbol.SPAXX).toBeUndefined();
      const totalUsdCash = out.cashItems.filter((c) => c.currency === "USD").reduce((a, c) => a + c.amount, 0);
      expect(totalUsdCash).toBe(2150);
      expect(out.statementDate).toBe("2026-08-21");
    },
    LLM_TIMEOUT,
  );

  it(
    "handles the messy multi-page statement: holdings in, transactions out",
    async () => {
      const out = await parseFixture("messy-statement.pdf");
      const bySymbol = Object.fromEntries(out.holdings.map((h) => [h.symbol, h]));

      expect(bySymbol.AAPL?.quantity).toBe(15.5);
      expect(bySymbol.TLT?.quantity).toBe(30);
      expect(bySymbol.VTI?.quantity).toBe(52);
      expect(bySymbol.SCHD?.quantity).toBe(120);
      expect(bySymbol.QQQ?.quantity).toBe(9);
      // the short position must survive with its negative quantity
      expect(bySymbol.IGV?.quantity).toBe(-18);
      expect(out.warnings.some((w) => w.includes("short position"))).toBe(true);
      // transaction-history traps: sold/cancelled tickers must not appear
      expect(bySymbol.NVDA).toBeUndefined();
      expect(bySymbol.MSFT).toBeUndefined();
      // SGD cash fund: itemized in its own currency
      const totalSgd = out.cashItems.filter((c) => c.currency === "SGD").reduce((a, c) => a + c.amount, 0);
      expect(totalSgd).toBe(4300);
    },
    LLM_TIMEOUT,
  );

  it(
    "returns no holdings for a document that isn't a statement",
    async () => {
      const out = await parseFixture("not-a-statement.pdf");
      expect(out.holdings).toHaveLength(0);
    },
    LLM_TIMEOUT,
  );
});

describe.skipIf(!apiKey)("live report narrative", () => {
  it(
    "writes a valid narrative that quotes the given figures",
    async () => {
      const summary = {
        dataAsOf: "2026-08-21",
        totalValue: "$42.8K",
        cash: "$2,150",
        holdings: [
          { symbol: "VOO", name: "Vanguard S&P 500", value: "$17.6K", weight: "41.1%" },
          { symbol: "AAPL", name: "Apple", value: "$9.2K", weight: "21.5%" },
          { symbol: "BND", name: "Vanguard Total Bond", value: "$8.9K", weight: "20.8%" },
        ],
        risk: {
          annualizedVolatility: "13.7%",
          sharpeRatio: "0.71",
          maxDrawdown: "24.2%",
          monthlyVaR95: "5.9%",
          monthlyCVaR95: "8.3%",
          monthsOfHistory: 119,
        },
        historicalScenarios: [
          {
            name: "COVID Crash (Feb-Mar 2020)",
            period: "2020-02-19 to 2020-03-23",
            portfolioReturn: "-24.6%",
            dollarImpact: "-$10.5K",
            worstHolding: "AAPL (-31.2%)",
            bestHolding: "BND (+1.1%)",
          },
        ],
        hypotheticalShock: { assumption: "stocks -20%, interest rates +100bps", portfolioReturn: "-13.1%", dollarImpact: "-$5.6K" },
        projection20y: {
          basis: "bootstrapped from the portfolio's own 119-month history",
          pessimistic10th: "$68.2K",
          median: "$154.9K",
          optimistic90th: "$342.1K",
          startingValue: "$42.8K",
        },
        factorExposures: {
          marketBeta: "0.74",
          sizeBeta: "-0.05",
          valueBeta: "-0.12",
          momentumBeta: "0.03",
          annualAlpha: "+0.4%",
          alphaSignificant: false,
          rSquared: "93%",
        },
      };
      const raw = await chatJson(settings, [
        { role: "system", content: REPORT_SYSTEM_PROMPT },
        { role: "user", content: buildReportUserPrompt(JSON.stringify(summary)) },
      ]);
      console.log(`\n=== raw narrative output ===\n${JSON.stringify(raw, null, 2)}\n`);
      const narrative = validateNarrative(raw);

      expect(narrative.sections.length).toBeGreaterThanOrEqual(4);
      expect(narrative.sections.length).toBeLessThanOrEqual(8);
      expect(narrative.keyTakeaways.length).toBeGreaterThanOrEqual(3);
      const allText = narrative.sections.flatMap((s) => s.paragraphs).join(" ");
      // the model must quote given figures, not invent its own
      const quoted = ["13.7%", "-24.6%", "$154.9K", "0.74", "24.2%"].filter((f) => allText.includes(f));
      console.log("figures quoted verbatim:", quoted);
      expect(quoted.length).toBeGreaterThanOrEqual(2);
    },
    LLM_TIMEOUT,
  );
});
