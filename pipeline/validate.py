"""Post-fetch sanity pass; writes data/meta.json.

Default mode always exits 0 so the data commit happens for whatever succeeded
(price files are only written on successful validation, so partial data is
always safe to commit). Run again with --gate AFTER the commit to turn an
unhealthy refresh (>30% of the universe failed) into a red workflow run.
"""
import argparse
import datetime as dt
import sys

from common import DATA_DIR, load_json, write_json_if_changed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--gate", action="store_true", help="exit 1 if the refresh was unhealthy")
    args = parser.parse_args()

    universe = load_json(DATA_DIR / "tickers.json")["tickers"]
    failures_file = DATA_DIR / "prices" / "_failures.json"
    failures = load_json(failures_file)["failures"] if failures_file.exists() else []

    missing = [t["symbol"] for t in universe if not (DATA_DIR / "prices" / f"{t['symbol']}.json").exists()]
    factor_last = None
    ff_monthly = DATA_DIR / "factors" / "ff3_monthly.json"
    if ff_monthly.exists():
        factor_last = load_json(ff_monthly)["months"][-1]

    # Data recency, not wall clock: the newest lastDate across price files.
    # A run that changes no data then leaves meta.json untouched too.
    last_dates = []
    for t in universe:
        f = DATA_DIR / "prices" / f"{t['symbol']}.json"
        if f.exists():
            last_dates.append(load_json(f)["lastDate"])
    meta = {
        "lastUpdated": max(last_dates) if last_dates else dt.date.today().isoformat(),
        "tickerCount": len(universe),
        "failures": sorted(set(failures) | set(missing)),
        "factorLastMonth": factor_last,
    }
    write_json_if_changed(DATA_DIR / "meta.json", meta)
    print(f"meta.json: {len(universe)} tickers, {len(meta['failures'])} failures, factors through {factor_last}")

    unhealthy = len(meta["failures"]) > 0.3 * len(universe)
    if unhealthy:
        print("WARNING: more than 30% of tickers failed this refresh", file=sys.stderr)
    return 1 if (args.gate and unhealthy) else 0


if __name__ == "__main__":
    sys.exit(main())
