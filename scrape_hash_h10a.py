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
    headers = []
    # look for heading containing "Active Hashes"
    heading = soup.find(lambda tag: tag.name in ("h1", "h2", "h3", "b") and "Active Hashes" in tag.get_text())
    if not heading:
        # fallback: search for 64-char hex strings
        for m in re.finditer(r"\b[0-9a-f]{64}\b", soup.get_text(), re.IGNORECASE):
            active.append({"hash": m.group(0)})
        return active

    table = heading.find_next("table")
    def cell_info(el):
        # returns (text, color)
        text = el.get_text(strip=True)
        color = None
        if el.has_attr('bgcolor'):
            color = el['bgcolor']
        elif el.has_attr('style'):
            m = re.search(r'background(?:-color)?\s*:\s*([^;]+)', el['style'], re.IGNORECASE)
            if m:
                color = m.group(1).strip()
        return text, color

    if table:
        # try to extract headers from first row if it contains th
        first_ths = table.find_all('th')
        if first_ths:
            headers = [th.get_text(strip=True) for th in first_ths]
        for tr in table.find_all("tr"):
            cols = tr.find_all(["td", "th"])
            if not cols:
                continue
            # skip a pure header row if we already extracted headers
            if headers and all(el.name == 'th' for el in cols):
                continue
            cells = []
            colors = []
            for td in cols:
                t, c = cell_info(td)
                cells.append(t)
                colors.append(c)
            if not cells:
                continue
            h = next((c for c in cells if re.fullmatch(r"[0-9a-f]{64}", c, re.IGNORECASE)), None)
            row = {"cells": cells, "cell_colors": colors}
            if h:
                row["hash"] = h
            active.append(row)
        # return both rows and headers (headers may be empty)
        return {"headers": headers, "rows": active} if headers else active

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
            # extract headers if any
            ths = node.find_all('th')
            headers = [th.get_text(strip=True) for th in ths] if ths else []
            for tr in node.find_all("tr"):
                cols = tr.find_all(["td", "th"])
                if not cols:
                    continue
                # skip header-only row if headers were found
                if headers and all(el.name == 'th' for el in cols):
                    continue
                cells = []
                colors = []
                for td in cols:
                    t = td.get_text(strip=True)
                    c = None
                    if td.has_attr('bgcolor'):
                        c = td['bgcolor']
                    elif td.has_attr('style'):
                        m = re.search(r'background(?:-color)?\s*:\s*([^;]+)', td['style'], re.IGNORECASE)
                        if m:
                            c = m.group(1).strip()
                    cells.append(t)
                    colors.append(c)
                if cells:
                    entries.append({"cells": cells, "cell_colors": colors})
            return {"root_hash": root, "entries": entries, "headers": headers}
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
    headers = []
    ths = table.find_all('th')
    if ths:
        headers = [th.get_text(strip=True) for th in ths]
    for tr in table.find_all("tr"):
        cols = tr.find_all(["td", "th"])
        if not cols:
            continue
        # if headers exist and this row is header-only, skip it
        if headers and all(el.name == 'th' for el in cols):
            continue
        cells = []
        colors = []
        for td in cols:
            t = td.get_text(strip=True)
            c = None
            if td.has_attr('bgcolor'):
                c = td['bgcolor']
            elif td.has_attr('style'):
                m = re.search(r'background(?:-color)?\s*:\s*([^;]+)', td['style'], re.IGNORECASE)
                if m:
                    c = m.group(1).strip()
            cells.append(t)
            colors.append(c)
        if cells:
            rows.append({"cells": cells, "cell_colors": colors})
    return {"headers": headers, "rows": rows} if headers else rows


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
    # Try to find a difficulty string anywhere on the page if not in summary
    try:
        if not data.get('difficulty'):
            text = soup.get_text("\n", strip=True)
            # First look for explicit "Difficulty" lines
            for line in text.splitlines():
                if 'difficulty' in line.lower():
                    data['difficulty'] = line.strip()
                    break
            # Otherwise look for a line that contains 'Bit' and 'SHA' (heuristic)
            if not data.get('difficulty'):
                for line in text.splitlines():
                    if 'bit' in line.lower() and ('sha' in line.lower() or 'ghash' in line.lower() or 's/block' in line.lower()):
                        data['difficulty'] = line.strip()
                        break
    except Exception:
        pass
    # try to extract a single difficulty value from the summary table if present
    try:
        summary = data.get('summary')
        difficulty = None
        rows = []
        if isinstance(summary, dict) and summary.get('rows'):
            rows = summary.get('rows')
        elif isinstance(summary, list):
            rows = summary
        for rrow in rows:
            # rrow may be {'cells': [...]} or similar
            cells = rrow.get('cells') if isinstance(rrow, dict) else None
            if cells and len(cells) >= 2:
                key = (cells[0] or '').strip().lower()
                if 'difficulty' in key or key.startswith('diff'):
                    difficulty = cells[1].strip()
                    break
        if difficulty is not None:
            data['difficulty'] = difficulty
    except Exception:
        # don't fail scraping for this optional value
        pass
    return data


def save(data):
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"Wrote {OUT_PATH}")


if __name__ == "__main__":
    data = scrape()
    save(data)
