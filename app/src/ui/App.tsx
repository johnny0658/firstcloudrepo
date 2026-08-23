import { useEffect, useState } from "react";
import { loadPortfolio, savePortfolio } from "../state/portfolio";
import type { Portfolio } from "../engine/types";
import { usePrices, useStaticData } from "./useAnalytics";
import { PortfolioTab } from "./tabs/PortfolioTab";
import { ScenariosTab } from "./tabs/ScenariosTab";
import { ProjectionsTab } from "./tabs/ProjectionsTab";
import { FactorsTab } from "./tabs/FactorsTab";

const TABS = ["Portfolio", "Scenarios", "Projections", "Factors"] as const;
type Tab = (typeof TABS)[number];

export function App() {
  const [tab, setTab] = useState<Tab>("Portfolio");
  const [portfolio, setPortfolio] = useState<Portfolio>(loadPortfolio);
  const { data: staticData, error } = useStaticData();
  const prices = usePrices(portfolio.holdings.map((h) => h.symbol));

  useEffect(() => savePortfolio(portfolio), [portfolio]);

  const hasHoldings = portfolio.holdings.length > 0 || portfolio.cash > 0;

  return (
    <>
      <header className="app">
        <h1>Portfolio Simulator</h1>
        <div className="data-banner">
          {staticData ? (
            <>
              Market data as of {staticData.meta.lastUpdated.slice(0, 10)} · factors through{" "}
              {staticData.meta.factorLastMonth ?? "n/a"} (published with a 1–2 month lag)
              {staticData.meta.failures.length > 0 && (
                <span className="warn"> · {staticData.meta.failures.length} tickers failed last refresh</span>
              )}
            </>
          ) : error ? (
            <span className="warn">Market data unavailable: {error}. Run the Data Refresh workflow once, then reload.</span>
          ) : (
            "Loading market data…"
          )}
        </div>
      </header>
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t} className={t === tab ? "active" : ""} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>
      {tab === "Portfolio" && (
        <PortfolioTab portfolio={portfolio} setPortfolio={setPortfolio} staticData={staticData} prices={prices} />
      )}
      {tab !== "Portfolio" && !hasHoldings && (
        <div className="card">
          <div className="empty-hint">Enter your holdings in the Portfolio tab first.</div>
        </div>
      )}
      {hasHoldings && tab === "Scenarios" && <ScenariosTab portfolio={portfolio} staticData={staticData} prices={prices} />}
      {hasHoldings && tab === "Projections" && <ProjectionsTab portfolio={portfolio} staticData={staticData} prices={prices} />}
      {hasHoldings && tab === "Factors" && <FactorsTab portfolio={portfolio} staticData={staticData} prices={prices} />}
      <footer className="disclaimer">
        Estimates from historical data and simplified models — not investment advice. Scenario and projection figures
        are illustrative; past performance does not predict future results. Your portfolio is stored only in this
        browser and never uploaded.
      </footer>
    </>
  );
}
