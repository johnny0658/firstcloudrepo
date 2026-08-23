import { useMemo, useState } from "react";
import { runEpisode, runHypothetical, type ScenarioResult } from "../../engine/scenarios";
import type { Portfolio, PriceSeries } from "../../engine/types";
import { HBarChart } from "../charts/HBarChart";
import { fmtMoney, fmtSignedPct } from "../format";
import { usePortfolioAnalytics, type StaticData } from "../useAnalytics";

interface Props {
  portfolio: Portfolio;
  staticData: StaticData | null;
  prices: Map<string, PriceSeries> | null;
}

const METHOD_LABEL: Record<string, string> = {
  replay: "actual history",
  factor: "estimated (factor model)",
  duration: "estimated (rate duration)",
  cash: "cash",
};

function ResultView({ result }: { result: ScenarioResult }) {
  const pnlClass = result.portfolioPnL >= 0 ? "good" : "bad";
  return (
    <>
      <div className="tiles">
        <div className="tile">
          <div className="label">Portfolio impact</div>
          <div className="value">{fmtSignedPct(result.portfolioReturnPct)}</div>
          <div className={`delta ${pnlClass}`}>{fmtMoney(result.portfolioPnL)} on {fmtMoney(result.startValue)}</div>
        </div>
        <div className="tile">
          <div className="label">Value after scenario</div>
          <div className="value">{fmtMoney(result.startValue + result.portfolioPnL)}</div>
        </div>
      </div>
      <h3>Impact by holding</h3>
      <HBarChart
        data={[...result.holdings]
          .sort((a, b) => a.dollarPnL - b.dollarPnL)
          .map((h) => ({
            label: h.symbol,
            value: h.dollarPnL,
            display: `${fmtMoney(h.dollarPnL)} (${fmtSignedPct(h.returnPct)})`,
          }))}
      />
      <h3>Detail</h3>
      <table className="data">
        <thead>
          <tr>
            <th>Holding</th>
            <th className="num">Return</th>
            <th className="num">P&L</th>
            <th>Basis</th>
          </tr>
        </thead>
        <tbody>
          {result.holdings.map((h) => (
            <tr key={h.symbol}>
              <td>{h.symbol}</td>
              <td className="num">{fmtSignedPct(h.returnPct)}</td>
              <td className="num">{fmtMoney(h.dollarPnL)}</td>
              <td>
                <span className={`badge ${h.method === "replay" || h.method === "cash" ? "" : "est"}`}>
                  {METHOD_LABEL[h.method]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function ScenariosTab({ portfolio, staticData, prices }: Props) {
  const analytics = usePortfolioAnalytics(portfolio, prices, staticData);
  const [episodeId, setEpisodeId] = useState<string | null>(null);
  const [equityShock, setEquityShock] = useState(-20);
  const [rateShock, setRateShock] = useState(100);

  const episodes = staticData?.episodes ?? [];
  const selected = episodes.find((e) => e.id === episodeId) ?? episodes[0];

  const inputs = useMemo(() => {
    if (!prices || !staticData || !analytics) return null;
    return {
      portfolio,
      prices,
      tickerInfo: staticData.tickerInfo,
      regressions: analytics.scenarioRegressions,
    };
  }, [portfolio, prices, staticData, analytics]);

  const episodeResult = useMemo(
    () => (inputs && selected ? runEpisode(inputs, selected) : null),
    [inputs, selected],
  );
  const hypoResult = useMemo(
    () => (inputs ? runHypothetical(inputs, equityShock, rateShock) : null),
    [inputs, equityShock, rateShock],
  );

  if (!staticData || !prices) return <div className="card">Loading…</div>;

  return (
    <>
      <div className="card">
        <h2>Historical episode</h2>
        <div className="controls">
          <label>
            Episode
            <select value={selected?.id ?? ""} onChange={(e) => setEpisodeId(e.target.value)}>
              {episodes.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {selected && <div className="subtle" style={{ marginBottom: 12 }}>{selected.start} → {selected.end}. {selected.notes}</div>}
        {episodeResult ? <ResultView result={episodeResult} /> : <div className="empty-hint">Computing…</div>}
        <div className="subtle" style={{ marginTop: 10 }}>
          Holdings whose price history covers the episode use their actual returns; younger holdings are estimated from
          their factor exposures (equities) or rate duration (bond funds), marked "estimated".
        </div>
      </div>

      <div className="card">
        <h2>Hypothetical shock</h2>
        <div className="controls">
          <label>
            Equity market move: <strong>{equityShock > 0 ? "+" : ""}{equityShock}%</strong>
            <input
              type="range"
              min={-50}
              max={30}
              step={5}
              value={equityShock}
              onChange={(e) => setEquityShock(parseInt(e.target.value, 10))}
              style={{ width: 220 }}
            />
          </label>
          <label>
            Interest rate move: <strong>{rateShock > 0 ? "+" : ""}{rateShock} bps</strong>
            <input
              type="range"
              min={-300}
              max={400}
              step={25}
              value={rateShock}
              onChange={(e) => setRateShock(parseInt(e.target.value, 10))}
              style={{ width: 220 }}
            />
          </label>
        </div>
        {hypoResult && <ResultView result={hypoResult} />}
        <div className="subtle" style={{ marginTop: 10 }}>
          Equities move by their market beta times the equity shock; bond funds by −duration × rate move; cash is flat.
        </div>
      </div>
    </>
  );
}
