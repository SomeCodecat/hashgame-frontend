// Client-side scraper: fetches HTML from a target URL (optionally via a CORS proxy)
// and parses the main sections into a JSON-like structure matching the backend scraper.

export async function fetchRemoteState({
  url = "http://hash.h10a.de/",
  corsProxy = "",
} = {}) {
  const target = corsProxy ? `${corsProxy}${encodeURIComponent(url)}` : url;
  const res = await fetch(target);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);

  // If the response is JSON (e.g., from a local proxy /scrape), return it directly
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return await res.json();
  }

  const html = await res.text();

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  function findHeading(text) {
    const tags = ["h1", "h2", "h3", "b"];
    for (const t of tags) {
      const els = Array.from(doc.getElementsByTagName(t));
      for (const el of els) {
        if ((el.textContent || "").includes(text)) return el;
      }
    }
    return null;
  }

  function tableToRows(table) {
    const rows = [];
    // headers from first row if th present
    const ths = Array.from(table.querySelectorAll("th"));
    const headers = ths.length
      ? ths.map((th) => (th.textContent || "").trim())
      : null;
    for (const tr of Array.from(table.querySelectorAll("tr"))) {
      const cellsEls = Array.from(tr.querySelectorAll("th,td"));
      const cells = cellsEls.map((td) => (td.textContent || "").trim());
      const cell_colors = cellsEls.map(
        (td) =>
          td.getAttribute("bgcolor") ||
          (td.getAttribute("style") || "").match(
            /background(?:-color)?\s*:\s*([^;]+)/i
          )?.[1] ||
          null
      );
      if (cells.length) rows.push({ cells, cell_colors });
    }
    return headers ? { headers, rows } : rows;
  }

  function parseActiveHashes() {
    const heading = findHeading("Active Hashes");
    if (!heading) {
      // fallback: search for 64-hex in text
      const text = doc.body.textContent || "";
      const re = /\b[0-9a-f]{64}\b/gi;
      const out = [];
      let m;
      while ((m = re.exec(text))) out.push({ hash: m[0] });
      return out;
    }
    // look for next table
    let node = heading.nextElementSibling;
    while (node) {
      if (node.tagName && node.tagName.toLowerCase() === "table")
        return tableToRows(node);
      node = node.nextElementSibling;
    }
    return [];
  }

  function parseLongestChain() {
    const heading = findHeading("Longest Chain");
    if (!heading) return { root_hash: null, entries: [] };
    // find first 64-hex following the heading
    let root = null;
    let node = heading.nextElementSibling;
    while (node) {
      const text = node.textContent || "";
      const m = text.match(/([0-9a-f]{64})/i);
      if (m && !root) root = m[1];
      if (node.tagName && node.tagName.toLowerCase() === "table") {
        const t = tableToRows(node);
        if (t.headers)
          return { root_hash: root, entries: t.rows, headers: t.headers };
        return { root_hash: root, entries: t };
      }
      node = node.nextElementSibling;
    }
    return { root_hash: root, entries: [] };
  }

  function parseSummary() {
    const heading = findHeading("Summary");
    if (!heading) return [];
    let node = heading.nextElementSibling;
    while (node) {
      if (node.tagName && node.tagName.toLowerCase() === "table") {
        const t = tableToRows(node);
        if (t.headers) return { headers: t.headers, rows: t.rows };
        return t;
      }
      node = node.nextElementSibling;
    }
    return [];
  }

  function findAssets() {
    const anchors = Array.from(doc.querySelectorAll("a[href]"));
    return anchors
      .filter(
        (a) =>
          a.href.endsWith(".pdf") ||
          a.href.endsWith(".java") ||
          /tree/i.test(a.href)
      )
      .map((a) => ({ name: (a.textContent || a.href).trim(), url: a.href }));
  }

  const data = {
    metadata: { fetched_at: new Date().toISOString(), source: url },
    active_hashes: parseActiveHashes(),
    longest_chain: parseLongestChain(),
    summary: parseSummary(),
    assets: findAssets(),
  };
  // If not found in summary, look for a difficulty-like line in the HTML text (heuristic).
  try {
    if (!data.difficulty) {
      const text = doc.body.textContent || "";
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      // explicit 'Difficulty' lines
      for (const line of lines) {
        if (line.toLowerCase().includes("difficulty")) {
          data.difficulty = line;
          break;
        }
      }
      // fallback: look for a line containing 'Bit' and 'SHA' or 'GHash' or 's/block'
      if (!data.difficulty) {
        for (const line of lines) {
          const ll = line.toLowerCase();
          if (
            ll.includes("bit") &&
            (ll.includes("sha") ||
              ll.includes("ghash") ||
              ll.includes("s/block"))
          ) {
            data.difficulty = line;
            break;
          }
        }
      }
    }
  } catch (e) {
    // ignore
  }
  // derive difficulty from summary if possible
  try {
    const summary = data.summary;
    let rows = [];
    if (summary && Array.isArray(summary)) rows = summary;
    else if (summary && summary.rows) rows = summary.rows;
    for (const r of rows) {
      const cells = r.cells || [];
      if (cells.length >= 2) {
        const k = (cells[0] || "").toLowerCase();
        if (k.includes("difficulty") || k.startsWith("diff")) {
          data.difficulty = cells[1];
          break;
        }
      }
    }
  } catch (e) {
    // ignore
  }
  // Normalize difficulty string so it doesn't include a leading label
  try {
    if (typeof data.difficulty === "string") {
      data.difficulty = data.difficulty
        .replace(/^\s*Difficulty\s*[:\-]?\s*/i, "")
        .trim();
      if (!data.difficulty) delete data.difficulty;
    }
  } catch (e) {
    // ignore
  }
  return data;
}
