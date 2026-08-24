import { describe, expect, it } from "vitest";
import { coerceNumber, normalizeSymbol, validateStatement } from "../../src/ai/importSchema";
import { truncatePages } from "../../src/ai/pdfText";
import { mergePortfolio } from "../../src/state/merge";

describe("coerceNumber", () => {
  it("handles numbers, currency strings, parens negatives", () => {
    expect(coerceNumber(1234.5)).toBe(1234.5);
    expect(coerceNumber("1,234.56")).toBe(1234.56);
    expect(coerceNumber("$12,000")).toBe(12000);
    expect(coerceNumber("(500)")).toBe(-500);
    expect(coerceNumber("")).toBeNull();
    expect(coerceNumber("n/a")).toBeNull();
    expect(coerceNumber(NaN)).toBeNull();
    expect(coerceNumber(null)).toBeNull();
  });
});

describe("normalizeSymbol", () => {
  it("uppercases and maps share-class dots to dashes", () => {
    expect(normalizeSymbol(" brk.b ")).toBe("BRK-B");
    expect(normalizeSymbol("voo")).toBe("VOO");
    expect(normalizeSymbol(42)).toBe("");
  });
});

describe("validateStatement", () => {
  const clean = {
    statementDate: "2026-08-01",
    broker: "Test Broker",
    holdings: [
      { symbol: "AAPL", description: "Apple Inc", quantity: 10, marketValue: 2300, assetType: "stock" },
      { symbol: "voo", description: "Vanguard S&P 500", quantity: "25.5", marketValue: "$17,900.25", assetType: "etf" },
    ],
    cashBalance: "1,500.00",
    warnings: [],
  };

  it("passes a clean parse through with coercion", () => {
    const out = validateStatement(clean);
    expect(out.holdings).toHaveLength(2);
    expect(out.holdings[1].symbol).toBe("VOO");
    expect(out.holdings[1].quantity).toBe(25.5);
    expect(out.holdings[1].marketValue).toBe(17900.25);
    expect(out.cashBalance).toBe(1500);
    expect(out.broker).toBe("Test Broker");
  });

  it("drops rows with neither quantity nor value, with a warning", () => {
    const out = validateStatement({
      holdings: [{ symbol: "XYZ", description: "", quantity: null, marketValue: "n/a", assetType: "stock" }],
    });
    expect(out.holdings).toHaveLength(0);
    expect(out.warnings.some((w) => w.includes("XYZ"))).toBe(true);
  });

  it("keeps short positions (negative quantity) with an explanatory warning", () => {
    const out = validateStatement({
      holdings: [{ symbol: "IGV", description: "iShares Tech-Software", quantity: -20, marketValue: null, assetType: "etf" }],
    });
    expect(out.holdings).toHaveLength(1);
    expect(out.holdings[0].quantity).toBe(-20);
    expect(out.warnings.some((w) => w.includes("short position"))).toBe(true);
  });

  it("parses currency fields and defaults to USD", () => {
    const out = validateStatement({
      holdings: [
        { symbol: "GLD", description: "", quantity: 46.4, marketValue: null, currency: "usd", assetType: "etf" },
        { symbol: "AAPL", description: "", quantity: 5, marketValue: 1150, assetType: "stock" },
      ],
      cashBalance: 2000,
      cashCurrency: "sgd",
    });
    expect(out.holdings[0].currency).toBe("USD");
    expect(out.holdings[1].currency).toBe("USD");
    expect(out.cashCurrency).toBe("SGD");
  });

  it("clamps negative cash (margin debit) to null with a warning", () => {
    const out = validateStatement({ holdings: [], cashBalance: -500 });
    expect(out.cashBalance).toBeNull();
    expect(out.warnings.some((w) => w.includes("margin"))).toBe(true);
  });

  it("routes cash-type rows out of holdings", () => {
    const out = validateStatement({
      holdings: [{ symbol: "SPAXX", description: "Money market", quantity: 500, marketValue: 500, assetType: "cash" }],
      cashBalance: 500,
    });
    expect(out.holdings).toHaveLength(0);
    expect(out.cashBalance).toBe(500);
  });

  it("warns about stale statements", () => {
    const out = validateStatement({ ...clean, statementDate: "2020-01-15" });
    expect(out.warnings.some((w) => w.includes("2020-01-15"))).toBe(true);
  });

  it("rejects non-objects and missing holdings", () => {
    expect(() => validateStatement("nope")).toThrow();
    expect(() => validateStatement({})).toThrow();
  });

  it("tolerates junk warning/broker fields", () => {
    const out = validateStatement({ holdings: [], warnings: [1, "real"], broker: 9 });
    expect(out.warnings).toEqual(["real"]);
    expect(out.broker).toBeNull();
  });
});

describe("mergePortfolio", () => {
  const existing = { holdings: [{ symbol: "VOO", shares: 10 }, { symbol: "BND", shares: 50 }], cash: 1000 };
  const imported = { holdings: [{ symbol: "VOO", shares: 5 }, { symbol: "AAPL", shares: 8 }], cash: 200 };

  it("replace: statement becomes the portfolio", () => {
    const out = mergePortfolio(existing, imported, "replace");
    expect(out.holdings).toEqual(imported.holdings);
    expect(out.cash).toBe(200);
  });

  it("merge: sums same symbols, keeps others, adds cash", () => {
    const out = mergePortfolio(existing, imported, "merge");
    const map = Object.fromEntries(out.holdings.map((h) => [h.symbol, h.shares]));
    expect(map).toEqual({ VOO: 15, BND: 50, AAPL: 8 });
    expect(out.cash).toBe(1200);
  });

  it("merge: shorts net against longs and zero-net rows disappear", () => {
    const withShort = { holdings: [{ symbol: "IGV", shares: -20 }], cash: 0 };
    const out = mergePortfolio(existing, withShort, "merge");
    expect(out.holdings.find((h) => h.symbol === "IGV")?.shares).toBe(-20);
    const closedOut = mergePortfolio(
      { holdings: [{ symbol: "IGV", shares: 20 }], cash: 0 },
      withShort,
      "merge",
    );
    expect(closedOut.holdings.find((h) => h.symbol === "IGV")).toBeUndefined();
  });

  it("replace: keeps short rows", () => {
    const out = mergePortfolio(existing, { holdings: [{ symbol: "IGV", shares: -20 }], cash: 0 }, "replace");
    expect(out.holdings).toEqual([{ symbol: "IGV", shares: -20 }]);
  });
});

describe("truncatePages", () => {
  it("keeps everything under the cap, labeling pages", () => {
    const out = truncatePages(["first page", "second page"], 1000);
    expect(out.droppedPages).toEqual([]);
    expect(out.text).toContain("[page 1]");
    expect(out.text).toContain("[page 2]");
  });

  it("over cap: keeps page 1 and holdings-heavy pages, reports drops", () => {
    const filler = "transaction history line ".repeat(30); // ~750 chars, no keywords
    const holdingsPage = "SYMBOL quantity shares market value positions ".repeat(16); // keyword-rich
    const out = truncatePages(["summary intro", filler, holdingsPage, filler], 1600);
    expect(out.text).toContain("[page 1]");
    expect(out.text).toContain("[page 3]");
    expect(out.droppedPages.length).toBeGreaterThan(0);
    expect(out.droppedPages).not.toContain(1);
    expect(out.droppedPages).not.toContain(3);
  });
});
