"""Fetch USD exchange rates for major currencies via Yahoo (yfinance).

Writes data/fx.json as {"asOf": "YYYY-MM-DD", "usdPerUnit": {"SGD": 0.78, ...}}
— the multiplier converting one unit of the foreign currency into USD. On a
per-currency failure the previous value is retained so one bad quote never
erases the whole table.
"""
import datetime as dt
import sys

from common import DATA_DIR, load_json, write_json_if_changed

PAIRS = {
    "SGD": "SGDUSD=X",
    "EUR": "EURUSD=X",
    "GBP": "GBPUSD=X",
    "JPY": "JPYUSD=X",
    "HKD": "HKDUSD=X",
    "AUD": "AUDUSD=X",
}


def main() -> int:
    import yfinance as yf

    out_path = DATA_DIR / "fx.json"
    previous = load_json(out_path) if out_path.exists() else {"usdPerUnit": {}}
    rates: dict[str, float] = {}
    as_of = previous.get("asOf")
    failures = []

    for currency, symbol in PAIRS.items():
        try:
            hist = yf.Ticker(symbol).history(period="5d")
            rate = float(hist["Close"].iloc[-1])
            if not (0 < rate < 1000):
                raise ValueError(f"implausible rate {rate}")
            rates[currency] = round(rate, 6)
            as_of = max(as_of or "", hist.index[-1].strftime("%Y-%m-%d"))
        except Exception as err:
            failures.append(currency)
            old = previous.get("usdPerUnit", {}).get(currency)
            if old:
                rates[currency] = old
            print(f"{currency}: FAILED ({err}); {'kept previous' if old else 'no value'}", file=sys.stderr)

    if not rates:
        print("all FX fetches failed; keeping previous fx.json", file=sys.stderr)
        return 0
    write_json_if_changed(out_path, {"asOf": as_of or dt.date.today().isoformat(), "usdPerUnit": rates})
    print(f"fx.json: {len(rates)} currencies as of {as_of}, {len(failures)} failures")
    return 0


if __name__ == "__main__":
    sys.exit(main())
