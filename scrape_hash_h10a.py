#!/usr/bin/env python3
"""Scrape http://hash.h10a.de/ and write JSON to data/state.json

Usage:
  python scrape_hash_h10a.py
"""
from datetime import datetime
import json
import os
import re
import requests
from bs4 import BeautifulSoup

URL = "http://hash.h10a.de/"
OUT_DIR = os.path.join(os.path.dirname(__file__), "data")
OUT_PATH = os.path.join(OUT_DIR, "state.json")


def text_or_none(el):
    return el.get_text(strip=True) if el else None


def parse_active_hashes(soup):
    active = []
    # look for heading containing "Active Hashes"
    heading = soup.find(lambda tag: tag.name in ("h1", "h2", "h3", "b") and "Active Hashes" in tag.get_text())
    if not heading:
        # fallback: search for 64-char hex strings
        for m in re.finditer(r"\b[0-9a-f]{64}\b", soup.get_text(), re.IGNORECASE):
            active.append({"hash": m.group(0)})
        return active

    table = heading.find_next("table")
    if table:
        for tr in table.find_all("tr"):
            cols = [td.get_text(strip=True) for td in tr.find_all(["td", "th"])]
            if not cols:
                continue
            h = next((c for c in cols if re.fullmatch(r"[0-9a-f]{64}", c, re.IGNORECASE)), None)
            row = {"cells": cols}
            if h:
                row["hash"] = h
            active.append(row)
        return active

    # preformatted fallback
    pre = heading.find_next("pre")
    if pre:
        for line in pre.get_text().splitlines():
            m = re.search(r"([0-9a-f]{64})", line)
            if m:
                active.append({"hash": m.group(1), "line": line.strip()})
    return active


def parse_longest_chain(soup):
    heading = soup.find(lambda tag: tag.name in ("h1", "h2", "h3", "b") and "Longest Chain" in tag.get_text())
    if not heading:
        return {"root_hash": None, "entries": []}

    root = None
    entries = []
    node = heading.next_sibling
    steps = 0
    while node and steps < 200:
        text = ""
        if hasattr(node, "get_text"):
            text = node.get_text(" ", strip=True)
        else:
            text = str(node).strip()
        if not root:
            m = re.search(r"([0-9a-f]{64})", text)
            if m:
                root = m.group(1)
        if getattr(node, "name", None) == "table":
            for tr in node.find_all("tr"):
                cols = [td.get_text(strip=True) for td in tr.find_all(["td", "th"])]
                if cols:
                    entries.append({"cells": cols})
            break
        node = node.next_sibling
        steps += 1

    return {"root_hash": root, "entries": entries}


def parse_summary(soup):
    heading = soup.find(lambda tag: tag.name in ("h1", "h2", "h3", "b") and "Summary" in tag.get_text())
    if not heading:
        return []
    table = heading.find_next("table")
    if not table:
        return []
    rows = []
    for tr in table.find_all("tr"):
        cols = [td.get_text(strip=True) for td in tr.find_all(["td", "th"])]
        if cols:
            rows.append({"cells": cols})
    return rows


def find_assets(soup):
    assets = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if href.endswith(".pdf") or href.endswith(".java") or "tree" in href.lower():
            assets.append({"name": a.get_text(strip=True) or href, "url": requests.compat.urljoin(URL, href)})
    return assets


def scrape():
    r = requests.get(URL, timeout=15)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")

    data = {
        "metadata": {"fetched_at": datetime.utcnow().isoformat() + "Z", "source": URL},
        "active_hashes": parse_active_hashes(soup),
        "longest_chain": parse_longest_chain(soup),
        "summary": parse_summary(soup),
        "assets": find_assets(soup),
    }
    return data


def save(data):
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"Wrote {OUT_PATH}")


if __name__ == "__main__":
    data = scrape()
    save(data)
