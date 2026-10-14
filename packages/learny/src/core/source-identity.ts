/** Parameters that identify a visit rather than the material at an address. */
const TRACKING_PARAM = /^(utm_[a-z]+|spm|from|ref|ref_src|ref_url|source|share_source|share_token|fbclid|gclid|igshid|mc_cid|mc_eid|_hsenc|_hsmi|scene|chksm|sessionid|srcid|clicktime|enterid|mkt_tok|ws_call_id)$/i

/**
 * Identity of the material at an address: lower-case host without `www`, https,
 * no credentials, no fragment, no tracking parameters, stable query order.
 *
 * Search gateways tag the pages they retrieved (`#ws_call_id=…`, `?utm_source=…`),
 * and the same page is often reached through several of those tags. Identity is
 * what tells Learny that two hits are one piece of material, so a tagged address
 * must not become a second source — and a page already read must be recognized
 * on the next research run. Returns null for anything that is not a plain
 * HTTP(S) page.
 */
export function sourceIdentity(raw: string): string | null {
  let url: URL
  try { url = new URL(raw.trim()) } catch { return null }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.username || url.password) return null
  url.hash = ''
  url.protocol = 'https:'
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '')
  if (url.port === '80' || url.port === '443') url.port = ''
  for (const key of [...url.searchParams.keys()]) if (TRACKING_PARAM.test(key)) url.searchParams.delete(key)
  url.searchParams.sort()
  return `${url.host}${url.pathname.replace(/\/+$/, '')}${url.search}`
}
