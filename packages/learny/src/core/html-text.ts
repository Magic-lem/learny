/**
 * Text of a fetched HTML page, without its markup.
 *
 * `ctx.web.fetch` returns the decoded response body, so an HTML page arrives as
 * markup and a naive slice stores `<!doctype html>…` as learning material. This
 * extraction keeps the prose the model should summarize: script/style/head and
 * chrome are dropped, the main region is preferred when the page marks one, block
 * boundaries become line breaks, list items keep a dash, and entities are
 * decoded. It is deliberately not a full HTML parser — the result feeds a
 * summarizing model, and the original URL stays available for verification.
 */
export function htmlToText(html: string, limit = 20_000): string {
  let text = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg|head|nav|footer|form|iframe|video|audio)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  const region = /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(text)?.[1] ?? /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(text)?.[1]
  if (region) text = region
  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|section|article|main|li|ul|ol|h[1-6]|tr|table|pre|blockquote|dd|dt|figure)>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
  return decodeEntities(text)
    .replace(/\r/g, '')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, limit)
}

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', times: '×', middot: '·', deg: '°', copy: '©', reg: '®', trade: '™', bull: '•', dagger: '†', half: '½', frac12: '½', laquo: '«', raquo: '»', euro: '€', pound: '£', yen: '¥', sect: '§', para: '¶', plusmn: '±', sup2: '²', sup3: '³' }

/** Browsers decode entities while reading; text kept otherwise shows `&amp;`. */
function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
    if (body.startsWith('#')) {
      const code = body[1]?.toLowerCase() === 'x' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
    }
    return NAMED[body.toLowerCase()] ?? match
  })
}
