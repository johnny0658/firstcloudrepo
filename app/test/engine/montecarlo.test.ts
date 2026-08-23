import { describe, expect, it } from "vitest";
import { mulberry32, project } from "../../src/engine/montecarlo";

const flatReturns = Array(120).fill(0.005); // 0.5%/month, deterministic

describe("montecarlo", () => {
  it("is reproducible with the same seed", () => {
    const returns = Array.from({ length: 120 }, (_, i) => (i % 2 ? 0.02 : -0.01));
    const a = project({ monthlyReturns: returns, initialValue: 10000, monthlyContribution: 100, years: 10, seed: 7 });
    const b = project({ monthlyReturns: returns, initialValue: 10000, monthlyContribution: 100, years: 10, seed: 7 });
    expect(a.terminal.p50).toBe(b.terminal.p50);
    expect(a.p10).toEqual(b.p10);
  });

  it("matches closed-form compounding for constant returns", () => {
    const result = project({
      monthlyReturns: flatReturns,
      initialValue: 1000,
      monthlyContribution: 0,
      years: 5,
      seed: 1,
      numPaths: 10,
    });
    const expected = 1000 * Math.pow(1.005, 60);
    expect(result.terminal.p50).toBeCloseTo(expected, 6);
    expect(result.terminal.p10).toBeCloseTo(expected, 6); // no variance
  });

  it("contributions raise every percentile", () => {
    const returns = Array.from({ length: 120 }, (_, i) => (i % 3 === 0 ? -0.02 : 0.015));
    const without = project({ monthlyReturns: returns, initialValue: 10000, monthlyContribution: 0, years: 10, seed: 3 });
    const withC = project({ monthlyReturns: returns, initialValue: 10000, monthlyContribution: 500, years: 10, seed: 3 });
    expect(withC.terminal.p10).toBeGreaterThan(without.terminal.p10);
    expect(withC.terminal.p50).toBeGreaterThan(without.terminal.p50);
    expect(withC.terminal.p90).toBeGreaterThan(without.terminal.p90);
  });

  it("percentile bands are ordered", () => {
    const returns = Array.from({ length: 120 }, (_, i) => Math.sin(i) * 0.04 + 0.006);
    const r = project({ monthlyReturns: returns, initialValue: 10000, monthlyContribution: 200, years: 20, seed: 5 });
    for (let y = 1; y <= 20; y++) {
      expect(r.p10[y]).toBeLessThanOrEqual(r.p25[y]);
      expect(r.p25[y]).toBeLessThanOrEqual(r.p50[y]);
      expect(r.p50[y]).toBeLessThanOrEqual(r.p75[y]);
      expect(r.p75[y]).toBeLessThanOrEqual(r.p90[y]);
    }
  });

  it("mulberry32 produces uniform values in [0,1)", () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
