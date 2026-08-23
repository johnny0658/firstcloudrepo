import { useMemo } from "react";
import { annualizedVol, correlationMatrix, cvar, historicalVaR, maxDrawdown, sharpe } from "../../engine/stats";
import type { Portfolio, PriceSeries } from "../../engine/types";
import { CorrHeatmap } from "../charts/CorrHeatmap";
import { HBarChart } from "../charts/HBarChart";
import { fmtNum, fmtPct, fmtSignedPct } from "../format";
import { usePortfolioAnalytics, type StaticData } from "../useAnalytics";

interface Props {
  portfolio: Portfolio;
  staticData: StaticData | null;
  prices: Map<string, PriceSeries> | null;
}

const FACTOR_NAMES: Array<{ key: "mktRF" | "smb" | "hml" | "mom"; label: string; desc: string }> = [
  { key: "mktRF", label: "Market", desc: "moves with the overall stock market" },
  { key: "smb", label: "Size", desc: "tilt toward small (+) vs large (−) companies" },
  { key: "hml", label: "Value", desc: "tilt toward value (+) vs growth (−) stocks" },
  { key: "mom", label: "Momentum", desc: "tilt toward recent winners (+) vs losers (−)" },
];

export function FactorsTab({ portfolio, staticData, prices }: Props) {
  const analytics = usePortfolioAnalytics(portfolio, prices, staticData);

  const risk = useMemo(() => {
    if (!analytics || !staticData || analytics.monthlyReturns.returns.length < 6) return null;
    const monthly = analytics.monthlyReturns;
    const rfByMonth = new Map(staticData.factors.months.map((m, i) => [m, staticData.factors.rf[i]]));
    const rf = monthly.labels.map((m) => rfByMonth.get(m) ?? 0);
    return {
      vol: annualizedVol(monthly.returns),
      sharpe: sharpe(monthly.returns, rf),
      maxDD: maxDrawdown(analytics.valueSeries.values),
      var95: historicalVaR(monthly.returns),
      cvar95: cvar(monthly.returns),
      months: monthly.returns.length,
    };
  }, [analytics, staticData]);

  const corrDaily = useMemo(() => {
    if (!prices || !analytics) return null;
    const labels = portfolio.holdings.map((h) => h.symbol).filter((s) => prices.has(s));
    if (labels.length < 2) return null;
    const seriesList = labels.map((s) => {
      const p = prices.get(s)!;
      const rets = [];
      const labs = [];
      for (let i = 1; i < p.dates.length; i++) {
        labs.push(p.dates[i]);
        rets.push(p.adjClose[i] / p.adjClose[i - 1] - 1);
      }
      return { labels: labs, returns: rets };
    });
    return { labels, matrix: correlationMatrix(seriesList) };
  }, [prices, analytics, portfolio]);

  if (!staticData || !prices || !analytics) return <div className="card">Loading…</div>;

  const reg = analytics.portfolioRegression;

  return (
    <>
      <div className="card">
        <h2>Factor exposures (Carhart 4-factor)</h2>
        {reg ? (
          <>
            <div className="tiles">
              <div className="tile">
                <div className="label">Annual alpha (unexplained return)</div>
                <div className="value">{fmtSignedPct(reg.betas.alpha * 12)}</div>
                <div className={`delta ${Math.abs(reg.tStats.alpha) > 2 ? (reg.betas.alpha > 0 ? "good" : "bad") : ""}`}>
                  {Math.abs(reg.tStats.alpha) > 2 ? "statistically significant" : "not statistically significant"}
                </div>
              </div>
              <div className="tile">
                <div className="label">R² — explained by factors</div>
                <div className="value">{fmtPct(reg.r2, 0)}</div>
                <div className="delta">{reg.nObs} months of data</div>
              </div>
            </div>
            <HBarChart
              data={FACTOR_NAMES.map((f) => ({
                label: f.label,
                value: reg.betas[f.key],
                display: `${fmtNum(reg.betas[f.key])}${Math.abs(reg.tStats[f.key]) > 2 ? "" : " (n.s.)"}`,
              }))}
            />
            <div className="subtle">
              Bars are regression betas of your portfolio's monthly excess returns on the Fama-French/Carhart factors.
              "n.s." = not statistically significant (|t| ≤ 2). Market: {FACTOR_NAMES[0].desc}; Size: {FACTOR_NAMES[1].desc};
              Value: {FACTOR_NAMES[2].desc}; Momentum: {FACTOR_NAMES[3].desc}.
            </div>
          </>
        ) : (
          <div className="empty-hint">
            Not enough overlapping history for a factor regression (needs 24+ months).
          </div>
        )}

        <h3>Per-holding betas</h3>
        <table className="data">
          <thead>
            <tr>
              <th>Holding</th>
              <th className="num">Market β</th>
              <th className="num">Size β</th>
              <th className="num">Value β</th>
              <th className="num">Momentum β</th>
              <th className="num">R²</th>
            </tr>
          </thead>
          <tbody>
            {portfolio.holdings.map((h) => {
              const r = analytics.regressions.get(h.symbol);
              return (
                <tr key={h.symbol}>
                  <td>{h.symbol}</td>
                  {r ? (
                    <>
                      <td className="num">{fmtNum(r.betas.mktRF)}</td>
                      <td className="num">{fmtNum(r.betas.smb)}</td>
                      <td className="num">{fmtNum(r.betas.hml)}</td>
                      <td className="num">{fmtNum(r.betas.mom)}</td>
                      <td className="num">{fmtPct(r.r2, 0)}</td>
                    </>
                  ) : (
                    <td className="subtle" colSpan={5}>insufficient history</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Risk profile</h2>
        {risk ? (
          <div className="tiles">
            <div className="tile">
              <div className="label">Annualized volatility</div>
              <div className="value">{fmtPct(risk.vol)}</div>
            </div>
            <div className="tile">
              <div className="label">Sharpe ratio</div>
              <div className="value">{fmtNum(risk.sharpe)}</div>
            </div>
            <div className="tile">
              <div className="label">Max drawdown</div>
              <div className="value">{fmtPct(risk.maxDD)}</div>
            </div>
            <div className="tile">
              <div className="label">Monthly VaR (95%)</div>
              <div className="value">{fmtPct(risk.var95)}</div>
              <div className="delta">CVaR {fmtPct(risk.cvar95)}</div>
            </div>
          </div>
        ) : (
          <div className="empty-hint">Not enough history for risk statistics.</div>
        )}
        {corrDaily && (
          <>
            <h3>Correlation between holdings (daily returns)</h3>
            <CorrHeatmap labels={corrDaily.labels} matrix={corrDaily.matrix} />
            <div className="subtle" style={{ marginTop: 8 }}>
              1.0 = moves in lockstep; 0 = unrelated; negative = moves opposite. Diversification comes from low or
              negative correlations. "–" = under 60 overlapping trading days.
            </div>
          </>
        )}
      </div>
    </>
  );
}
