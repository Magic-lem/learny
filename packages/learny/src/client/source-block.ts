/** Source IDs remain in the payload for provenance; the reader sees titles. */
export type SourceReference = { sourceId?: string; title: string; url?: string; note?: string }
export type SourcesBlock = { block: 'sources'; items: SourceReference[] }

/** Local file locations are readable labels; browsers cannot open file: links from HTTP. */
export function sourceHref(url: string | undefined): string | undefined {
  if (!url || /[\u0000-\u0020\u007f]/.test(url)) return undefined
  try {
    const parsed = new URL(url)
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) return undefined
    return parsed.href
  } catch { return undefined }
}

/** Bad payloads stay as visible code rather than mounting a broken source list. */
export function parseSourcesBlock(value: unknown): SourcesBlock | null {
  if (!value || typeof value !== 'object') return null
  const { block, items } = value as { block?: unknown; items?: unknown }
  if (block !== 'sources' || !Array.isArray(items) || !items.length || items.length > 100) return null
  const references: SourceReference[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object') return null
    const { sourceId, title, url, note } = item as Record<string, unknown>
    if (typeof title !== 'string' || !title.trim() || title.length > 500) return null
    if (url !== undefined && (typeof url !== 'string' || url.length > 8000)) return null
    if (note !== undefined && (typeof note !== 'string' || note.length > 2000)) return null
    if (sourceId !== undefined && (typeof sourceId !== 'string' || sourceId.length > 200)) return null
    references.push({ title: title.trim(), ...(url ? { url } : {}), ...(note ? { note } : {}), ...(sourceId ? { sourceId } : {}) })
  }
  return { block: 'sources', items: references }
}
