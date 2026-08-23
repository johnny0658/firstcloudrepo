import { useMemo, useRef, useState } from "react";
import { lastClose } from "../../engine/returns";
import type { Portfolio, PriceSeries } from "../../engine/types";
import { exportPortfolio, importPortfolio } from "../../state/portfolio";
import { fmtMoneyFull, fmtPct } from "../format";
import { HelpCard, HelpTip } from "../Help";
import type { StaticData } from "../useAnalytics";

const ADD_TICKER_URL = "https://github.com/johnny0658/firstcloudrepo#adding-a-ticker";

interface Props {
  portfolio: Portfolio;
  setPortfolio: (p: Portfolio) => void;
  staticData: StaticData | null;
  prices: Map<string, PriceSeries> | null;
}

export function PortfolioTab({ portfolio, setPortfolio, staticData, prices }: Props) {
  const [symbol, setSymbol] = useState("");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"shares" | "dollars">("shares");
  const [cashInput, setCashInput] = useState(String(portfolio.cash || ""));
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const universe = useMemo(() => (staticData ? [...staticData.tickerInfo.values()] : []), [staticData]);
  const query = symbol.trim().toUpperCase();
  const suggestions = useMemo(
    () =>
      query
        ? universe
            .filter((t) => t.symbol.startsWith(query) || t.name.toUpperCase().includes(query))
            .slice(0, 8)
        : [],
    [query, universe],
  );

  const addHolding = () => {
    setMessage(null);
    const qty = parseFloat(amount);
    if (!query || !Number.isFinite(qty) || qty <= 0) {
      setMessage("Enter a ticker and a positive amount.");
      return;
    }
    if (staticData && !staticData.tickerInfo.has(query)) {
      setMessage(
        `${query} isn't tracked yet. Add it to data/tickers.json in the repo and run the Data Refresh workflow — see the README for the two-step guide.`,
      );
      return;
    }
    let shares = qty;
    if (mode === "dollars") {
      const series = prices?.get(query);
      const close = series ? lastClose(series) : null;
      if (!close) {
        setMessage(`No price data loaded for ${query} yet — enter shares instead, or retry in a moment.`);
        return;
      }
      shares = qty / close;
    }
    const existing = portfolio.holdings.find((h) => h.symbol === query);
    const holdings = existing
      ? portfolio.holdings.map((h) => (h.symbol === query ? { ...h, shares: h.shares + shares } : h))
      : [...portfolio.holdings, { symbol: query, shares }];
    setPortfolio({ ...portfolio, holdings });
    setSymbol("");
    setAmount("");
  };

  const rows = useMemo(() => {
    const out = portfolio.holdings.map((h) => {
      const series = prices?.get(h.symbol);
      const value = series ? h.shares * lastClose(series) : null;
      return { ...h, value, name: staticData?.tickerInfo.get(h.symbol)?.name ?? "" };
    });
    return out;
  }, [portfolio, prices, staticData]);

  const totalValue = rows.reduce((a, r) => a + (r.value ?? 0), 0) + portfolio.cash;

  return (
    <>
      <HelpCard title="New here? How this app works">
        <p>
          This is a <b>portfolio simulator</b>: you tell it what investments you own, and it uses ten years of real
          market history to answer three questions — <b>how would my portfolio have survived past crises?</b> (Scenarios),{" "}
          <b>where might it be in 5–30 years?</b> (Projections), and <b>what actually drives its ups and downs?</b> (Factors).
        </p>
        <p>
          Start by adding each investment below. A <b>ticker</b> is just the short code an investment trades under —
          AAPL is Apple stock, VOO is a fund holding the 500 biggest US companies, BND is a fund holding bonds
          (loans to governments and companies that pay interest). Enter how many <b>shares</b> you own, or switch to{" "}
          <b>dollars</b> and the app converts at the latest price. Add any uninvested <b>cash</b> too, so the analysis
          sees your full picture.
        </p>
        <p>
          <b>Privacy:</b> your portfolio never leaves this browser — it is saved only on this device. Use Export JSON
          to back it up or move it to another device. Market prices are refreshed automatically every trading night.
        </p>
      </HelpCard>
      <div className="card">
        <h2>Add a holding</h2>
        <div className="controls">
          <label>
            Ticker
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="e.g. VOO"
              list="ticker-suggestions"
              onKeyDown={(e) => e.key === "Enter" && addHolding()}
            />
            <datalist id="ticker-suggestions">
              {suggestions.map((t) => (
                <option key={t.symbol} value={t.symbol}>
                  {t.name}
                </option>
              ))}
            </datalist>
          </label>
          <label>
            {mode === "shares" ? "Shares" : "Dollar amount"}
            <input
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addHolding()}
            />
          </label>
          <label>
            Input as
            <select value={mode} onChange={(e) => setMode(e.target.value as "shares" | "dollars")}>
              <option value="shares">Shares</option>
              <option value="dollars">Dollars</option>
            </select>
          </label>
          <button className="action primary" onClick={addHolding}>
            Add
          </button>
        </div>
        <div className="controls">
          <label>
            Cash (USD)
            <input
              type="number"
              min="0"
              step="any"
              value={cashInput}
              onChange={(e) => {
                setCashInput(e.target.value);
                const v = parseFloat(e.target.value);
                setPortfolio({ ...portfolio, cash: Number.isFinite(v) && v > 0 ? v : 0 });
              }}
            />
          </label>
          <button className="action" onClick={() => exportPortfolio(portfolio)}>
            Export JSON
          </button>
          <button className="action" onClick={() => fileRef.current?.click()}>
            Import JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const imported = await importPortfolio(file);
                setPortfolio(imported);
                setCashInput(String(imported.cash || ""));
                setMessage(null);
              } catch {
                setMessage("That file doesn't look like a portfolio export.");
              }
              e.target.value = "";
            }}
          />
        </div>
        {message && <div className="error-box">{message} {message.includes("tracked") && (<a href={ADD_TICKER_URL} target="_blank" rel="noreferrer">Instructions</a>)}</div>}
        <div className="subtle">
          Holdings are saved in this browser only (and in your exported JSON) — nothing is uploaded anywhere.
        </div>
      </div>

      <div className="card">
        <h2>Current portfolio</h2>
        {rows.length === 0 && portfolio.cash === 0 ? (
          <div className="empty-hint">No holdings yet — add tickers above, e.g. VOO, AAPL, BND, plus any cash.</div>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Name</th>
                <th className="num">Shares</th>
                <th className="num">Value</th>
                <th className="num">Weight<HelpTip text="What share of your total portfolio this holding makes up. Big weights mean this one investment moves your whole portfolio." /></th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.symbol}>
                  <td>{r.symbol}</td>
                  <td className="subtle">{r.name}</td>
                  <td className="num">{r.shares.toLocaleString("en-US", { maximumFractionDigits: 4 })}</td>
                  <td className="num">{r.value === null ? "…" : fmtMoneyFull(r.value)}</td>
                  <td className="num">{r.value === null || totalValue === 0 ? "…" : fmtPct(r.value / totalValue)}</td>
                  <td className="num">
                    <button
                      className="link"
                      onClick={() =>
                        setPortfolio({ ...portfolio, holdings: portfolio.holdings.filter((h) => h.symbol !== r.symbol) })
                      }
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {portfolio.cash > 0 && (
                <tr>
                  <td>Cash</td>
                  <td className="subtle">US Dollars</td>
                  <td className="num">—</td>
                  <td className="num">{fmtMoneyFull(portfolio.cash)}</td>
                  <td className="num">{totalValue === 0 ? "…" : fmtPct(portfolio.cash / totalValue)}</td>
                  <td />
                </tr>
              )}
              <tr>
                <td colSpan={3} style={{ fontWeight: 600 }}>
                  Total
                </td>
                <td className="num" style={{ fontWeight: 600 }}>
                  {fmtMoneyFull(totalValue)}
                </td>
                <td className="num">100%</td>
                <td />
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
