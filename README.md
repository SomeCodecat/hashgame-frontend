# hash-ui — Prototype for a better UI for http://hash.h10a.de/

This prototype includes:

- `scrape_hash_h10a.py` — Python scraper that writes `data/state.json`.
- `app.py` — FastAPI app serving the frontend and endpoints `/state` and `/scrape`.
- `static/index.html` — Minimal fallback frontend that fetches `/state` and can trigger `/scrape`.
- `frontend/` — a Vite + React frontend (source). Build output will be `frontend/dist`.
- `requirements.txt` — Python dependencies.

Quick start (Linux / zsh):

1. Create and activate a virtualenv (optional but recommended):

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

2. Run the app with uvicorn:

```bash
uvicorn app:app --reload --port 8000
```

3. Open http://127.0.0.1:8000/ in your browser.

Usage notes:

- Click "Fetch fresh data (scrape)" to run the internal scraper. It will write `data/state.json`.
- The frontend reads `/state` to render tables.

Frontend (React + Vite)

A React + Vite frontend is included at `frontend/`. To run the frontend during development:

```bash
cd frontend
npm install
npm run dev
```

To build the frontend for the FastAPI server to serve:

```bash
cd frontend
npm install
npm run build
```

After `npm run build` the static files will be available under `frontend/dist` and the FastAPI app will serve them at `/`.

Next steps / improvements:

- Add a background scheduler to refresh state periodically.
- Harden parsers to map columns to named fields and normalize numeric values.
- Add tests for the scraper parsing logic.
- Improve the frontend with sorting, filtering and visualizations.
