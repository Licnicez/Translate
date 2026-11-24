/**
 * Cache interface: get(key) → value | undefined, set(key, value).
 * The MVP keeps results in memory. Swap in a Redis (Upstash) + Postgres (Supabase)
 * implementation with the same two methods; schema in docs/schema.sql.
 */
export function memoryCache(limit = 200) {
  const m = new Map();
  return {
    async get(key) {
      const v = m.get(key);
      if (v !== undefined) { m.delete(key); m.set(key, v); }
      return v;
    },
    async set(key, value) {
      m.set(key, value);
      if (m.size > limit) m.delete(m.keys().next().value);
    },
  };
}

export const cache = memoryCache();
export const cacheKey = (videoId, lang, translator) => `tr:${videoId}:${lang}:${translator}`;
