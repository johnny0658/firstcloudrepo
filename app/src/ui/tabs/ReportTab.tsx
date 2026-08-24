import { useState } from "react";
import { aiErrorMessage, chatJson } from "../../ai/client";
import { buildReportUserPrompt, REPORT_SYSTEM_PROMPT } from "../../ai/prompts";
import type { AiSettings } from "../../ai/settings";
import type { Portfolio, PriceSeries } from "../../engine/types";
import { renderReportHtml, validateNarrative } from "../../report/render";
import { buildLlmSummary, buildReportData } from "../../report/summary";
import { HelpCard } from "../Help";
import { usePortfolioAnalytics, type StaticData } from "../useAnalytics";

type Stage =
  | { kind: "idle" }
  | { kind: "computing" }
  | { kind: "writing" }
  | { kind: "done"; html: string; title: string }
  | { kind: "error"; message: string };

interface Props {
  portfolio: Portfolio;
  staticData: StaticData | null;
  prices: Map<string, PriceSeries> | null;
  settings: AiSettings;
}

export function ReportTab({ portfolio, staticData, prices, settings }: Props) {
  const analytics = usePortfolioAnalytics(portfolio, prices, staticData);
  const [stage, setStage] = useState<Stage>({ kind: "idle" });

  const generate = async () => {
    if (!staticData || !prices || !analytics) return;
    try {
      setStage({ kind: "computing" });
      const data = buildReportData(portfolio, prices, staticData, analytics);
      const summary = buildLlmSummary(data);
      setStage({ kind: "writing" });
      const raw = await chatJson(settings, [
        { role: "system", content: REPORT_SYSTEM_PROMPT },
        { role: "user", content: buildReportUserPrompt(JSON.stringify(summary)) },
      ]);
      const narrative = validateNarrative(raw);
      const html = await renderReportHtml(data, narrative, settings.model);
      setStage({ kind: "done", html, title: narrative.title });
    } catch (err) {
      setStage({ kind: "error", message: aiErrorMessage(err) });
    }
  };

  const download = () => {
    if (stage.kind !== "done") return;
    const blob = new Blob([stage.html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portfolio-report-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openForPrint = () => {
    if (stage.kind !== "done") return;
    const blob = new Blob([stage.html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    // revoking immediately races the new tab's load; give it a minute
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  if (!staticData || !prices || !analytics) return <div className="card">Loading…</div>;

  return (
    <>
      <HelpCard title="What is this report?">
        <p>
          One click produces a <b>written portfolio review</b> you can save or share: your holdings, risk profile,
          crisis stress tests, 20-year projection, and what drives your returns — all explained in plain language.
        </p>
        <p>
          <b>Every number is computed on your device</b> by the same engine behind the other tabs. The AI only writes
          the words around those numbers (using your API key configured above), and is instructed to quote them
          exactly rather than make up its own. The report notes clearly that its prose is AI-written.
        </p>
        <p>
          Download it as an HTML file — it opens in any browser, prints cleanly, and "Open for printing" lets you
          save it as a PDF via your browser's print dialog.
        </p>
      </HelpCard>

      <div className="card">
        <h2>Generate report</h2>
        <div className="controls">
          <button
            className="action primary"
            disabled={stage.kind === "computing" || stage.kind === "writing"}
            onClick={generate}
          >
            {stage.kind === "computing"
              ? "Running the numbers…"
              : stage.kind === "writing"
                ? "AI is writing…"
                : stage.kind === "done"
                  ? "Regenerate"
                  : "Generate report"}
          </button>
          {stage.kind === "done" && (
            <>
              <button className="action" onClick={download}>
                Download HTML
              </button>
              <button className="action" onClick={openForPrint}>
                Open for printing (save as PDF)
              </button>
            </>
          )}
        </div>
        {stage.kind === "error" && <div className="error-box">{stage.message}</div>}
        {stage.kind === "done" && (
          <>
            <div className="subtle" style={{ marginBottom: 8 }}>
              Preview of "{stage.title}" — the downloaded file is identical and fully self-contained.
            </div>
            <iframe
              title="Report preview"
              srcDoc={stage.html}
              style={{ width: "100%", height: 560, border: "1px solid var(--grid)", borderRadius: 8, background: "#fff" }}
            />
          </>
        )}
      </div>
    </>
  );
}
