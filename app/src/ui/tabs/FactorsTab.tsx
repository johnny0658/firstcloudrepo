import { useMemo } from "react";
import { annualizedVol, correlationMatrix, cvar, historicalVaR, maxDrawdown, sharpe } from "../../engine/stats";
import type { Portfolio, PriceSeries } from "../../engine/types";
import { CorrHeatmap } from "../charts/CorrHeatmap";
import { HBarChart } from "../charts/HBarChart";
import { fmtNum, fmtPct, fmtSignedPct } from "../format";
import { HelpCard, HelpTip } from "../Help";
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


  const reg = analytics.portfolioRegression;

  return (
    <>
      <HelpCard title="What are 'factors', and why should I care?">
        <p>
          Decades of research found that most of any portfolio's ups and downs come from a handful of broad forces,
          called <b>factors</b> — not from clever stock picking. This tab measures how exposed <b>your</b> portfolio
          is to each of the four classic ones:
        </p>
        <ul>
          <li><b>Market</b> — the tide that lifts and sinks all stocks together. A score of 1.0 means you move one-for-one with the stock market; 0.5 means half as hard; 0 means the market barely touches you.</li>
          <li><b>Size</b> — small companies vs giant ones. Positive = you lean toward smaller companies.</li>
          <li><b>Value</b> — cheap, unglamorous stocks vs expensive growth darlings. Positive = you lean cheap; negative = you lean toward growth stocks like big tech.</li>
          <li><b>Momentum</b> — recent winners vs recent losers. Positive = you ride what's already been rising.</li>
        </ul>
        <p>
          Two summary numbers matter: <b>R²</b> says how much of your portfolio's movement these four forces explain
          (90%+ is typical for diversified funds — meaning it's mostly the tides, not the picks). <b>Alpha</b> is the
          leftover return the factors can't explain — genuine out- (or under-) performance. Alpha usually hovers near
          zero, and "not statistically significant" means the data can't tell it apart from luck.
        </p>
        <p>
          Below that, the <b>risk profile</b> measures how bumpy the ride is, and the <b>correlation grid</b> shows
          which of your holdings move together. True diversification means owning things that <b>don't</b> all fall
          on the same day — look for low or negative numbers between your holdings.
        </p>
      </HelpCard>
      <div className="card">
        <h2>Factor exposures (Carhart 4-factor)</h2>
        {reg ? (
          <>
            <div className="tiles">
              <div className="tile">
                <div className="label">Annual alpha (unexplained return)<HelpTip text="Return per year beyond what your factor exposures predict — the closest thing to measured 'skill'. Near zero is normal; 'not statistically significant' means it could easily be luck." /></div>
                <div className="value">{fmtSignedPct(reg.betas.alpha * 12)}</div>
                <div className={`delta ${Math.abs(reg.tStats.alpha) > 2 ? (reg.betas.alpha > 0 ? "good" : "bad") : ""}`}>
                  {Math.abs(reg.tStats.alpha) > 2 ? "statistically significant" : "not statistically significant"}
                </div>
              </div>
              <div className="tile">
                <div className="label">R² — explained by factors<HelpTip text="How much of your portfolio's month-to-month movement the four factors account for. High (90%+) = your returns are mostly broad market forces, not individual picks." /></div>
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
              <th className="num">Market β<HelpTip text="β (beta) = sensitivity. Market β of 1.0 moves one-for-one with the stock market; 2.0 swings twice as hard both ways; 0 ignores it. The other columns read the same way for their factor." /></th>
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
              <div className="label">Annualized volatility<HelpTip text="How bumpy the ride is: the typical size of a year's swing around the average. 10% means most years land within about ±10% of the trend. Higher = wilder." /></div>
              <div className="value">{fmtPct(risk.vol)}</div>
            </div>
            <div className="tile">
              <div className="label">Sharpe ratio<HelpTip text="Reward per unit of risk: extra return earned above safe cash, divided by the bumpiness endured to get it. Higher is better; around 0.5 is decent, 1+ is very good over long periods." /></div>
              <div className="value">{fmtNum(risk.sharpe)}</div>
            </div>
            <div className="tile">
              <div className="label">Max drawdown<HelpTip text="The deepest peak-to-bottom fall your portfolio would have suffered over the last decade. A gut-check number: could you have watched this loss without selling?" /></div>
              <div className="value">{fmtPct(risk.maxDD)}</div>
            </div>
            <div className="tile">
              <div className="label">Monthly VaR (95%)<HelpTip text="Value at Risk: in 19 months out of 20, your monthly loss stays smaller than this. CVaR is the average loss in that worst 1-in-20 month — how bad 'bad' typically gets." /></div>
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
