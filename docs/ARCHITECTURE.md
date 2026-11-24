# clipvoice architecture

A PWA that plays a YouTube video with synced dual-language subtitles (original + translated), streaming the translation while the video plays.

Stack chosen from the brief: **Hono on Node** for the API (keeps one language across the repo and reuses the working Node transcript reader), **React + Vite + Tailwind v4 + vite-plugin-pwa** for the client, **YouTube IFrame Player API** for playback, **Gemini Flash** (`GEMINI_MODEL`, a comma-separated list tried in order; default `gemini-3.8-flash,gemini-3.5-flash`, since 2.5 Flash is closed to new keys) with structured JSON output for translation (Google Translate's free endpoint is the fallback when no key is set).

## 1. Folder structure

```
clipvoice/
├─ package.json                 npm workspaces + dev/build/start scripts
├─ .env.example                 server settings (copy to .env)
├─ docs/
│  ├─ ARCHITECTURE.md           this file
│  └─ schema.sql                Postgres (Supabase) cache schema
├─ apps/
│  ├─ server/                   Hono API
│  │  └─ src/
│  │     ├─ index.js            routes, static hosting of the built PWA
│  │     ├─ config.js           env settings
│  │     ├─ videoId.js          URL → 11-char id
│  │     ├─ transcript/
│  │     │  ├─ index.js         provider chain (tier 1, then tier 2)
│  │     │  ├─ youtube.js       tier 1: captions / auto captions
│  │     │  └─ stt.js           tier 2: speech-to-text (stub, not built)
│  │     ├─ merge.js            auto-caption fragments → sentences
│  │     ├─ translate/
│  │     │  ├─ index.js         picks a translator, retries, fallback
│  │     │  ├─ gemini.js        Gemini structured JSON output
│  │     │  └─ google.js        free Google endpoint (fallback)
│  │     ├─ cache.js            cache interface + in-memory impl
│  │     └─ jobs.js             one shared translation job per (video, lang)
│  └─ web/                      React PWA
│     ├─ index.html
│     ├─ vite.config.js         PWA manifest, share target, /api proxy
│     └─ src/
│        ├─ main.jsx, App.jsx
│        ├─ components/         LinkForm, Player, Transcript, History
│        ├─ lib/
│        │  ├─ stream.js        SSE client with resume + backoff
│        │  ├─ idb.js           IndexedDB: subtitles + watch history
│        │  ├─ sync.js          binary search for the active line
│        │  ├─ youtube.js       IFrame API loader, id parser
│        │  └─ langs.js         target languages
│        └─ styles/             tokens.css, base.css, app.css (Tailwind)
```

## 2. API contract

### `GET /api/stream?v={videoId|url}&to={lang}&from={chunk}`

`Content-Type: text/event-stream`. Starts (or joins) the translation job for `(videoId, to)` and streams chunks **in order**. `from` (or the `Last-Event-ID` header the browser sends on reconnect) skips chunks the client already has.

| event | `id` | `data` |
|---|---|---|
| `meta` | – | `{ videoId, targetLang, sourceLang, totalSegments, totalChunks, duration, cached, translator }` |
| `chunk` | chunk index | `{ chunk, segments: Segment[] }` |
| `done` | – | `{ totalSegments }` |
| `error` | – | `{ code, message, retryable }` |

A comment line (`: ping`) is sent every 15 s to keep proxies from closing the stream.

```ts
type Segment = {
  index: number      // position in the whole video, 0-based, never changes
  start: number      // seconds
  end: number        // seconds
  original: string
  translated: string
}
```

Error codes: `bad_url` (400), `no_captions` (422), `transcript_failed` (502, retryable), `translate_failed` (502, retryable).

### `GET /api/transcript?v=…&to=…`

The finished result from the server cache, or `404 { code: "not_cached" }`. Same `meta` fields plus `segments: Segment[]`.

### Share target

The manifest declares `share_target: { action: "/share", method: "GET", params: { title, text, url } }`. The client reads the YouTube link out of `url` or `text` on `/share` and starts it.

### Translator contract (internal)

Gemini is called once per chunk with a response schema of `{ items: [{ index: integer, translated: string }] }`. Timestamps never go to the model, so they cannot drift; the server joins the answer back to its own segments by `index`. Lines missing from the answer are filled by the fallback translator.

## 3. Database schema (cache)

The MVP ships an in-memory cache behind `cache.js`'s `get/set` interface. Production swaps in Upstash Redis (hot, TTL'd) in front of Supabase Postgres (durable). See [`schema.sql`](schema.sql).

- Redis key: `tr:{videoId}:{lang}:{translator}` → the JSON result, TTL 7 days.
- Postgres keeps the transcript once per video and one translation row per language, so a second language re-uses the extracted transcript.

## 4. Implementation plan

**MVP (built now)**
1. Tier 1 transcript, merged into sentences.
2. Chunked translation (25 sentences a chunk), first chunk translated alone so playback can start, the rest 3 at a time, emitted in order over SSE.
3. Shared job per `(video, lang)` so a reconnect or a second viewer joins the running job instead of paying twice.
4. Client: SSE with resume from the last chunk, IndexedDB copy of every chunk, watch history, binary-search sync every 150 ms, dual subtitles over the video and under it, pseudo-fullscreen for iOS, share target.

**Next**
5. Supabase + Upstash adapters for `cache.js` (schema ready).
6. Seek-aware priority: when the viewer jumps past the translated range, translate that chunk next.
7. Transcript proxy: `youtube.js` takes a `fetch` override, so a residential proxy or a third-party transcript API plugs in there.
8. Tier 2 speech-to-text (`stt.js`) with Groq Whisper or Deepgram. Needs an audio source; downloading YouTube audio is against YouTube's terms, so decide on that before building it.
9. Live streams: poll the growing caption track and stream new chunks.
