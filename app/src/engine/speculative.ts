/**
 * Forward-looking "what if the world changes" scenarios. Unlike historical
 * episodes there is nothing to replay, so each scenario is a set of authored
 * category-level shocks — speculative by construction, and always labeled so.
 * Every assumption is displayed in the UI; nothing here is a prediction.
 */
import { durationFor } from "./durations";
import { lastClose } from "./returns";
import type { ScenarioResult, HoldingImpact } from "./scenarios";
import type { AssetCategory, Portfolio, PriceSeries, TickerInfo } from "./types";

export interface SpeculativeScenario {
  id: string;
  name: string;
  story: string; // one-paragraph plain-language description of the world
  shocks: Record<AssetCategory, number>; // percent move per category
  rateChangeBps: number;
  cashNote: string | null; // e.g. purchasing-power caveat
}

export const CATEGORY_LABELS: Record<AssetCategory, string> = {
  us_broad: "US broad equity",
  us_tech: "US tech / software",
  robotics: "Robotics / automation",
  em_china: "EM / China equity",
  intl_dev: "Intl developed equity",
  us_small_value: "US small caps / value",
  gold: "Gold / precious metals",
};

export const SPECULATIVE_SCENARIOS: SpeculativeScenario[] = [
  {
    id: "multipolar_shift",
    name: "Multipolar Shift & USD Debasement",
    story:
      "Capital rotates away from the US: emerging markets rise, confidence in the dollar erodes, gold soars as investors seek stores of value outside the US system, and US assets fall while interest rates are forced up.",
    shocks: {
      us_broad: -30,
      us_tech: -35,
      robotics: -15,
      em_china: 40,
      intl_dev: 20,
      us_small_value: -25,
      gold: 60,
    },
    rateChangeBps: 250,
    cashNote:
      "Cash keeps its nominal dollar value here, but in this world a dollar buys roughly a quarter less — the loss is real even though this table doesn't show it.",
  },
  {
    id: "ai_boom",
    name: "AI Succeeds",
    story:
      "AI delivers on its promise: productivity jumps, software and chip companies capture enormous value, automation spreads through industry, and growth pushes rates up. Defensive assets like gold lag a booming market.",
    shocks: {
      us_broad: 25,
      us_tech: 80,
      robotics: 60,
      em_china: 10,
      intl_dev: 10,
      us_small_value: 5,
      gold: -10,
    },
    rateChangeBps: 150,
    cashNote: null,
  },
  {
    id: "techno_feudalism",
    name: "Techno-Feudalism",
    story:
      "A handful of platform giants capture most economic rents: big tech thrives while smaller businesses are squeezed, broad markets stagnate, growth outside the platforms stalls, and rates fall in a low-growth world. Gold benefits from unease.",
    shocks: {
      us_broad: -10,
      us_tech: 60,
      robotics: 40,
      em_china: -20,
      intl_dev: -15,
      us_small_value: -35,
      gold: 20,
    },
    rateChangeBps: -100,
    cashNote: null,
  },
];

/** Category for a holding: explicit tag first, then a type-based default. */
export function categoryFor(info: TickerInfo | undefined): AssetCategory {
  if (info?.category) return info.category;
  if (info?.type === "commodity_etf") return "gold";
  return "us_broad";
}

interface SpeculativeInputs {
  portfolio: Portfolio;
  prices: Map<string, PriceSeries>;
  tickerInfo: Map<string, TickerInfo>;
}

export function runSpeculative(inputs: SpeculativeInputs, scn: SpeculativeScenario): ScenarioResult {
  const impacts: HoldingImpact[] = [];

  for (const h of inputs.portfolio.holdings) {
    const series = inputs.prices.get(h.symbol);
    if (!series || h.shares === 0) continue;
    const info = inputs.tickerInfo.get(h.symbol);
    const startValue = h.shares * lastClose(series);

    let ret: number;
    if (info?.type === "bond_etf") {
      ret = Math.max(-1, (-durationFor(info) * scn.rateChangeBps) / 10000);
    } else {
      ret = Math.max(-1, scn.shocks[categoryFor(info)] / 100);
    }
    impacts.push({ symbol: h.symbol, method: "assumption", returnPct: ret, startValue, dollarPnL: startValue * ret });
  }

  if (inputs.portfolio.cash > 0) {
    impacts.push({ symbol: "Cash", method: "cash", returnPct: 0, startValue: inputs.portfolio.cash, dollarPnL: 0 });
  }

  const startValue = impacts.reduce((a, i) => a + i.startValue, 0);
  const pnl = impacts.reduce((a, i) => a + i.dollarPnL, 0);
  return {
    portfolioReturnPct: startValue ? pnl / startValue : 0,
    portfolioPnL: pnl,
    startValue,
    holdings: impacts,
  };
}
