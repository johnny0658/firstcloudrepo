/** Hand-rolled validator for the LLM's statement parse. The engine only ever
 * sees data that has passed this — the LLM's output is treated as untrusted
 * input, exactly like a user-uploaded file. */

export interface ParsedHolding {
  symbol: string;
  description: string;
  quantity: number | null;
  marketValue: number | null;
  assetType: "stock" | "etf" | "bond_fund" | "cash" | "other";
}

export interface ParsedStatement {
  statementDate: string | null;
  broker: string | null;
  holdings: ParsedHolding[];
  cashBalance: number | null;
  warnings: string[];
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
    if (assetType === "cash") continue; // cash rows belong in cashBalance
    if (quantity === null && marketValue === null) {
      warnings.push(`${symbol}: no quantity or value found — dropped`);
      continue;
    }
    if ((quantity ?? 0) < 0 || (marketValue ?? 0) < 0) {
      warnings.push(`${symbol}: short/negative position — not supported, dropped`);
      continue;
    }
    holdings.push({
      symbol,
      description: typeof r.description === "string" ? r.description.slice(0, 120) : "",
      quantity,
      marketValue,
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

  return {
    statementDate,
    broker: typeof obj.broker === "string" ? obj.broker.slice(0, 80) : null,
    holdings,
    cashBalance: Math.max(0, coerceNumber(obj.cashBalance) ?? 0) || null,
    warnings,
  };
}
