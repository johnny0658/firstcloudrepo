import { useMemo, useState } from "react";
import { factorMimickedReturns } from "../../engine/factors";
import { hasEnoughHistory, mulberry32, normalFrom, project } from "../../engine/montecarlo";
import type { Portfolio, PriceSeries } from "../../engine/types";
import { FanChart } from "../charts/FanChart";
import { fmtMoney } from "../format";
import { HelpCard, HelpTip } from "../Help";
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
  if (analytics.shortsTooLarge)
    return (
      <div className="card">
        <div className="error-box">
          Your short positions are as large as (or larger than) your long holdings at some point in the last ten
          years, so portfolio return math breaks down and this analysis can't run. Reduce the short sizes to
          analyze the rest.
        </div>
      </div>
    );

  if (initialValue <= 0)
    return (
      <div className="card">
        <div className="empty-hint">Projections need at least one priced holding (cash alone has no return history).</div>
      </div>
    );

  return (
    <div>
      <HelpCard title="How can anyone project the future?">
        <p>
          Nobody can predict markets — so instead of one prediction, this makes <b>2,000 of them</b>. Each simulated
          future is built by reshuffling stretches of your portfolio's own past ten years: some futures happen to
          replay mostly good stretches, others string bad ones together. This technique is called a{" "}
          <b>Monte Carlo simulation</b> (named after the casino — it's built on rolling dice many times).
        </p>
        <p>
          The chart summarizes all 2,000 futures at once. The <b>solid line is the median</b>: half the simulated
          futures ended above it, half below. The shaded bands show the range —{" "}
          <b>the bottom edge is a genuinely unlucky decade (only 1 future in 10 was worse)</b>, the top edge a lucky
          one (1 in 10 was better). The fan widens over time because uncertainty compounds: the further out you look,
          the less anyone knows.
        </p>
        <p>
          Add a <b>monthly contribution</b> to see what steady saving does — over long horizons it often matters as
          much as the market itself. Figures are in today's-style dollars <b>without</b> subtracting future inflation,
          and history is no guarantee: the next ten years may be unlike the last ten.
        </p>
      </HelpCard>
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
              <tr><td>Pessimistic (10th percentile)<HelpTip text="Only 1 in 10 simulated futures ended up worse than this. Think of it as a genuinely unlucky outcome, not the worst case imaginable." /></td><td className="num">{fmtMoney(result.terminal.p10)}</td></tr>
              <tr><td>Below average (25th)</td><td className="num">{fmtMoney(result.terminal.p25)}</td></tr>
              <tr><td>Median<HelpTip text="The middle outcome: half the 2,000 simulated futures ended above this value, half below." /></td><td className="num">{fmtMoney(result.terminal.p50)}</td></tr>
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
    </div>
  );
}
