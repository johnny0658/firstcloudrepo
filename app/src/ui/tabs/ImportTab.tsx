import { useMemo, useRef, useState } from "react";
import { aiErrorMessage, chatJson } from "../../ai/client";
import { validateStatement, type ParsedStatement } from "../../ai/importSchema";
import { buildImportUserPrompt, IMPORT_SYSTEM_PROMPT } from "../../ai/prompts";
import type { AiSettings } from "../../ai/settings";
import { loadFx, loadPrices, type FxTable } from "../../data/loader";
import { lastClose } from "../../engine/returns";
import type { Portfolio, PriceSeries } from "../../engine/types";
import { mergePortfolio, type ApplyMode } from "../../state/merge";
import { fmtMoneyFull } from "../format";
import { HelpCard } from "../Help";
import type { StaticData } from "../useAnalytics";

const ADD_TICKER_URL = "https://github.com/johnny0658/firstcloudrepo#adding-a-ticker";

type Stage =
  | { kind: "idle" }
  | { kind: "extracting" }
  | { kind: "asking" }
  | {
      kind: "review";
      statement: ParsedStatement;
      prices: Map<string, PriceSeries>;
      dropNote: string | null;
      cashNotes: string[];
    }
  | { kind: "applied"; summary: string }
  | { kind: "error"; message: string };

/** USD value of an amount in `currency`, or null when no rate is available. */
function toUsd(amount: number, currency: string, fx: FxTable | null): number | null {
  if (currency === "USD") return amount;
  const rate = fx?.usdPerUnit[currency];
  return rate ? amount * rate : null;
}

interface ReviewRow {
  symbol: string;
  description: string;
  shares: number | null; // resolved shares (from quantity or value conversion)
  fromValue: boolean; // shares derived from marketValue at latest close
  tracked: boolean;
  included: boolean;
}

interface Props {
  portfolio: Portfolio;
  setPortfolio: (p: Portfolio) => void;
  staticData: StaticData | null;
  settings: AiSettings;
}

