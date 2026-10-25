#!/usr/bin/env python3
"""Cache owned Instagram record-post photos from imported CSV links.

The exported Instagram CDN links have signatures that expire. Run in GitHub
Actions with network access, commit successfully downloaded photos to this repo,
and rewrite photo URLs to same-origin assets. No credentials required.
Failures are nonfatal: original Instagram links remain available.
"""
from __future__ import annotations
import concurrent.futures
import html
import json
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
CATALOG = json.loads((ROOT / "data/45rpm-collection.json").read_text(encoding="utf-8"))
ASSETS = ROOT / "assets/records/imported"
ASSETS.mkdir(parents=True, exist_ok=True)
INDEX = ROOT / "45rpm.html"
MAX_BYTES = 5_000_000

def fetch(record: dict) -> tuple[str, bool, str]:
    ident = record["id"]
    target = ASSETS / f"{ident}.jpg"
    if target.exists() and target.stat().st_size > 2000:
        return ident, True, "already cached"
    url = record.get("image", "")
    if not url.startswith("https://"):
        return ident, False, "missing source URL"
    req = Request(url, headers={
        "User-Agent": "Mozilla/5.0 (compatible; eggseed-record-archive/1.0)",
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
    })
    try:
        with urlopen(req, timeout=18) as response:
            kind = response.headers.get("Content-Type", "").split(";")[0]
            payload = response.read(MAX_BYTES + 1)
        if not payload.startswith(b"\xff\xd8\xff") or len(payload) < 2000:
            return ident, False, f"non-JPEG image response: {kind}, {len(payload)} bytes"
        if len(payload) > MAX_BYTES:
            return ident, False, "image too large"
        target.write_bytes(payload)
        return ident, True, f"{len(payload)} bytes"
    except (HTTPError, URLError, OSError, TimeoutError) as exc:
        return ident, False, f"{type(exc).__name__}: {exc}"

def update_sources(downloaded: set[str]) -> int:
    changed = 0
    source_index = INDEX.read_text(encoding="utf-8")
    revised_index = source_index
    for rec in CATALOG["records"]:
        ident = rec["id"]
        if ident not in downloaded:
            continue
        original = html.escape(rec["image"], quote=True)
        index_asset = f"assets/records/imported/{ident}.jpg"
        page_asset = f"../assets/records/imported/{ident}.jpg"
        detail = ROOT / f"records/{ident}.html"
        orig_text = detail.read_text(encoding="utf-8")
        new_text = orig_text.replace(f'src="{original}"', f'src="{page_asset}"', 1)
        if new_text != orig_text:
            detail.write_text(new_text, encoding="utf-8")
            changed += 1
        revised_index = revised_index.replace(f'src="{original}"', f'src="{index_asset}"', 1)
    if revised_index != source_index:
        INDEX.write_text(revised_index, encoding="utf-8")
        changed += 1
    return changed

def main() -> None:
    records = CATALOG["records"]
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        outcomes = list(executor.map(fetch, records))
    success = {ident for ident, good, _ in outcomes if good}
    changed = update_sources(success)
    for ident, good, message in outcomes:
        print(f"{ident}: {'cached' if good else 'remote fallback'} — {message}", flush=True)
    print(f"Cached {len(success)}/{len(records)} record photos, rewrote {changed} HTML files.", flush=True)
    if len(success) < len(records):
        print("Some photos could not be downloaded; original Instagram URLs and source posts remain linked.", flush=True)

if __name__ == "__main__":
    main()
