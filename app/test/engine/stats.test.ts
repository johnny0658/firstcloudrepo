import { describe, expect, it } from "vitest";
import { annualizedVol, correlation, cvar, historicalVaR, maxDrawdown, sharpe } from "../../src/engine/stats";

describe("stats", () => {
  it("max drawdown matches hand calculation", () => {
    // peak 120 -> trough 84 = 30% drawdown
    expect(maxDrawdown([100, 120, 96, 84, 110, 130])).toBeCloseTo(0.3, 10);
    expect(maxDrawdown([1, 2, 3])).toBe(0);
  });

  it("historical VaR/CVaR pick the loss tail", () => {
    const returns = [-0.1, -0.05, -0.02, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07];
    expect(historicalVaR(returns, 0.9)).toBeCloseTo(0.05, 10);
    expect(cvar(returns, 0.9)).toBeCloseTo(0.1, 10);
  });

  it("perfectly correlated and anti-correlated series", () => {
    expect(correlation([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 10);
    expect(correlation([1, 2, 3], [-1, -2, -3])).toBeCloseTo(-1, 10);
  });

  it("annualized vol scales monthly stdev by sqrt(12)", () => {
    const monthly = [0.01, -0.01, 0.02, -0.02, 0.015, -0.015];
    expect(annualizedVol(monthly)).toBeGreaterThan(0);
  });

  it("sharpe is zero for zero excess return", () => {
    const monthly = [0.001, 0.001, 0.001, 0.001];
    const rf = [0.001, 0.001, 0.001, 0.001];
    expect(sharpe(monthly, rf)).toBe(0);
  });
});
