"""Shared helpers for the data pipeline."""
import json
import time
import urllib.request
import urllib.error
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"

USER_AGENT = "Mozilla/5.0 (portfolio-simulator data pipeline)"


def http_get(url: str, retries: int = 3, timeout: int = 60) -> bytes:
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except (urllib.error.URLError, OSError) as err:
            last_err = err
            time.sleep(2 ** attempt)
    raise RuntimeError(f"GET {url} failed after {retries} attempts: {last_err}")


def write_json_if_changed(path: Path, obj) -> bool:
    """Write compact, stable JSON. Returns True if the file changed."""
    payload = json.dumps(obj, separators=(",", ":"), ensure_ascii=False).encode()
    if path.exists() and path.read_bytes() == payload:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)
    return True


def load_json(path: Path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)
