from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
import os
import subprocess
import json
from pathlib import Path

BASE = Path(__file__).parent
DATA_DIR = BASE / "data"
STATE_PATH = DATA_DIR / "state.json"
SCRAPER = BASE / "scrape_hash_h10a.py"

app = FastAPI(title="Hash H10A Proxy")

# If a frontend build exists under frontend/dist, serve it as the root app.
FRONTEND_DIST = BASE / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")
else:
    # fallback: serve the simple static prototype
    app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")


@app.get("/", response_class=HTMLResponse)
def index():
    # return the built index if present, otherwise the fallback static index
    built = FRONTEND_DIST / "index.html"
    if built.exists():
        return FileResponse(built)
    index_file = BASE / "static" / "index.html"
    if not index_file.exists():
        return HTMLResponse("<h1>Frontend not found</h1>")
    return FileResponse(index_file)


@app.get("/state")
def get_state():
    if not STATE_PATH.exists():
        raise HTTPException(status_code=404, detail="State not found. Run /scrape first.")
    with open(STATE_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    return JSONResponse(data)


@app.post("/scrape")
def run_scrape():
    # run the local scraper script synchronously
    if not SCRAPER.exists():
        raise HTTPException(status_code=500, detail="Scraper not found")
    try:
        # use same python interpreter
        res = subprocess.run(["python3", str(SCRAPER)], cwd=str(BASE), capture_output=True, text=True, timeout=60)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    if res.returncode != 0:
        raise HTTPException(status_code=500, detail=f"Scraper failed: {res.stderr[:1000]}")
    if not STATE_PATH.exists():
        raise HTTPException(status_code=500, detail="Scraper ran but state file missing")
    with open(STATE_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    return JSONResponse({"status": "ok", "written": str(STATE_PATH), "items": len(data.get("active_hashes", []))})
