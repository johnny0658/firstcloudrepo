"""Fetch ~10 years of daily adjusted closes for every tracked ticker.

Primary source: Stooq (free CSV, no API key). Fallback: yfinance if installed.
Writes data/prices/{SYMBOL}.json only when content changed, so re-runs with
unchanged data produce no diff. Failures leave the previous file in place and
are recorded in data/prices/_failures.json for validate.py to pick up.
"""
import argparse
import csv
import datetime as dt
import io
import sys
import time

from common import DATA_DIR, http_get, load_json, write_json_if_changed

HISTORY_YEARS = 10
STOOQ_URL = "https://stooq.com/q/d/l/?s={sym}&i=d"


def stooq_symbol(symbol: str) -> str:
    return symbol.lower() + ".us"


def parse_stooq_csv(raw: bytes):
    text = raw.decode("utf-8", errors="replace")
    if not text.lstrip().startswith("Date,"):
        raise ValueError("response is not a Stooq CSV (header missing)")
    rows = list(csv.DictReader(io.StringIO(text)))
    out = []
    for row in rows:
        date, close = row.get("Date", ""), row.get("Close", "")
        if not date or not close:
            continue
        c = float(close)
        if c <= 0:
            raise ValueError(f"non-positive close on {date}")
        out.append((date, c))
    if len(out) < 100:
        raise ValueError(f"only {len(out)} rows returned")
    if out != sorted(out, key=lambda r: r[0]):
        raise ValueError("dates not monotonically increasing")
    return out


def fetch_stooq(symbol: str):
    return parse_stooq_csv(http_get(STOOQ_URL.format(sym=stooq_symbol(symbol))))


def fetch_yfinance(symbol: str):
    import yfinance as yf  # optional dependency

    hist = yf.Ticker(symbol).history(period=f"{HISTORY_YEARS}y", auto_adjust=True)
    if hist.empty:
        raise ValueError("yfinance returned no data")
    return [(idx.strftime("%Y-%m-%d"), float(c)) for idx, c in hist["Close"].items() if c > 0]


def fetch_one(symbol: str):
    try:
        return fetch_stooq(symbol), "stooq"
    except Exception as err:
        print(f"  stooq failed for {symbol}: {err}", file=sys.stderr)
    return fetch_yfinance(symbol), "yfinance"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", help="fetch a single ticker instead of the whole universe")
    args = parser.parse_args()

    universe = load_json(DATA_DIR / "tickers.json")["tickers"]
    symbols = [t["symbol"] for t in universe]
    if args.only:
        wanted = args.only.strip().upper()
        symbols = [s for s in symbols if s == wanted]
        if not symbols:
            print(f"{wanted} is not in data/tickers.json; add it there first", file=sys.stderr)
            return 1

    cutoff = (dt.date.today() - dt.timedelta(days=HISTORY_YEARS * 365)).isoformat()
    failures, changed = [], 0
    for i, symbol in enumerate(symbols):
        try:
            rows, source = fetch_one(symbol)
            rows = [r for r in rows if r[0] >= cutoff]
            doc = {
                "ticker": symbol,
                "currency": "USD",
                "source": source,
                "firstDate": rows[0][0],
                "lastDate": rows[-1][0],
                "dates": [r[0] for r in rows],
                "adjClose": [round(r[1], 4) for r in rows],
            }
            if write_json_if_changed(DATA_DIR / "prices" / f"{symbol}.json", doc):
                changed += 1
            print(f"[{i + 1}/{len(symbols)}] {symbol}: {len(rows)} rows ({source})")
        except Exception as err:
            failures.append(symbol)
            print(f"[{i + 1}/{len(symbols)}] {symbol}: FAILED ({err})", file=sys.stderr)
        if i < len(symbols) - 1:
            time.sleep(1.5)

    write_json_if_changed(DATA_DIR / "prices" / "_failures.json", {"failures": sorted(failures)})
    print(f"done: {changed} files changed, {len(failures)} failures")
    return 0


if __name__ == "__main__":
    sys.exit(main())
