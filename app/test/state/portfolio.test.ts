import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPortfolio, savePortfolio } from "../../src/state/portfolio";

function stubStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  return store;
}

afterEach(() => vi.unstubAllGlobals());

describe("portfolio persistence", () => {
  it("round-trips short positions (regression: loads used to drop negative shares)", () => {
    stubStorage();
    const portfolio = {
      holdings: [
        { symbol: "GLD", shares: 46.4 },
        { symbol: "IGV", shares: -69 },
      ],
      cash: 18200,
    };
    savePortfolio(portfolio);
    const loaded = loadPortfolio();
    expect(loaded.holdings).toEqual(portfolio.holdings);
    expect(loaded.cash).toBe(18200);
  });

  it("drops zero-share and malformed rows on load", () => {
    const store = stubStorage();
    store.set(
      "pfsim.v1",
      JSON.stringify({ holdings: [{ symbol: "VOO", shares: 0 }, { symbol: 5, shares: 2 }, { symbol: "BND", shares: 3 }], cash: -50 }),
    );
    const loaded = loadPortfolio();
    expect(loaded.holdings).toEqual([{ symbol: "BND", shares: 3 }]);
    expect(loaded.cash).toBe(0);
  });
});
