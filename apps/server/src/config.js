const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

export const config = {
  port: num(process.env.PORT, 8787),
  geminiKey: process.env.GEMINI_API_KEY || '',
  // Comma-separated, tried in order: a busy (503/429) or retired (404) model hands over to the next.
  geminiModels: (process.env.GEMINI_MODEL || 'gemini-3.8-flash,gemini-3.5-flash').split(',').map((s) => s.trim()).filter(Boolean),
  chunkSize: num(process.env.CHUNK_SIZE, 25),
  concurrency: 3,
};
