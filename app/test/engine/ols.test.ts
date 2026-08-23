import { describe, expect, it } from "vitest";
import { ols } from "../../src/engine/ols";
import fixture from "./ols.fixture.json";

describe("ols", () => {
  it("matches the numpy reference to 1e-8", () => {
    const fit = ols(fixture.y, fixture.x);
    fixture.beta.forEach((b, i) => expect(fit.beta[i]).toBeCloseTo(b, 8));
    fixture.se.forEach((s, i) => expect(fit.se[i]).toBeCloseTo(s, 8));
    fixture.t.forEach((t, i) => expect(fit.tStats[i]).toBeCloseTo(t, 6));
    expect(fit.r2).toBeCloseTo(fixture.r2, 10);
    expect(fit.adjR2).toBeCloseTo(fixture.adjR2, 10);
    expect(fit.residualStd).toBeCloseTo(fixture.residualStd, 10);
  });

  it("recovers an exact linear relationship", () => {
    const x = [[1], [2], [3], [4], [5]].map((r) => [r[0]]);
    const y = x.map((r) => 2 + 3 * r[0]);
    const fit = ols(y, x);
    expect(fit.beta[0]).toBeCloseTo(2, 10);
    expect(fit.beta[1]).toBeCloseTo(3, 10);
    expect(fit.r2).toBeCloseTo(1, 10);
  });

  it("rejects collinear regressors", () => {
    const x = [
      [1, 2],
      [2, 4],
      [3, 6],
      [4, 8],
      [5, 10],
    ];
    const y = [1, 2, 3, 4, 5];
    expect(() => ols(y, x)).toThrow();
  });
});
