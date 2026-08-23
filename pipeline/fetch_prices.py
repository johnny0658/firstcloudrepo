"""Fetch ~10 years of daily adjusted closes for every tracked ticker.

Primary source: yfinance (recent releases use curl_cffi browser impersonation,
which works from GitHub Actions runner IPs; chunked bulk downloads keep request
counts low). Fallback: Stooq per ticker — free CSV, but its per-IP daily limit
is often exhausted on shared runners, hence fallback rather than primary.

Writes data/prices/{SYMBOL}.json only when content changed, so re-runs with
unchanged data produce no diff. Failures leave any previous file in place and
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
# Yahoo's adjustment factors wobble slightly between calls, which flips closes
# sitting near a cent boundary. Same dates + every close within this absolute
# tolerance = same data; keep the old file so re-runs don't churn the repo.
# Real dividend/split re-adjustments shift history by far more than a cent.
EQUIV_TOLERANCE = 0.011
CHUNK_SIZE = 20
STOOQ_URL = "https://stooq.com/q/d/l/?s={sym}&i=d"


def parse_stooq_csv(raw: bytes):
    text = raw.decode("utf-8", errors="replace")
    if not text.lstrip().startswith("Date,"):
        raise ValueError("response is not a Stooq CSV (header missing)")
    out = []
    for row in csv.DictReader(io.StringIO(text)):
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
    return parse_stooq_csv(http_get(STOOQ_URL.format(sym=symbol.lower() + ".us")))


def rows_from_frame(frame):
    closes = frame["Close"].dropna()
    rows = [(ts.strftime("%Y-%m-%d"), float(c)) for ts, c in closes.items() if float(c) > 0]
    return rows if len(rows) >= 100 else None


def fetch_yahoo_bulk(symbols):
    """Chunked bulk download; returns {symbol: rows} for whatever succeeded."""
    import yfinance as yf

    out = {}
    for i in range(0, len(symbols), CHUNK_SIZE):
        chunk = symbols[i : i + CHUNK_SIZE]
        frame = None
        for attempt in range(3):
            try:
                frame = yf.download(
                    chunk,
                    period=f"{HISTORY_YEARS}y",
                    auto_adjust=True,
                    progress=False,
                    group_by="ticker",
                    threads=False,
                )
                if frame is not None and not frame.empty:
                    break
            except Exception as err:
                print(f"  yahoo chunk {i // CHUNK_SIZE + 1} attempt {attempt + 1}: {err}", file=sys.stderr)
            time.sleep(15 * (attempt + 1))
        if frame is None or frame.empty:
            print(f"  yahoo chunk {i // CHUNK_SIZE + 1}: no data after retries", file=sys.stderr)
            continue
        for sym in chunk:
            try:
                sub = frame[sym] if len(chunk) > 1 else frame
                rows = rows_from_frame(sub)
                if rows:
                    out[sym] = rows
            except Exception:
                pass
        time.sleep(3)
    return out


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

    fetched = fetch_yahoo_bulk(symbols)
    sources = {sym: "yahoo" for sym in fetched}

    missing = [s for s in symbols if s not in fetched]
    for i, symbol in enumerate(missing):
        try:
            fetched[symbol] = fetch_stooq(symbol)
            sources[symbol] = "stooq"
            print(f"  stooq fallback ok: {symbol}")
        except Exception as err:
            print(f"  stooq fallback failed for {symbol}: {err}", file=sys.stderr)
        if i < len(missing) - 1:
            time.sleep(2)

    cutoff = (dt.date.today() - dt.timedelta(days=HISTORY_YEARS * 365)).isoformat()
    failures, changed = [], 0
    for symbol in symbols:
        rows = fetched.get(symbol)
        if not rows:
            failures.append(symbol)
            print(f"{symbol}: FAILED (no source returned data)", file=sys.stderr)
            continue
        rows = [r for r in rows if r[0] >= cutoff]
        path = DATA_DIR / "prices" / f"{symbol}.json"
        if path.exists():
            prev = load_json(path)
            if prev["dates"] == [r[0] for r in rows] and all(
                abs(a - round(b[1], 2)) <= EQUIV_TOLERANCE for a, b in zip(prev["adjClose"], rows)
            ):
                print(f"{symbol}: unchanged (within tolerance)")
                continue
        doc = {
            "ticker": symbol,
            "currency": "USD",
            "source": sources[symbol],
            "firstDate": rows[0][0],
            "lastDate": rows[-1][0],
            "dates": [r[0] for r in rows],
            # cents: Yahoo's adjustment factors wobble at the 4th decimal between
            # calls, so finer rounding causes spurious diffs on every re-run
            "adjClose": [round(r[1], 2) for r in rows],
        }
        if write_json_if_changed(path, doc):
            changed += 1
        print(f"{symbol}: {len(rows)} rows ({sources[symbol]})")

    write_json_if_changed(DATA_DIR / "prices" / "_failures.json", {"failures": sorted(failures)})
    print(f"done: {changed} files changed, {len(failures)} failures")
    return 0


if __name__ == "__main__":
    sys.exit(main())
