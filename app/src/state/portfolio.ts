import type { Portfolio } from "../engine/types";

const STORAGE_KEY = "pfsim.v1";

export function loadPortfolio(): Portfolio {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.holdings) && typeof parsed.cash === "number") {
        return {
          holdings: parsed.holdings.filter(
            (h: { symbol?: unknown; shares?: unknown }) =>
              typeof h.symbol === "string" && typeof h.shares === "number" && h.shares > 0,
          ),
          cash: Math.max(0, parsed.cash),
        };
      }
    }
  } catch {
    // corrupted or unavailable storage: start fresh
  }
  return { holdings: [], cash: 0 };
}

export function savePortfolio(p: Portfolio): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // storage full/unavailable: the in-memory copy still works this session
  }
}

export function exportPortfolio(p: Portfolio): void {
  const blob = new Blob([JSON.stringify(p, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "portfolio.json";
  a.click();
  URL.revokeObjectURL(url);
}

export function importPortfolio(file: File): Promise<Portfolio> {
  return file.text().then((text) => {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed.holdings) || typeof parsed.cash !== "number") {
      throw new Error("not a portfolio export");
    }
    return {
      holdings: parsed.holdings.filter(
        (h: { symbol?: unknown; shares?: unknown }) =>
          typeof h.symbol === "string" && typeof h.shares === "number" && h.shares !== 0,
      ),
      cash: Math.max(0, parsed.cash),
    };
  });
}
