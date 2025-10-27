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
    for (const tr of Array.from(table.querySelectorAll("tr"))) {
      const cells = Array.from(tr.querySelectorAll("th,td")).map((td) =>
        (td.textContent || "").trim()
      );
      if (cells.length) rows.push({ cells });
    }
    return rows;
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
        return { root_hash: root, entries: tableToRows(node) };
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
      if (node.tagName && node.tagName.toLowerCase() === "table")
        return tableToRows(node);
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
  return data;
}
