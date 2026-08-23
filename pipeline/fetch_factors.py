"""Download Fama-French factor files from the Ken French Data Library.

Produces data/factors/{ff3,mom}_{monthly,daily}.json. The CSV inside each zip
has preamble text, a header row, the data block, then annual summaries — the
parser locates the header by its column names and stops at the first row that
is not a date, so format drift fails loudly instead of silently corrupting.
"""
import io
import re
import sys
import zipfile

from common import DATA_DIR, http_get, write_json_if_changed

BASE = "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/"
FILES = [
    ("F-F_Research_Data_Factors_CSV.zip", "ff3_monthly.json", "monthly", ["Mkt-RF", "SMB", "HML", "RF"]),
    ("F-F_Research_Data_Factors_daily_CSV.zip", "ff3_daily.json", "daily", ["Mkt-RF", "SMB", "HML", "RF"]),
    ("F-F_Momentum_Factor_CSV.zip", "mom_monthly.json", "monthly", ["Mom"]),
    ("F-F_Momentum_Factor_daily_CSV.zip", "mom_daily.json", "daily", ["Mom"]),
]
DATE_RE = {"monthly": re.compile(r"^\d{6}$"), "daily": re.compile(r"^\d{8}$")}


def parse_french_csv(text: str, frequency: str, want_cols: list[str]):
    lines = text.splitlines()
    header_idx = None
    for i, line in enumerate(lines):
        cells = [c.strip() for c in line.split(",")]
        if all(any(c.lower() == w.lower() for c in cells) for w in want_cols):
            header_idx = i
            break
    if header_idx is None:
        raise ValueError(f"header row with {want_cols} not found")
    header = [c.strip() for c in lines[header_idx].split(",")]
    col_pos = {w: next(j for j, c in enumerate(header) if c.lower() == w.lower()) for w in want_cols}

    labels, values = [], []
    for line in lines[header_idx + 1:]:
        cells = [c.strip() for c in line.split(",")]
        if not DATE_RE[frequency].match(cells[0]):
            break  # blank line or annual-data section: end of the block
        raw = cells[0]
        label = f"{raw[:4]}-{raw[4:6]}" if frequency == "monthly" else f"{raw[:4]}-{raw[4:6]}-{raw[6:]}"
        row = [float(cells[col_pos[w]]) for w in want_cols]
        if any(v <= -99.9 for v in row):  # French's missing-data sentinel
            continue
        labels.append(label)
        values.append(row)
    if len(labels) < 12:
        raise ValueError(f"only {len(labels)} data rows parsed")
    return labels, values


def main() -> int:
    failed = []
    for zip_name, out_name, frequency, want_cols in FILES:
        try:
            blob = http_get(BASE + zip_name)
            zf = zipfile.ZipFile(io.BytesIO(blob))
            text = zf.read(zf.namelist()[0]).decode("utf-8", errors="replace")
            labels, values = parse_french_csv(text, frequency, want_cols)
            doc = {
                "source": "ken_french",
                "frequency": frequency,
                "columns": [c.replace("Mkt-RF", "MktRF").replace("Mom", "MOM") for c in want_cols],
                ("months" if frequency == "monthly" else "dates"): labels,
                "values": values,
            }
            write_json_if_changed(DATA_DIR / "factors" / out_name, doc)
            print(f"{out_name}: {len(labels)} rows through {labels[-1]}")
        except Exception as err:
            failed.append(zip_name)
            print(f"{zip_name}: FAILED ({err})", file=sys.stderr)
    # Old factor files stay in place on failure; only report status.
    return 1 if len(failed) == len(FILES) else 0


if __name__ == "__main__":
    sys.exit(main())
