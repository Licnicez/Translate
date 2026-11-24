import { config } from '../config.js';

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { index: { type: 'INTEGER' }, translated: { type: 'STRING' } },
        required: ['index', 'translated'],
      },
    },
  },
  required: ['items'],
};

const instructions = (to) => `You translate video subtitles into the language with code "${to}".
Translate meaning and tone, not word by word: render idioms, slang, jokes and sarcasm the way a native speaker of "${to}" would say them.
Keep each line short enough to read as a subtitle. Keep names, brands and on-screen terms as they are.
Return exactly one item per input line, with the same index. Never merge, split, drop or reorder lines.`;

/** model → time it may be tried again after a 503/429/404 */
const busyUntil = new Map();

export function gemini() {
  return {
    name: 'gemini',
    /**
     * items: { index, original }[]; context: the previous chunk's last lines, for continuity.
     * Returns Map<index, translated>.
     */
    async translate(items, to, context = [], { timeoutMs = 30_000 } = {}) {
      const signal = AbortSignal.timeout(timeoutMs);
      const prompt = [
        context.length ? 'Earlier lines, for context only (do not translate):\n' + context.map((c) => '- ' + c).join('\n') : '',
        'Lines to translate (JSON):',
        JSON.stringify(items.map(({ index, original }) => ({ index, text: original }))),
      ].filter(Boolean).join('\n\n');

      // Subtitles need no reasoning: minimal thinking cuts a chunk from ~10 s to ~6 s.
      const body = (thinking) => JSON.stringify({
        systemInstruction: { parts: [{ text: instructions(to) }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3, responseMimeType: 'application/json', responseSchema: SCHEMA,
          ...(thinking && { thinkingConfig: { thinkingLevel: 'minimal' } }),
        },
      });
      const call = (model, thinking) => fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': config.geminiKey }, body: body(thinking), signal },
      );

      let res;
      const models = config.geminiModels.filter((m) => !(busyUntil.get(m) > Date.now()));
      // Every model busy or rate-limited: fail now so the fallback answers without a wait.
      if (!models.length) throw new Error('all gemini models busy');
      for (const model of models) {
        res = await call(model, true);
        if (res.status === 400) res = await call(model, false); // model without thinking levels
        if (res.ok || ![404, 429, 500, 503].includes(res.status)) break;
        // A spent daily quota says how long until it resets; don't ask again before then.
        const body = await res.clone().text().catch(() => '');
        const perDay = res.status === 429 && /PerDay|per day/i.test(body);
        const wait = perDay ? (Number(body.match(/"retryDelay":\s*"(\d+)s"/)?.[1]) || 3600) * 1000 : 60_000;
        busyUntil.set(model, Date.now() + wait);
        console.warn(`[gemini] ${model} answered ${res.status}${perDay ? ' (daily quota used up)' : ''}, skipping it for ${Math.round(wait / 60000)} min`);
      }
      if (!res.ok) throw new Error('gemini ' + res.status + ': ' + (await res.text()).slice(0, 200));
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
      const parsed = JSON.parse(text);
      const map = new Map();
      for (const it of parsed.items || []) {
        if (Number.isInteger(it.index) && typeof it.translated === 'string' && it.translated.trim()) map.set(it.index, it.translated.trim());
      }
      return map;
    },
  };
}
