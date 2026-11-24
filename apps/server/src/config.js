const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

export const config = {
  port: num(process.env.PORT, 8787),
  geminiKey: process.env.GEMINI_API_KEY || '',
  // Comma-separated, tried in order: a busy (503/429) or retired (404) model hands over to the next.
  geminiModels: (process.env.GEMINI_MODEL || 'gemini-3.8-flash,gemini-3.5-flash').split(',').map((s) => s.trim()).filter(Boolean),
  chunkSize: num(process.env.CHUNK_SIZE, 25),
  // Optional shared code the site must send; protects the Gemini quota once the API is public.
  accessCode: process.env.ACCESS_CODE || '',
  // Origins allowed to call the API from a browser, comma-separated; '*' allows any.
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean),
  concurrency: 3,
};
