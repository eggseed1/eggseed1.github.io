#!/usr/bin/env python3
"""Prevent the GitHub Pages branch build from overwriting our Last.fm-rendered site.

This repository currently has *two* deployers: GitHub's automatic branch
Pages build and this action's custom artifact build. Publish our artifact last.
"""
from __future__ import annotations

import json
import os
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def main() -> None:
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    sha = os.environ.get("GITHUB_SHA", "")
    token = os.environ.get("GITHUB_TOKEN", "")
    if not repo or not sha:
        print("No GitHub run identity; skip deployment ordering.")
        return

    query = urlencode({"head_sha": sha, "per_page": 100})
    url = "https://api.github.com/repos/" + repo + "/actions/runs?" + query
    headers = {"Accept": "application/vnd.github+json",
               "User-Agent": "eggseed-lastfm-pages-order"}
    if token:
        headers["Authorization"] = "Bearer " + token

    deadline = time.monotonic() + 150
    discovery_deadline = time.monotonic() + 35
    last_status = ""
    errors = 0

    while time.monotonic() < deadline:
        try:
            with urlopen(Request(url, headers=headers), timeout=12) as response:
                runs = json.load(response)["workflow_runs"]
            errors = 0
        except (HTTPError, URLError, OSError, ValueError, KeyError) as exc:
            errors += 1
            print(f"Cannot inspect branch Pages build ({type(exc).__name__}); retrying.")
            if errors >= 3:
                # Github's branch deploy has typically finished by this time.
                print("API unavailable; using a conservative delay before custom deploy.")
                time.sleep(65)
                return
            time.sleep(5)
            continue

        branch = [run for run in runs
                  if run.get("name", "").lower() == "pages build and deployment"
                  and run.get("head_sha") == sha
                  and run.get("event") == "dynamic"]
        if not branch:
            if time.monotonic() >= discovery_deadline:
                print("No parallel branch Pages deployment found; continuing.")
                return
            time.sleep(4)
            continue

        newest = max(branch, key=lambda item: item.get("created_at", ""))
        status = newest.get("status", "unknown")
        if status != last_status:
            print(f"Branch Pages deployment: {status}")
            last_status = status
        if status == "completed":
            print("Branch Pages deployment completed; publishing the Last.fm version last.")
            # Give GitHub's Pages CDN a moment to settle.
            time.sleep(5)
            return
        time.sleep(5)

    print("Parallel branch Pages build exceeded 150 seconds; publishing now.")


if __name__ == "__main__":
    main()
