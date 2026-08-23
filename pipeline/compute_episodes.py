"""Regenerate data/scenarios/episodes.json from the daily factor files.

Episode windows are defined here; their cumulative factor returns are computed
by compounding the daily Fama-French factors over each window, so the numbers
stay consistent with the committed factor data instead of being hand-typed.
"""
import sys

from common import DATA_DIR, load_json, write_json_if_changed

EPISODES = [
    {
        "id": "gfc_2008", "name": "Global Financial Crisis (2007-09)",
        "start": "2007-10-09", "end": "2009-03-09",
        "rateChangeBps": -300, "cashReturn": 2.5,
        "notes": "S&P 500 peak to trough; Fed funds cut from 4.75% to near zero.",
    },
    {
        "id": "covid_2020", "name": "COVID Crash (Feb-Mar 2020)",
        "start": "2020-02-19", "end": "2020-03-23",
        "rateChangeBps": -125, "cashReturn": 0.1,
        "notes": "Fastest 30%+ drawdown on record; emergency rate cuts to zero.",
    },
    {
        "id": "rate_shock_2022", "name": "2022 Rate Shock",
        "start": "2022-01-03", "end": "2022-10-12",
        "rateChangeBps": 300, "cashReturn": 1.0,
        "notes": "Inflation-driven hiking cycle; stocks and bonds fell together.",
    },
    {
        "id": "dotcom_2000", "name": "Dot-com Bust (2000-02)",
        "start": "2000-03-24", "end": "2002-10-09",
        "rateChangeBps": -475, "cashReturn": 9.0,
        "notes": "Nasdaq -78%; value strongly outperformed growth.",
    },
    {
        "id": "vol_2018_q4", "name": "Q4 2018 Selloff",
        "start": "2018-09-20", "end": "2018-12-24",
        "rateChangeBps": 10, "cashReturn": 0.6,
        "notes": "Rate-hike and trade-war fears; near-bear-market in one quarter.",
    },
]


def cumulative(labels, series, start, end):
    total = 1.0
    n = 0
    for date, pct in zip(labels, series):
        if start <= date <= end:
            total *= 1.0 + pct / 100.0
            n += 1
    if n == 0:
        raise ValueError(f"no factor observations in [{start}, {end}]")
    return round((total - 1.0) * 100.0, 2)


def main() -> int:
    if not (DATA_DIR / "factors" / "ff3_daily.json").exists():
        print("ff3_daily.json missing; run a full data refresh first — skipping episodes")
        return 0
    ff = load_json(DATA_DIR / "factors" / "ff3_daily.json")
    mom = load_json(DATA_DIR / "factors" / "mom_daily.json")
    ff_cols = {c: [row[i] for row in ff["values"]] for i, c in enumerate(ff["columns"])}
    mom_series = [row[0] for row in mom["values"]]

    episodes = []
    for ep in EPISODES:
        factor_returns = {
            name: cumulative(ff["dates"], ff_cols[name], ep["start"], ep["end"])
            for name in ("MktRF", "SMB", "HML")
        }
        try:
            factor_returns["MOM"] = cumulative(mom["dates"], mom_series, ep["start"], ep["end"])
        except ValueError:
            factor_returns["MOM"] = 0.0
        episodes.append({**ep, "factorReturns": factor_returns})

    write_json_if_changed(DATA_DIR / "scenarios" / "episodes.json", {"episodes": episodes})
    print(f"episodes.json: {len(episodes)} episodes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
