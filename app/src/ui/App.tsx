import { useEffect, useState } from "react";
import { loadAiSettings, type AiSettings } from "../ai/settings";
import { loadPortfolio, savePortfolio } from "../state/portfolio";
import type { Portfolio } from "../engine/types";
import { AiSettingsCard } from "./AiSettingsCard";
import { usePrices, useStaticData } from "./useAnalytics";
import { PortfolioTab } from "./tabs/PortfolioTab";
import { ScenariosTab } from "./tabs/ScenariosTab";
import { ProjectionsTab } from "./tabs/ProjectionsTab";
import { FactorsTab } from "./tabs/FactorsTab";
import { ImportTab } from "./tabs/ImportTab";
import { ReportTab } from "./tabs/ReportTab";

const TABS = ["Portfolio", "Import", "Scenarios", "Projections", "Factors", "Report"] as const;
type Tab = (typeof TABS)[number];

/** Tabs that need holdings before they can show anything useful. Import is
 * deliberately exempt — it exists to fill an empty portfolio. */
const NEEDS_HOLDINGS: ReadonlySet<Tab> = new Set(["Scenarios", "Projections", "Factors", "Report"]);

export function App() {
  const [tab, setTab] = useState<Tab>("Portfolio");
  const [portfolio, setPortfolio] = useState<Portfolio>(loadPortfolio);
  const [aiSettings, setAiSettings] = useState<AiSettings>(loadAiSettings);
  const { data: staticData, error } = useStaticData();
  const prices = usePrices(portfolio.holdings.map((h) => h.symbol));

  useEffect(() => savePortfolio(portfolio), [portfolio]);

  const hasHoldings = portfolio.holdings.length > 0 || portfolio.cash > 0;
  const gated = NEEDS_HOLDINGS.has(tab) && !hasHoldings;

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
      {(tab === "Import" || tab === "Report") && (
        <AiSettingsCard settings={aiSettings} setSettings={setAiSettings} />
      )}
      {gated ? (
        <div className="card">
          <div className="empty-hint">
            Enter your holdings in the Portfolio tab first — or upload a broker statement in the Import tab.
          </div>
        </div>
      ) : (
        <>
          {tab === "Portfolio" && (
            <PortfolioTab portfolio={portfolio} setPortfolio={setPortfolio} staticData={staticData} prices={prices} />
          )}
          {tab === "Import" && (
            <ImportTab portfolio={portfolio} setPortfolio={setPortfolio} staticData={staticData} settings={aiSettings} />
          )}
          {tab === "Scenarios" && <ScenariosTab portfolio={portfolio} staticData={staticData} prices={prices} />}
          {tab === "Projections" && <ProjectionsTab portfolio={portfolio} staticData={staticData} prices={prices} />}
          {tab === "Factors" && <FactorsTab portfolio={portfolio} staticData={staticData} prices={prices} />}
          {tab === "Report" && (
            <ReportTab portfolio={portfolio} staticData={staticData} prices={prices} settings={aiSettings} />
          )}
        </>
      )}
      <footer className="disclaimer">
        Estimates from historical data and simplified models — not investment advice. Scenario and projection figures
        are illustrative; past performance does not predict future results. Your portfolio is stored only in this
        browser and never uploaded.
      </footer>
    </>
  );
}
