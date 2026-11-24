/**
 * Where the API lives. Same origin by default (Docker, dev proxy). On a static host
 * like Vercel the viewer sets the address of their own server (e.g. a tunnel to a
 * home PC) once; VITE_API_URL can bake in a default at build time.
 */
const read = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const write = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* storage blocked */ } };

/** Skips ngrok's free-plan warning page, which would otherwise answer API calls with HTML. */
export const API_HEADERS = { 'ngrok-skip-browser-warning': '1' };

export const BUILT_IN =(import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export function getServer() {
  return { url: (read('cv-server') || BUILT_IN).replace(/\/+$/, ''), code: read('cv-code') };
}
export function setServer({ url, code }) {
  write('cv-server', normalize(url));
  write('cv-code', (code || '').trim());
}

export function normalize(url) {
  const s = String(url || '').trim().replace(/\/+$/, '');
  if (!s) return '';
  return /^https?:\/\//.test(s) ? s : 'https://' + s;
}

/** Same-origin hosting needs no address; a static deploy without one cannot translate. */
export const needsServer = () => !getServer().url && !sameOriginApi();
export const sameOriginApi = () => !/\.vercel\.app$/.test(location.hostname) && !BUILT_IN && import.meta.env.VITE_STATIC !== '1';

export function apiUrl(path, params = {}, server = getServer()) {
  const qs = new URLSearchParams(params);
  if (server.code) qs.set('key', server.code);
  return `${server.url}${path}?${qs}`;
}

/** Ping the server: { ok, needsCode, codeOk, translator } or throws with a readable message. */
export async function checkServer(server = getServer()) {
  let res;
  try {
    res = await fetch(apiUrl('/api/health', {}, server), { headers: API_HEADERS, signal: AbortSignal.timeout(6000) });
  } catch {
    throw new Error(server.url
      ? `Can’t reach the server at ${server.url}. Is the PC on, with Docker and the tunnel running?`
      : 'Can’t reach the server. Is it running?');
  }
  if (!res.ok) throw new Error(`The server answered ${res.status}. Check the address in server settings.`);
  const h = await res.json().catch(() => null);
  if (!h?.ok) throw new Error('That address answered, but it is not a clipvoice server.');
  if (h.needsCode && !h.codeOk) throw Object.assign(new Error(server.code ? 'That access code is wrong.' : 'This server needs an access code.'), { code: 'unauthorized' });
  return h;
}
