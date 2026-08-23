import { describe, expect, it } from "vitest";
import { buildFactorMatrix, regressOnFactors } from "../../src/engine/factors";
import { mulberry32, normalFrom } from "../../src/engine/montecarlo";
import type { FactorTable, ReturnSeries } from "../../src/engine/types";

function syntheticFactors(nMonths: number): { ff3: FactorTable; mom: FactorTable } {
  const rng = normalFrom(mulberry32(1));
  const months = Array.from({ length: nMonths }, (_, i) => {
    const y = 2018 + Math.floor(i / 12);
    return `${y}-${String((i % 12) + 1).padStart(2, "0")}`;
  });
  const ff3: FactorTable = {
    columns: ["MktRF", "SMB", "HML", "RF"],
    months,
    values: months.map(() => [rng() * 4, rng() * 2, rng() * 2, 0.3]),
  };
  const mom: FactorTable = { columns: ["MOM"], months, values: months.map(() => [rng() * 3]) };
  return { ff3, mom };
}

describe("factors", () => {
  it("recovers known betas from a noiseless synthetic asset", () => {
    const { ff3, mom } = syntheticFactors(60);
    const matrix = buildFactorMatrix(ff3, mom);
    const trueBetas = { mktRF: 1.2, smb: 0.4, hml: -0.3, mom: 0.1 };
    const asset: ReturnSeries = {
      labels: matrix.months,
      returns: matrix.months.map(
        (_, i) =>
          matrix.rf[i] +
          0.001 +
          trueBetas.mktRF * matrix.mktRF[i] +
          trueBetas.smb * matrix.smb[i] +
          trueBetas.hml * matrix.hml[i] +
          trueBetas.mom * matrix.mom[i],
      ),
    };
    const fit = regressOnFactors(asset, matrix);
    expect(fit).not.toBeNull();
    expect(fit!.betas.mktRF).toBeCloseTo(1.2, 6);
    expect(fit!.betas.smb).toBeCloseTo(0.4, 6);
    expect(fit!.betas.hml).toBeCloseTo(-0.3, 6);
    expect(fit!.betas.mom).toBeCloseTo(0.1, 6);
    expect(fit!.betas.alpha).toBeCloseTo(0.001, 6);
    expect(fit!.r2).toBeGreaterThan(0.999);
  });

  it("returns null with insufficient history", () => {
    const { ff3, mom } = syntheticFactors(12);
    const matrix = buildFactorMatrix(ff3, mom);
    const asset: ReturnSeries = { labels: matrix.months, returns: matrix.months.map(() => 0.01) };
    expect(regressOnFactors(asset, matrix)).toBeNull();
  });
});
