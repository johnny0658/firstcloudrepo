import { describe, expect, it } from "vitest";
import { dailyReturns, portfolioValueSeries, toMonthly } from "../../src/engine/returns";

describe("returns", () => {
  it("computes daily simple returns", () => {
    const r = dailyReturns({ dates: ["2024-01-01", "2024-01-02", "2024-01-03"], adjClose: [100, 110, 99] });
    expect(r.returns[0]).toBeCloseTo(0.1, 10);
    expect(r.returns[1]).toBeCloseTo(-0.1, 10);
    expect(r.labels).toEqual(["2024-01-02", "2024-01-03"]);
  });

  it("compounds daily returns into calendar months", () => {
    const daily = {
      labels: ["2024-01-10", "2024-01-20", "2024-02-05"],
      returns: [0.1, 0.1, 0.05],
    };
    const monthly = toMonthly(daily);
    expect(monthly.labels).toEqual(["2024-01", "2024-02"]);
    expect(monthly.returns[0]).toBeCloseTo(1.1 * 1.1 - 1, 10);
    expect(monthly.returns[1]).toBeCloseTo(0.05, 10);
  });

  it("builds a buy-and-hold portfolio value series over common dates", () => {
    const prices = new Map([
      ["A", { ticker: "A", dates: ["2024-01-01", "2024-01-02", "2024-01-03"], adjClose: [10, 11, 12] }],
      ["B", { ticker: "B", dates: ["2024-01-02", "2024-01-03"], adjClose: [20, 19] }],
    ]);
    const series = portfolioValueSeries(
      { holdings: [{ symbol: "A", shares: 2 }, { symbol: "B", shares: 1 }], cash: 100 },
      prices,
    );
    expect(series.dates).toEqual(["2024-01-02", "2024-01-03"]);
    expect(series.values[0]).toBeCloseTo(2 * 11 + 20 + 100, 10);
    expect(series.values[1]).toBeCloseTo(2 * 12 + 19 + 100, 10);
  });
});
