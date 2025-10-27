import React, { useEffect, useState, useRef } from "react";
import ActiveTable from "./components/ActiveTable";
import { fetchRemoteState } from "./scrapeClient";

function normalizeRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0)
    return { headers: [], rows: [] };
  const [first, ...rest] = rows;
  const headers = first.cells || [];
  const data = rest.map((r) => {
    const cells = r.cells || [];
    const obj = {};
    headers.forEach((h, i) => {
      obj[h || `c${i}`] = cells[i] ?? null;
    });
    return obj;
  });
  return { headers, rows: data };
}

export default function App() {
  const [state, setState] = useState(null);
  const [status, setStatus] = useState("");
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef(null);

  async function load() {
    setStatus("loading remote...");
    try {
      const j = await fetchRemoteState({
        url: targetUrl,
        corsProxy: corsProxy,
      });
      setState(j);
      setStatus("loaded remote");
    } catch (e) {
      setState(null);
      // Provide clearer guidance for common CORS/network errors
      let hint = "";
      if (e instanceof TypeError) {
        hint =
          " — possible CORS or network error. Try adding a CORS proxy prefix or load a local state.json file.";
      }
      setStatus(`fetch failed: ${e.message}${hint}`);
    }
  }

  function handleFileChange(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const j = JSON.parse(ev.target.result);
        setState(j);
        setStatus(`loaded from ${f.name}`);
      } catch (err) {
        setStatus("failed to parse JSON: " + err.message);
      }
    };
    reader.onerror = (err) => setStatus("file read error: " + err);
    reader.readAsText(f);
  }

  function openFileDialog() {
    fileInputRef.current && fileInputRef.current.click();
  }

  async function scrape() {
    // kept for compatibility; for frontend-only we map scrape to load
    setStatus("fetching remote...");
    await load();
  }

  useEffect(() => {
    // Auto-load once on page open/reload. We'll try stored corsProxy first,
    // then try fallbacks (local proxy, public proxy). Successful proxy is saved to localStorage.
    async function autoLoad() {
      setStatus("auto-loading...");
      const stored = localStorage.getItem("corsProxy") || "";
      const tried = [];
      // try direct first (works when CORS allows)
      let lastErr = null;
      try {
        const j = await fetchRemoteState({ url: targetUrl, corsProxy: "" });
        setState(j);
        setStatus("loaded remote directly");
        localStorage.removeItem("corsProxy");
        return;
      } catch (e) {
        lastErr = e;
      }

      const fallbacks = [
        stored,
        "http://localhost:3000/scrape?url=",
        "https://api.allorigins.win/raw?url=",
      ];
      for (const p of fallbacks) {
        if (!p) continue;
        tried.push(p);
        try {
          const j = await fetchRemoteState({ url: targetUrl, corsProxy: p });
          setState(j);
          setStatus("loaded remote via proxy: " + p);
          localStorage.setItem("corsProxy", p);
          setCorsProxy(p);
          return;
        } catch (e) {
          lastErr = e;
        }
      }

      setStatus(
        `auto-load failed: ${
          lastErr?.message || "unknown"
        }. Tried: ${tried.join(", ")}`
      );
    }
    autoLoad();
  }, []);

  const [targetUrl, setTargetUrl] = useState("http://hash.h10a.de/");
  const [corsProxy, setCorsProxy] = useState(
    () => localStorage.getItem("corsProxy") || ""
  );

  const active = state?.active_hashes || [];
  const chain = state?.longest_chain || { entries: [] };
  const summary = state?.summary || [];

  return (
    <div className="app">
      <header>
        <h1>Hash H10A — Improved UI</h1>
        <div className="controls">
          <input
            style={{ width: "360px" }}
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
          />
          <input
            style={{ width: "300px" }}
            placeholder="Optional CORS proxy prefix (e.g. https://api.allorigins.win/raw?url=)"
            value={corsProxy}
            onChange={(e) => setCorsProxy(e.target.value)}
          />
          <button onClick={load}>Fetch remote</button>

          {/* Hidden file input for loading local state.json */}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          <button onClick={openFileDialog}>Load local state.json</button>
          <span style={{ color: "#666", marginLeft: 8 }}>{fileName}</span>

          <button
            onClick={() => {
              setState(null);
              setStatus("cleared");
              setFileName("");
            }}
          >
            Clear
          </button>
          <span className="status">{status}</span>
        </div>
      </header>

      <section>
        <h2>Active Hashes</h2>
        <ActiveTable rows={active} />
      </section>

      <section>
        <h2>Longest Chain</h2>
        <div className="chain">
          {chain.root_hash && (
            <p>
              <strong>Root:</strong> <code>{chain.root_hash}</code>
            </p>
          )}
          <ActiveTable rows={chain.entries} />
        </div>
      </section>

      <section>
        <h2>Summary</h2>
        <ActiveTable rows={summary} />
      </section>

      <section>
        <h2>Assets</h2>
        <div className="assets">
          {(state?.assets || []).map((a) => (
            <div key={a.url}>
              <a href={a.url} target="_blank" rel="noreferrer">
                {a.name}
              </a>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
