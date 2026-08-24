/** Embedded stylesheet for the standalone report. Light theme only (printing
 * and dark-mode extensions both behave; charts reference the same CSS
 * variables as the app, so every var used by chart components MUST be
 * defined here — the renderer test enforces that). Values mirror the light
 * theme in src/styles.css. */
export const REPORT_CSS = `
:root {
  color-scheme: light;
  --surface-1: #fcfcfb;
  --page: #ffffff;
  --text-primary: #0b0b0b;
  --text-secondary: #52514e;
  --text-muted: #898781;
  --grid: #e1e0d9;
  --baseline: #c3c2b7;
  --border: rgba(11, 11, 11, 0.1);
  --series-1: #2a78d6;
  --series-2: #eb6834;
  --series-3: #1baf7a;
  --series-4: #eda100;
  --pos: #2a78d6;
  --neg: #e34948;
  --delta-good: #006300;
  --delta-bad: #d03b3b;
  --accent: #2a78d6;
  --wash: rgba(42, 120, 214, 0.1);
  --heat-lo: #cde2fb;
  --heat-hi: #0d366b;
}
* { box-sizing: border-box; }
body {
  margin: 0 auto; max-width: 820px; padding: 40px 28px;
  background: var(--page); color: var(--text-primary);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 14px; line-height: 1.55;
}
h1 { font-size: 26px; margin: 0 0 4px; }
h2 { font-size: 17px; margin: 30px 0 8px; border-bottom: 1px solid var(--grid); padding-bottom: 4px; }
p { margin: 8px 0; }
.meta { color: var(--text-muted); font-size: 12.5px; }
.banner {
  border: 1px solid var(--baseline); border-radius: 8px; background: #f9f9f7;
  color: var(--text-secondary); font-size: 12.5px; padding: 8px 14px; margin: 14px 0 4px;
}
table.data { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; margin: 10px 0; }
table.data th { text-align: left; font-size: 12px; color: var(--text-muted); font-weight: 500; border-bottom: 1px solid var(--grid); padding: 5px 8px; }
table.data td { padding: 6px 8px; border-bottom: 1px solid var(--grid); }
table.data td.num, table.data th.num { text-align: right; }
.chart-wrap { position: relative; margin: 12px 0; }
.chart-tooltip { display: none; }
.legend { display: flex; gap: 16px; flex-wrap: wrap; font-size: 12px; color: var(--text-secondary); margin-top: 6px; }
.legend .item { display: flex; align-items: center; gap: 6px; }
.legend .swatch { width: 12px; height: 12px; border-radius: 3px; }
.legend .line-key { width: 14px; height: 2px; border-radius: 1px; }
.heatmap { border-collapse: collapse; font-variant-numeric: tabular-nums; font-size: 11.5px; }
.heatmap th { font-size: 11px; color: var(--text-muted); font-weight: 500; padding: 4px 6px; }
.heatmap td { width: 44px; height: 30px; text-align: center; border: 2px solid var(--surface-1); border-radius: 4px; }
.takeaways { border: 1px solid var(--grid); border-radius: 8px; padding: 12px 18px; background: #f9f9f7; }
.takeaways li { margin: 6px 0; }
footer { margin-top: 34px; border-top: 1px solid var(--grid); padding-top: 12px; color: var(--text-muted); font-size: 12px; }
@media print {
  body { padding: 0; }
  section, .chart-wrap, table.data, .takeaways { break-inside: avoid; }
}
`;
