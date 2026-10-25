#!/usr/bin/env python3
"""Render a text-only Last.fm recent track into the GitHub Pages homepage.

Run by GitHub Actions before deploying. No visitor-side JavaScript or API
credentials are shipped to the website. A Last.fm username is required.
An official API key is optional: without it, a public RSS bridge is used.
"""
from __future__ import annotations

import html
import json
import os
import re
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlparse
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
PAGES = sorted(ROOT.glob("*.html")) + sorted((ROOT / "blog").glob("*.html")) + sorted((ROOT / "records").glob("*.html")) + sorted((ROOT / "reviews").glob("*.html"))
CONFIG = ROOT / "lastfm-username.txt"
START = "<!-- LASTFM_START -->"
END = "<!-- LASTFM_END -->"


def username() -> str:
    user = os.getenv("LASTFM_USERNAME", "").strip()
    if not user and CONFIG.exists():
        user = next(
            (line.strip() for line in CONFIG.read_text(encoding="utf-8").splitlines()
             if line.strip() and not line.lstrip().startswith("#")),
            "",
        )
    if not user:
        return ""
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,32}", user):
        raise ValueError("Last.fm username must contain only letters, numbers, _ or -")
    return user


def get_bytes(url: str) -> bytes:
    request = Request(url, headers={"User-Agent": "eggseed-country-archive/1.0"})
    with urlopen(request, timeout=14) as response:
        return response.read(750_000)


def safe_lastfm_link(url: str, user: str) -> str:
    fallback = "https://www.last.fm/user/" + quote(user, safe="")
    if not url:
        return fallback
    parsed = urlparse(url)
    if parsed.scheme == "https" and (parsed.hostname or "").lower() in ("last.fm", "www.last.fm"):
        return url
    return fallback


def official_recent(user: str, api_key: str) -> tuple[str, str, bool]:
    params = urlencode({
        "method": "user.getrecenttracks",
        "user": user,
        "api_key": api_key,
        "limit": "1",
        "format": "json",
    })
    document = json.loads(get_bytes("https://ws.audioscrobbler.com/2.0/?" + params))
    if "error" in document:
        raise ValueError(f"Last.fm API error {document['error']}")
    tracks = document.get("recenttracks", {}).get("track", [])
    if isinstance(tracks, dict):
        tracks = [tracks]
    if not tracks:
        raise ValueError("No Last.fm tracks yet")
    first = tracks[0]
    artist = first.get("artist", {})
    if isinstance(artist, dict):
        artist = artist.get("#text") or artist.get("name") or ""
    title = (str(artist).strip() + " — " + str(first.get("name", "")).strip()).strip(" —")
    now = first.get("@attr", {}).get("nowplaying") == "true"
    return title, safe_lastfm_link(str(first.get("url", "")), user), now


def rss_recent(user: str) -> tuple[str, str, bool]:
    # Unofficial public bridge at lfm.xiffy.nl; no credentials are sent.
    feed_url = "https://lfm.xiffy.nl/" + quote(user, safe="")
    root = ET.fromstring(get_bytes(feed_url))
    item = root.find(".//channel/item")
    if item is None:
        raise ValueError("No items in public Last.fm RSS feed")
    title = (item.findtext("title") or "").strip()
    if not title:
        raise ValueError("Latest RSS entry has no title")
    link = safe_lastfm_link((item.findtext("link") or "").strip(), user)
    return title, link, False


def main() -> None:
    user = username()
    if not user:
        fragment = '<span class="currently-muted">Last.fm not connected yet</span>'
        print("Last.fm username not configured; keeping placeholder.")
    else:
        try:
            key = os.getenv("LASTFM_API_KEY", "").strip()
            track, link, playing = official_recent(user, key) if key else rss_recent(user)
            status = "now playing" if playing else "last scrobbled"
            fragment = (
                '<a class="currently-track" href="' + html.escape(link, quote=True)
                + '" title="View on Last.fm" rel="noopener">'
                + html.escape(track) + '</a>'
                + '<small class="currently-status">' + status + ' on Last.fm</small>'
            )
            print(f"Last.fm listening updated using {'official API' if key else 'public RSS'} for {user}")
        except (ValueError, HTTPError, URLError, OSError, ET.ParseError, KeyError, TypeError) as error:
            # Never publish a guessed track when Last.fm is unavailable.
            fragment = (
                '<a href="https://www.last.fm/user/' + quote(user, safe="")
                + '" class="currently-track">view on Last.fm</a>'
                + '<small class="currently-status">recent track temporarily unavailable</small>'
            )
            print(f"Could not fetch Last.fm activity: {type(error).__name__}: {error}")

    refreshed = 0
    for page in PAGES:
        document = page.read_text(encoding="utf-8")
        start = document.find(START)
        if start < 0:
            continue
        end = document.find(END, start + len(START))
        if end < 0:
            raise SystemExit(f"Last.fm ending marker missing from {page.name}")
        page.write_text(
            document[:start + len(START)] + fragment + document[end:],
            encoding="utf-8",
        )
        refreshed += 1
    if refreshed == 0:
        raise SystemExit("No Last.fm markers in HTML")
    print(f"Refreshed listening text on {refreshed} pages.")


if __name__ == "__main__":
    main()
