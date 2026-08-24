import type { Episode } from "../engine/scenarios";
import type { FactorTable, PriceSeries, TickerInfo } from "../engine/types";

export interface Meta {
  lastUpdated: string;
  tickerCount: number;
  failures: string[];
  factorLastMonth: string | null;
}

const base = import.meta.env.BASE_URL + "data/";
const priceCache = new Map<string, PriceSeries | null>();
let version = "";

async function getJson<T>(path: string, noCache = false): Promise<T> {
  const url = base + path + (version && !noCache ? `?v=${encodeURIComponent(version)}` : "");
  const resp = await fetch(url, noCache ? { cache: "no-cache" } : undefined);
  if (!resp.ok) throw new Error(`${path}: HTTP ${resp.status}`);
  return resp.json();
}

export async function loadMeta(): Promise<Meta> {
  const meta = await getJson<Meta>("meta.json", true);
  version = meta.lastUpdated;
  return meta;
}

export async function loadTickers(): Promise<Map<string, TickerInfo>> {
  const doc = await getJson<{ tickers: TickerInfo[] }>("tickers.json");
  return new Map(doc.tickers.map((t) => [t.symbol, t]));
}

export async function loadFactorTables(): Promise<{ ff3: FactorTable; mom: FactorTable }> {
  const [ff3, mom] = await Promise.all([
    getJson<FactorTable>("factors/ff3_monthly.json"),
    getJson<FactorTable>("factors/mom_monthly.json"),
  ]);
  return { ff3, mom };
}

export interface FxTable {
  asOf: string;
  usdPerUnit: Record<string, number>;
}

/** null when fx.json hasn't been generated yet (first refresh pending). */
export async function loadFx(): Promise<FxTable | null> {
  try {
    return await getJson<FxTable>("fx.json");
  } catch {
    return null;
  }
}

export async function loadEpisodes(): Promise<Episode[]> {
  const doc = await getJson<{ episodes: Episode[] }>("scenarios/episodes.json");
  return doc.episodes;
}

/** null = tracked ticker whose price file is missing (fetch failed upstream). */
export async function loadPrices(symbols: string[]): Promise<Map<string, PriceSeries>> {
  await Promise.all(
    symbols
      .filter((s) => !priceCache.has(s))
      .map(async (s) => {
        try {
          priceCache.set(s, await getJson<PriceSeries>(`prices/${s}.json`));
        } catch {
          priceCache.set(s, null);
        }
      }),
  );
  const out = new Map<string, PriceSeries>();
  for (const s of symbols) {
    const v = priceCache.get(s);
    if (v) out.set(s, v);
  }
  return out;
}