export function ImportTab({ portfolio, setPortfolio, staticData, settings }: Props) {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [cash, setCash] = useState(0);
  const [mode, setMode] = useState<ApplyMode>("replace");
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File) => {
    setStage({ kind: "extracting" });
    try {
      const { extractPdfText } = await import("../../ai/pdfText");
      const extracted = await extractPdfText(file);
      setStage({ kind: "asking" });
      const raw = await chatJson(settings, [
        { role: "system", content: IMPORT_SYSTEM_PROMPT },
        { role: "user", content: buildImportUserPrompt(extracted.text) },
      ]);
      const statement = validateStatement(raw);
      const symbols = statement.holdings.map((h) => h.symbol);
      const [prices, fx] = await Promise.all([loadPrices(symbols), loadFx()]);

      const reviewRows: ReviewRow[] = statement.holdings.map((h) => {
        const series = prices.get(h.symbol);
        const tracked = Boolean(staticData?.tickerInfo.has(h.symbol) && series);
        let shares = h.quantity;
        let fromValue = false;
        if (shares === null && h.marketValue !== null && series) {
          const usdValue = toUsd(h.marketValue, h.currency, fx);
          if (usdValue !== null) {
            shares = usdValue / lastClose(series);
            fromValue = true;
          } else {
            statement.warnings.push(
              `${h.symbol}: value is in ${h.currency} but no exchange rate is available — enter shares manually.`,
            );
          }
        }
        return {
          symbol: h.symbol,
          description: h.description,
          shares,
          fromValue,
          tracked,
          included: tracked && shares !== null && shares !== 0,
        };
      });

      // itemized cash: convert every component (settled cash, cash funds…)
      let cashUsd = 0;
      const cashNotes: string[] = [];
      for (const item of statement.cashItems) {
        const converted = toUsd(item.amount, item.currency, fx);
        if (converted !== null) {
          cashUsd += converted;
          cashNotes.push(
            item.currency === "USD"
              ? `${item.description}: $${item.amount.toLocaleString("en-US")}`
              : `${item.description}: ${item.amount.toLocaleString("en-US")} ${item.currency} → $${(Math.round(converted * 100) / 100).toLocaleString("en-US")} at ${fx!.usdPerUnit[item.currency]} USD/${item.currency} (rate as of ${fx!.asOf})`,
          );
        } else {
          cashNotes.push(
            `${item.description}: ${item.amount.toLocaleString("en-US")} ${item.currency} — no exchange rate available, NOT included; add its USD value to the cash field manually.`,
          );
        }
      }
      cashUsd = Math.round(cashUsd * 100) / 100;

      setRows(reviewRows);
      setCash(cashUsd);
      setStage({
        kind: "review",
        statement,
        prices,
        cashNotes,
        dropNote:
          extracted.droppedPages.length > 0
            ? `Pages ${extracted.droppedPages.join(", ")} were omitted to fit the model's limit (they looked like transaction history, not holdings).`
            : null,
      });
    } catch (err) {
      setStage({ kind: "error", message: aiErrorMessage(err) });
    }
  };

  const included = rows.filter((r) => r.included && r.shares !== null && r.shares !== 0);
  const existingBySymbol = useMemo(
    () => new Map(portfolio.holdings.map((h) => [h.symbol, h.shares])),
    [portfolio],
  );

  const apply = () => {
    const imported: Portfolio = {
      holdings: included.map((r) => ({ symbol: r.symbol, shares: r.shares! })),
      cash,
    };
    const next = mergePortfolio(portfolio, imported, mode);
    setPortfolio(next);
    setStage({
      kind: "applied",
      summary: `${mode === "replace" ? "Replaced portfolio with" : "Merged in"} ${included.length} holdings and ${fmtMoneyFull(cash)} cash.`,
    });
    setRows([]);
  };

  return (
    <>
      <HelpCard title="How statement import works">
        <p>
          Instead of typing each holding, upload the <b>PDF statement</b> your broker gives you. The app reads the
          text out of the PDF <b>on your device</b>, then sends that text to the AI provider configured below (using
          your own API key) to identify your holdings. Nothing is uploaded anywhere else.
        </p>
        <p>
          The AI's answer is checked and shown to you as a <b>review table first</b> — nothing touches your portfolio
          until you approve it. Fix anything that looks wrong, untick rows you don't want, then apply.
        </p>
        <p>
          <b>Privacy</b>: the statement's text (holdings, balances) is sent to the AI provider you configure — that's
          what makes the parsing work. If you're not comfortable with that, stick to manual entry. Works with
          text-based PDFs (the kind you download from your broker); photographed or scanned statements aren't
          supported.
        </p>
      </HelpCard>

      <div className="card">
        <h2>Upload statement</h2>
        <div className="controls">
          <button
            className="action primary"
            disabled={stage.kind === "extracting" || stage.kind === "asking"}
            onClick={() => fileRef.current?.click()}
          >
            {stage.kind === "extracting"
              ? "Reading PDF…"
              : stage.kind === "asking"
                ? "Asking the AI…"
                : "Choose PDF statement"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
        </div>
        {stage.kind === "error" && <div className="error-box">{stage.message}</div>}
        {stage.kind === "applied" && (
          <div className="subtle">✓ {stage.summary} Head to the Portfolio tab to see it, or the other tabs to analyze it.</div>
        )}
      </div>

      {stage.kind === "review" && (
        <div className="card">
          <h2>Review before applying</h2>
          <div className="subtle" style={{ marginBottom: 10 }}>
            {stage.statement.broker && <>Statement from <b>{stage.statement.broker}</b>. </>}
            {stage.statement.statementDate && <>Dated {stage.statement.statementDate}. </>}
            Check every row — the AI can misread. Nothing is saved until you click apply.
          </div>
          {stage.dropNote && <div className="subtle" style={{ marginBottom: 8 }}>{stage.dropNote}</div>}
          {stage.cashNotes.length > 0 && (
            <div className="subtle" style={{ marginBottom: 8 }}>
              💱 Cash components:
              {stage.cashNotes.map((n) => (
                <div key={n} style={{ marginLeft: 16 }}>{n}</div>
              ))}
              Total prefilled below — adjust if needed.
            </div>
          )}
          {stage.statement.warnings.length > 0 && (
            <div className="error-box">
              {stage.statement.warnings.map((w) => (
                <div key={w}>⚠ {w}</div>
              ))}
            </div>
          )}
          <table className="data">
            <thead>
              <tr>
                <th>Use</th>
                <th>Symbol</th>
                <th>Name</th>
                <th className="num">Shares</th>
                {mode === "merge" && <th className="num">After merge</th>}
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.symbol}-${i}`}>
                  <td>
                    <input
                      type="checkbox"
                      checked={r.included}
                      disabled={!r.tracked}
                      onChange={(e) =>
                        setRows(rows.map((x, j) => (j === i ? { ...x, included: e.target.checked } : x)))
                      }
                    />
                  </td>
                  <td>
                    {r.symbol}
                    {r.shares !== null && r.shares < 0 && (
                      <span className="badge est" style={{ marginLeft: 6 }}>short</span>
                    )}
                  </td>
                  <td className="subtle">{r.description}</td>
                  <td className="num">
                    <input
                      type="number"
                      step="any"
                      value={r.shares ?? ""}
                      disabled={!r.tracked}
                      style={{ width: 100 }}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setRows(
                          rows.map((x, j) =>
                            j === i ? { ...x, shares: Number.isFinite(v) ? v : null } : x,
                          ),
                        );
                      }}
                    />
                    {r.fromValue && <span className="badge est" style={{ marginLeft: 6 }}>from $ value</span>}
                  </td>
                  {mode === "merge" && (
                    <td className="num subtle">
                      {r.included && r.shares
                        ? existingBySymbol.has(r.symbol)
                          ? `${existingBySymbol.get(r.symbol)} + ${r.shares.toFixed(2)} = ${(existingBySymbol.get(r.symbol)! + r.shares).toFixed(2)}`
                          : r.shares.toFixed(2)
                        : "—"}
                    </td>
                  )}
                  <td>
                    {r.tracked ? (
                      <span className="badge">tracked</span>
                    ) : (
                      <span className="badge est">
                        not tracked — <a href={ADD_TICKER_URL} target="_blank" rel="noreferrer">add it</a> first
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="controls" style={{ marginTop: 14 }}>
            <label>
              Cash (USD)
              <input
                type="number"
                min="0"
                step="any"
                value={cash || ""}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setCash(Number.isFinite(v) && v > 0 ? v : 0);
                }}
              />
            </label>
            <label>
              Apply as
              <select value={mode} onChange={(e) => setMode(e.target.value as ApplyMode)}>
                <option value="replace">Replace my portfolio</option>
                <option value="merge">Merge into my portfolio</option>
              </select>
            </label>
            <button className="action primary" disabled={included.length === 0} onClick={apply}>
              {mode === "replace" ? `Replace with ${included.length} holdings` : `Merge ${included.length} holdings`}
            </button>
            <button className="action" onClick={() => setStage({ kind: "idle" })}>
              Discard
            </button>
          </div>
          <div className="subtle">
            Merge adds these on top of your current holdings (same ticker sums shares) — use Replace if this
            statement supersedes what's already entered.
          </div>
        </div>
      )}
    </>
  );
}
