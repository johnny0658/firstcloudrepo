import { useMemo, useState } from "react";
import { factorMimickedReturns } from "../../engine/factors";
import { hasEnoughHistory, mulberry32, normalFrom, project } from "../../engine/montecarlo";
import type { Portfolio, PriceSeries } from "../../engine/types";
import { FanChart } from "../charts/FanChart";
import { fmtMoney } from "../format";
import { usePortfolioAnalytics, type StaticData } from "../useAnalytics";

interface Props {
  portfolio: Portfolio;
  staticData: StaticData | null;
  prices: Map<string, PriceSeries> | null;
}

export function ProjectionsTab({ portfolio, staticData, prices }: Props) {
  const analytics = usePortfolioAnalytics(portfolio, prices, staticData);
  const [years, setYears] = useState(20);
  const [contribution, setContribution] = useState(0);

  const initialValue = analytics?.valueSeries.values.at(-1) ?? 0;

  const { result, basis } = useMemo(() => {
    if (!analytics || !staticData || initialValue <= 0) return { result: null, basis: "" };
    let monthly = analytics.monthlyReturns;
    let basisNote = `bootstrapped from your portfolio's own ${monthly.returns.length}-month history`;
    if (!hasEnoughHistory(monthly) && analytics.portfolioRegression) {
      monthly = factorMimickedReturns(
        analytics.portfolioRegression,
        staticData.factors,
        normalFrom(mulberry32(11)),
      );
      basisNote = "portfolio history is short, so paths are bootstrapped from a factor-mimicking series over the full factor history";
    }
    if (monthly.returns.length < 6) return { result: null, basis: "" };
    return {
      result: project({
        monthlyReturns: monthly.returns,
        initialValue,
        monthlyContribution: contribution,
        years,
        seed: 42,
      }),
      basis: basisNote,
    };
  }, [analytics, staticData, initialValue, years, contribution]);

  if (!staticData || !prices || !analytics) return <div className="card">Loading…</div>;
  if (initialValue <= 0)
    return (
      <div className="card">
        <div className="empty-hint">Projections need at least one priced holding (cash alone has no return history).</div>
      </div>
    );

  return (
    <div className="card">
      <h2>Monte Carlo projection</h2>
      <div className="controls">
        <label>
          Horizon: <strong>{years} years</strong>
          <input type="range" min={5} max={30} step={1} value={years} onChange={(e) => setYears(parseInt(e.target.value, 10))} style={{ width: 220 }} />
        </label>
        <label>
          Monthly contribution (USD)
          <input
            type="number"
            min="0"
            step="50"
            value={contribution || ""}
            placeholder="0"
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setContribution(Number.isFinite(v) && v > 0 ? v : 0);
            }}
          />
        </label>
      </div>
      {result ? (
        <>
          <FanChart result={result} />
          <h3>Value at year {years}</h3>
          <table className="data">
            <thead>
              <tr>
                <th>Outcome</th>
                <th className="num">Portfolio value</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Pessimistic (10th percentile)</td><td className="num">{fmtMoney(result.terminal.p10)}</td></tr>
              <tr><td>Below average (25th)</td><td className="num">{fmtMoney(result.terminal.p25)}</td></tr>
              <tr><td>Median</td><td className="num">{fmtMoney(result.terminal.p50)}</td></tr>
              <tr><td>Above average (75th)</td><td className="num">{fmtMoney(result.terminal.p75)}</td></tr>
              <tr><td>Optimistic (90th)</td><td className="num">{fmtMoney(result.terminal.p90)}</td></tr>
              <tr><td style={{ fontWeight: 600 }}>Total contributed</td><td className="num" style={{ fontWeight: 600 }}>{fmtMoney(result.totalContributed)}</td></tr>
            </tbody>
          </table>
          <div className="subtle" style={{ marginTop: 10 }}>
            2,000 simulated paths, {basis}. Six-month blocks of history are resampled so streaks and crashes carry
            through. Figures are nominal (not inflation-adjusted).
          </div>
        </>
      ) : (
        <div className="empty-hint">Not enough return history to simulate yet.</div>
      )}
    </div>
  );
}
