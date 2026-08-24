/** Hand-rolled validator for the LLM's statement parse. The engine only ever
 * sees data that has passed this — the LLM's output is treated as untrusted
 * input, exactly like a user-uploaded file. */

export interface ParsedHolding {
  symbol: string;
  description: string;
  quantity: number | null; // negative = short position
  marketValue: number | null;
  currency: string; // ISO code of marketValue, default USD
  assetType: "stock" | "etf" | "bond_fund" | "cash" | "other";
}

export interface CashItem {
  amount: number; // positive, in its own currency
  currency: string;
  description: string;
}

export interface ParsedStatement {
  statementDate: string | null;
  broker: string | null;
  holdings: ParsedHolding[];
  /** Itemized cash and cash-equivalents (settled cash, money-market funds…). */
  cashItems: CashItem[];
  warnings: string[];
}

export function normalizeCurrency(v: unknown): string {
  if (typeof v !== "string") return "USD";
  const c = v.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? c : "USD";
}

const ASSET_TYPES = new Set(["stock", "etf", "bond_fund", "cash", "other"]);

/** Coerce "1,234.56", "$12,000", "(500)" (negatives), 1234.56 → number. */
export function coerceNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let s = v.trim().replace(/[$,\s]/g, "");
  if (!s) return null;
  const paren = /^\((.*)\)$/.exec(s);
  if (paren) s = "-" + paren[1];
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Uppercase, trim, map share-class dots to the dashes our data files use. */
export function normalizeSymbol(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.trim().toUpperCase().replace(/\./g, "-").slice(0, 12);
}

export function validateStatement(raw: unknown): ParsedStatement {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("model response is not an object");
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.holdings)) {
    throw new Error("model response has no holdings array");
  }

  const warnings: string[] = Array.isArray(obj.warnings)
    ? obj.warnings.filter((w): w is string => typeof w === "string").slice(0, 20)
    : [];

  const cashItems: CashItem[] = [];
  const holdings: ParsedHolding[] = [];
  for (const row of obj.holdings) {
    if (typeof row !== "object" || row === null) continue;
    const r = row as Record<string, unknown>;
    const symbol = normalizeSymbol(r.symbol);
    const quantity = coerceNumber(r.quantity);
    const marketValue = coerceNumber(r.marketValue);
    const assetType = ASSET_TYPES.has(r.assetType as string)
      ? (r.assetType as ParsedHolding["assetType"])
      : "other";

    if (!symbol) continue;
    if (assetType === "cash") {
      // a cash fund the model put among holdings anyway: keep the money —
      // route it into cashItems instead of silently discarding it
      const amount = coerceNumber(r.marketValue) ?? coerceNumber(r.quantity);
      if (amount !== null && amount > 0) {
        cashItems.push({
          amount,
          currency: normalizeCurrency(r.currency),
          description:
            (typeof r.description === "string" && r.description.trim()) ? r.description.slice(0, 80) : symbol,
        });
      } else {
        warnings.push(`${symbol}: cash-equivalent row without a usable amount — dropped`);
      }
      continue;
    }
    if ((quantity === null || quantity === 0) && (marketValue === null || marketValue === 0)) {
      warnings.push(`${symbol}: no quantity or value found — dropped`);
      continue;
    }
    if ((quantity ?? 0) < 0) {
      warnings.push(`${symbol}: short position — it profits when the price falls and reduces your portfolio value`);
    }
    holdings.push({
      symbol,
      description: typeof r.description === "string" ? r.description.slice(0, 120) : "",
      quantity,
      marketValue,
      currency: normalizeCurrency(r.currency),
      assetType,
    });
  }

  const statementDate =
    typeof obj.statementDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(obj.statementDate)
      ? obj.statementDate
      : null;
  if (statementDate) {
    const ageDays = (Date.now() - new Date(statementDate).getTime()) / 86_400_000;
    if (ageDays > 30) {
      warnings.push(
        `Statement is dated ${statementDate} — holdings may have changed since, and dollar amounts convert at today's prices.`,
      );
    }
  }

  if (Array.isArray(obj.cashBalances)) {
    for (const row of obj.cashBalances.slice(0, 20)) {
      if (typeof row !== "object" || row === null) continue;
      const r = row as Record<string, unknown>;
      const amount = coerceNumber(r.amount);
      if (amount === null || amount === 0) continue;
      if (amount < 0) {
        warnings.push("Negative cash entry (margin debit) — skipped; not supported.");
        continue;
      }
      cashItems.push({
        amount,
        currency: normalizeCurrency(r.currency),
        description:
          (typeof r.description === "string" && r.description.trim()) ? r.description.slice(0, 80) : "cash",
      });
    }
  }
  // legacy scalar shape (older prompt / other models): fold into the list
  const legacyCash = coerceNumber(obj.cashBalance);
  if (legacyCash !== null && legacyCash > 0 && cashItems.length === 0) {
    cashItems.push({ amount: legacyCash, currency: normalizeCurrency(obj.cashCurrency), description: "cash" });
  } else if (legacyCash !== null && legacyCash < 0) {
    warnings.push("Negative cash balance (margin debit) — treated as zero cash; not supported.");
  }

  return {
    statementDate,
    broker: typeof obj.broker === "string" ? obj.broker.slice(0, 80) : null,
    holdings,
    cashItems,
    warnings,
  };
}
