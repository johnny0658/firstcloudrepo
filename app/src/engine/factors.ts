import { ols } from "./ols";
import type { FactorMatrix, FactorTable, RegressionResult, ReturnSeries, TickerInfo } from "./types";

/** Merge FF3 + momentum monthly tables into one decimal-valued matrix. */
export function buildFactorMatrix(ff3: FactorTable, mom: FactorTable): FactorMatrix {
  const momByMonth = new Map((mom.months ?? []).map((m, i) => [m, mom.values[i][0]]));
  const col = (name: string) => ff3.columns.indexOf(name);
  const [iMkt, iSmb, iHml, iRf] = [col("MktRF"), col("SMB"), col("HML"), col("RF")];

  const out: FactorMatrix = { months: [], mktRF: [], smb: [], hml: [], mom: [], rf: [] };
  (ff3.months ?? []).forEach((m, i) => {
    const momVal = momByMonth.get(m);
    if (momVal === undefined) return;
    out.months.push(m);
    out.mktRF.push(ff3.values[i][iMkt] / 100);
    out.smb.push(ff3.values[i][iSmb] / 100);
    out.hml.push(ff3.values[i][iHml] / 100);
    out.mom.push(momVal / 100);
    out.rf.push(ff3.values[i][iRf] / 100);
  });
  return out;
}

export const MIN_REGRESSION_MONTHS = 24;
export const MAX_REGRESSION_MONTHS = 60;

/**
 * Carhart 4-factor regression of monthly excess returns. Uses at most the
 * trailing MAX_REGRESSION_MONTHS common observations; null if under the minimum.
 */
export function regressOnFactors(
  monthly: ReturnSeries,
  factors: FactorMatrix,
): RegressionResult | null {
  const idxByMonth = new Map(factors.months.map((m, i) => [m, i]));
  const y: number[] = [];
  const x: number[][] = [];
  for (let i = 0; i < monthly.labels.length; i++) {
    const fi = idxByMonth.get(monthly.labels[i]);
    if (fi === undefined) continue;
    y.push(monthly.returns[i] - factors.rf[fi]);
    x.push([factors.mktRF[fi], factors.smb[fi], factors.hml[fi], factors.mom[fi]]);
  }
  if (y.length < MIN_REGRESSION_MONTHS) return null;
  const yT = y.slice(-MAX_REGRESSION_MONTHS);
  const xT = x.slice(-MAX_REGRESSION_MONTHS);
  const fit = ols(yT, xT);
  const [alpha, mktRF, smb, hml, mom] = fit.beta;
  const [tA, tM, tS, tH, tMom] = fit.tStats;
  return {
    betas: { alpha, mktRF, smb, hml, mom },
    tStats: { alpha: tA, mktRF: tM, smb: tS, hml: tH, mom: tMom },
    r2: fit.r2,
    adjR2: fit.adjR2,
    residualStd: fit.residualStd,
    nObs: fit.n,
  };
}

/** Fallback betas when a holding has too little history to regress. */
export function defaultBetas(info: TickerInfo | undefined): RegressionResult {
  const type = info?.type ?? "stock";
  const mktRF = type === "stock" || type === "equity_etf" ? 1.0 : 0.0;
  const zero = { alpha: 0, mktRF: 0, smb: 0, hml: 0, mom: 0 };
  return {
    betas: { ...zero, mktRF },
    tStats: zero,
    r2: 0,
    adjR2: 0,
    residualStd: type === "stock" ? 0.06 : 0.02,
    nObs: 0,
  };
}

/**
 * Synthetic monthly return series from factor exposures over the full factor
 * history: r = RF + beta.F + eps. Used to bootstrap projections for young
 * portfolios. Alpha is deliberately excluded (don't project skill).
 */
export function factorMimickedReturns(
  reg: RegressionResult,
  factors: FactorMatrix,
  randomNormal: () => number,
): ReturnSeries {
  const { mktRF, smb, hml, mom } = reg.betas;
  const labels: string[] = [];
  const returns: number[] = [];
  for (let i = 0; i < factors.months.length; i++) {
    labels.push(factors.months[i]);
    returns.push(
      factors.rf[i] +
        mktRF * factors.mktRF[i] +
        smb * factors.smb[i] +
        hml * factors.hml[i] +
        mom * factors.mom[i] +
        reg.residualStd * randomNormal(),
    );
  }
  return { labels, returns };
}
