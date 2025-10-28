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

## Static Deployment (GitHub Pages)

The `static/index.html` file is a fully standalone page that can be deployed to GitHub Pages or any static hosting service. It includes:

- **Client-side scraping** with CORS circumvention via a default proxy (`corsproxy.io`)
- **Customizable proxy** via URL parameter: `?proxy=https://your-proxy/?`
- **Fallback to snapshot** if a `state.json` file is deployed alongside

### Using Different CORS Proxies

By default, the page uses `https://corsproxy.io/?` to bypass CORS restrictions. You can use alternative proxies:

- `?proxy=https://api.allorigins.win/raw?url=` - AllOrigins proxy
- `?proxy=https://your-custom-proxy/?` - Your own proxy service

Example: `https://your-github-pages-url/static/index.html?proxy=https://api.allorigins.win/raw?url=`

### Deploying to GitHub Pages

1. Copy `static/index.html` to your GitHub Pages repository
2. (Optional) Deploy a pre-scraped `state.json` file for faster initial load
3. The page will automatically fetch live data using the CORS proxy

Next steps / improvements:

- Add a background scheduler to refresh state periodically.
- Harden parsers to map columns to named fields and normalize numeric values.
- Add tests for the scraper parsing logic.
- Improve the frontend with sorting, filtering and visualizations.
