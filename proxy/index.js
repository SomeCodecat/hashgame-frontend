const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const app = express();
const PORT = process.env.PORT || 3000;

function tableToRows($, table) {
  const rows = [];
  $(table)
    .find("tr")
    .each((i, tr) => {
      const cells = [];
      $(tr)
        .find("th,td")
        .each((j, td) => {
          cells.push($(td).text().trim());
        });
      if (cells.length) rows.push({ cells });
    });
  return rows;
}

function findHeading($, text) {
  const tags = ["h1", "h2", "h3", "b"];
  for (const t of tags) {
    const els = $(t).toArray();
    for (const el of els) {
      if (($(el).text() || "").includes(text)) return $(el);
    }
  }
  return null;
}

async function fetchHtml(url) {
  const res = await axios.get(url, {
    timeout: 15000,
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  return res.data;
}

app.get("/raw", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "missing url" });
  try {
    const html = await fetchHtml(url);
    res.send(html);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/scrape", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "missing url" });
  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    // Active Hashes
    const activeHeading = findHeading($, "Active Hashes");
    let active = [];
    if (activeHeading) {
      const table = activeHeading.nextAll("table").first();
      if (table && table.length) active = tableToRows($, table);
    } else {
      // fallback: find 64-hex strings in body
      const text = $("body").text();
      const re = /\b[0-9a-f]{64}\b/gi;
      active = [];
      let m;
      while ((m = re.exec(text))) active.push({ hash: m[0] });
    }

    // Longest Chain
    const chainHeading = findHeading($, "Longest Chain");
    let longest_chain = { root_hash: null, entries: [] };
    if (chainHeading) {
      // find first 64-hex after heading
      let root = null;
      let foundTable = null;
      let node = chainHeading.next();
      while (node && node.length) {
        const text = $(node).text() || "";
        const m = text.match(/([0-9a-f]{64})/i);
        if (m && !root) root = m[1];
        if ($(node).is("table")) {
          foundTable = $(node);
          break;
        }
        node = node.next();
      }
      if (foundTable)
        longest_chain = {
          root_hash: root,
          entries: tableToRows($, foundTable),
        };
      else longest_chain = { root_hash: root, entries: [] };
    }

    // Summary
    const summaryHeading = findHeading($, "Summary");
    let summary = [];
    if (summaryHeading) {
      const table = summaryHeading.nextAll("table").first();
      if (table && table.length) summary = tableToRows($, table);
    }

    // Assets
    const assets = [];
    $("a[href]").each((i, a) => {
      const href = $(a).attr("href") || "";
      if (
        href.endsWith(".pdf") ||
        href.endsWith(".java") ||
        /tree/i.test(href)
      ) {
        const urlAbs = new URL(href, url).toString();
        assets.push({ name: ($(a).text() || href).trim(), url: urlAbs });
      }
    });

    const data = {
      metadata: { fetched_at: new Date().toISOString(), source: url },
      active_hashes: active,
      longest_chain,
      summary,
      assets,
    };
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`hash-ui proxy listening on http://localhost:${PORT}`);
});
