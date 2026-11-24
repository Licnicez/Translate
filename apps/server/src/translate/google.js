/** Fallback: Google Translate's free endpoint. Literal, weak on slang, no key needed. */
async function gtx(text, to) {
  const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&dt=t&tl=' + encodeURIComponent(to);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'q=' + encodeURIComponent(text),
  });
  if (!res.ok) throw new Error('google translate ' + res.status);
  const data = await res.json();
  return { text: data[0].map((p) => p[0]).join(''), from: data[2] || '' };
}

export const google = {
  name: 'google-free',
  /** lines: string[] → { lines: string[], sourceLang } */
  async translate(lines, to) {
    const r = await gtx(lines.join('\n'), to);
    let parts = r.text.split('\n');
    if (parts.length !== lines.length) {
      parts = [];
      for (const l of lines) parts.push((await gtx(l, to)).text);
    }
    return { lines: parts, sourceLang: r.from };
  },
};
