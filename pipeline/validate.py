"""Post-fetch sanity pass; writes data/meta.json. Exits non-zero only on
catastrophic failure (>30% of the universe failed) so one dead ticker never
kills the nightly run."""
import datetime as dt
import sys

from common import DATA_DIR, load_json, write_json_if_changed


def main() -> int:
    universe = load_json(DATA_DIR / "tickers.json")["tickers"]
    failures_file = DATA_DIR / "prices" / "_failures.json"
    failures = load_json(failures_file)["failures"] if failures_file.exists() else []

    missing = [t["symbol"] for t in universe if not (DATA_DIR / "prices" / f"{t['symbol']}.json").exists()]
    factor_last = None
    ff_monthly = DATA_DIR / "factors" / "ff3_monthly.json"
    if ff_monthly.exists():
        factor_last = load_json(ff_monthly)["months"][-1]

    meta = {
        "lastUpdated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "tickerCount": len(universe),
        "failures": sorted(set(failures) | set(missing)),
        "factorLastMonth": factor_last,
    }
    write_json_if_changed(DATA_DIR / "meta.json", meta)
    print(f"meta.json: {len(universe)} tickers, {len(meta['failures'])} failures, factors through {factor_last}")

    if len(meta["failures"]) > 0.3 * len(universe):
        print("more than 30% of tickers failed; aborting", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
