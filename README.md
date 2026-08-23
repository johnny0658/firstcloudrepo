# Portfolio Simulator

A personal portfolio analysis tool hosted entirely on GitHub — no servers, no
database, no API keys. Enter your US-listed holdings and cash in the web UI to
get scenario stress-tests, Monte Carlo projections, factor analysis, and risk
statistics.

**Live app:** https://johnny0658.github.io/firstcloudrepo/

## How it works

| Piece | Where it lives |
|---|---|
| Web UI (React + TypeScript) | `app/`, deployed to GitHub Pages |
| Analytics engine (pure TS, unit-tested) | `app/src/engine/` |
| Market data (~10y daily adjusted closes + Fama-French factors) | JSON files in `data/`, committed by a nightly GitHub Action |
| Data pipeline (Python) | `pipeline/`, run by `.github/workflows/data-refresh.yml` |

Your portfolio is stored **only in your browser** (localStorage), with JSON
export/import. It is never committed to this repo or uploaded anywhere. The
browser only reads the public market-data JSON served by GitHub Pages.

Prices come from Stooq (free, no key; yfinance as fallback), factors from the
Ken French Data Library. Data refreshes nightly on trading days at ~06:20 UTC;
factor data is published with a 1–2 month lag, which the UI notes.

## Adding a ticker

The nightly job only fetches tickers listed in `data/tickers.json`. To track a
new one:

1. Edit `data/tickers.json` in the GitHub web UI and add a line, e.g.
   `{"symbol": "SHOP", "name": "Shopify", "type": "stock"}` — types are
   `stock`, `equity_etf`, `bond_etf` (add `"duration": <years>` for bond ETFs),
   or `commodity_etf`.
2. Go to **Actions → Data Refresh → Run workflow**, optionally entering just
   that ticker. When it finishes, reload the app.

## Analyses

- **Scenarios** — replay historical episodes (2008 GFC, COVID crash, 2022 rate
  shock, dot-com bust, Q4 2018). Holdings that existed through an episode use
  their actual returns; younger holdings are estimated from factor exposures
  (equities) or rate duration (bond funds), and marked as estimates. A
  hypothetical-shock tool applies equity moves scaled by each holding's market
  beta and rate moves scaled by bond-fund duration.
- **Projections** — block-bootstrap Monte Carlo (2,000 paths) of your
  portfolio's own monthly return history, with optional monthly contributions;
  10/25/50/75/90th-percentile fan chart.
- **Factors** — Carhart 4-factor regression (market, size, value, momentum) of
  portfolio and per-holding returns: betas, alpha, R².
- **Risk** — annualized volatility, Sharpe, max drawdown, monthly VaR/CVaR,
  correlation heatmap.

## Development

```bash
cd app
npm install
npm run dev        # serves ../data at /data automatically
npm test           # engine unit tests (vitest)
npm run typecheck
```

Pipeline scripts run in GitHub Actions but work anywhere with open internet:
`cd pipeline && python fetch_prices.py && python fetch_factors.py && python compute_episodes.py && python validate.py`.

## Maintenance notes

- The nightly workflow commits only when data actually changed; a failed fetch
  leaves yesterday's files in place, and per-ticker failures are surfaced in
  the app's header banner.
- GitHub disables scheduled workflows after ~60 days without repo activity;
  the nightly data commits normally keep it active, but if the schedule stops,
  re-enable it from the Actions tab.
- Estimates only — not investment advice.
