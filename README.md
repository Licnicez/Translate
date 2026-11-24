# clipvoice

Paste a YouTube link (or share one from the YouTube app) and watch the video with
synced dual subtitles: your language on top, the original under it. The first
minute or two is translated first, so playback starts in a few seconds while the
rest streams in.

## Run

    npm install
    npm run build
    npm start          # http://localhost:8787

While developing: `npm run dev` (Vite on http://localhost:5173, API on 8787).

## Better translations

Without a key it uses Google Translate's free endpoint (literal, weak on slang).
For Gemini, copy `.env.example` to `.env` and set `GEMINI_API_KEY`. The free tier allows about 20 requests a day per model (two or three videos); enable billing on the key for real use. Any chunk Gemini cannot answer in time falls back to Google Translate.

## Layout

- `apps/server` – Hono API: captions → sentences → chunked translation → SSE
- `apps/web` – React + Vite + Tailwind PWA
- `docs/ARCHITECTURE.md` – structure, API contract, plan; `docs/schema.sql` – cache schema

## Docker

    docker compose up --build -d      # http://localhost:8787
    docker compose logs -f            # watch the server
    docker compose down               # stop

The key and model list are read from `.env` (optional). After changing code or
`.env`, run `docker compose up --build -d` again.

## Vercel (site) + your PC (API)

The site deploys to Vercel from this repo (`vercel.json` builds `apps/web`; keep the
project's root directory at the repo root). Vercel serves only the site: translation
runs on the Docker server on your PC, reached through a tunnel (Tailscale Funnel,
Cloudflare Tunnel or ngrok).

1. Set `ACCESS_CODE` in `.env` and run the Docker server.
2. Expose port 8787 through the tunnel.
3. Open the Vercel site, choose "set up server", and enter the tunnel address and the code.
   Each browser remembers them.
