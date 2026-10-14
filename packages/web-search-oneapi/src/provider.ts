import { WebError } from '@deepseek-ai/dsh-web'
import type { WebSearchProvider, WebSearchRequest, WebSearchResult, WebSearchSource } from '@deepseek-ai/dsh-web'

export type SearchApi = 'responses' | 'anthropic-messages' | 'chat-completions'
export interface SearchOptions {
  baseURL: string
  model: string
  api: SearchApi
  apiKey?: string
  apiKeyEnv?: string
  resolveApiKey?: () => Promise<string | undefined>
  headers?: Record<string, string>
  requestBody?: Record<string, unknown>
  maxTokens: number
  timeoutMs: number
}
type ObjectValue = Record<string, unknown>
const object = (value: unknown): ObjectValue => value && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : {}
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : []
const string = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim() : undefined

function sourceFrom(value: unknown): WebSearchSource | undefined {
  const item = typeof value === 'string' ? { url: value } : object(value)
  // Chat Completions uses nested url_citation; Responses uses flat annotations.
  const citation = item.type === 'url_citation' && item.url_citation ? object(item.url_citation) : item
  const raw = string(citation.url)
  if (!raw) return
  let url: URL
  try { url = new URL(raw) } catch { return }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return
  // OneAPI tags retrieved pages with a correlation token (`#ws_call_id=...`, or
  // the same key in the query string). It is transport bookkeeping, not part of
  // the source, and it would defeat de-duplication between repeated page opens.
  if (url.searchParams.has('ws_call_id')) url.searchParams.delete('ws_call_id')
  if (url.hash.startsWith('#ws_call_id=')) url.hash = ''
  const title = string(citation.title)
  const snippet = string(citation.snippet) ?? string(citation.cited_text)
  const date = string(citation.publishedAt) ?? string(citation.published_at)
  return { url: url.href, ...(title ? { title } : {}), ...(snippet ? { snippet } : {}),
    ...(date && Number.isFinite(Date.parse(date)) ? { publishedAt: date } : {}) }
}

/** Accept upstream retrieval metadata only. Generated prose/JSON/Markdown links
 * are not proof of a search and must never become learning evidence. */
export function mapOneApiResponse(value: unknown, maxResults?: number): WebSearchResult {
  const body = object(value)
  if (body.status !== undefined && body.status !== 'completed') {
    throw new WebError('OneAPI search response did not complete', 'WEB_PROVIDER_ERROR')
  }
  const candidates: unknown[] = []
  const content: string[] = []
  let searched = false
  let incomplete = ''
  const collect = (items: unknown) => {
    if (!Array.isArray(items)) return
    searched = true
    candidates.push(...items)
  }
  collect(body.search_results)
  collect(body.sources)
  collect(body.documents)
  collect(object(body.data).search_results)
  collect(object(body.data).sources)
  collect(body.citations)
  for (const raw of array(body.output)) {
    const item = object(raw)
    if (item.type === 'web_search_call') {
      // A gateway may report one unfinished native call next to completed ones.
      // Skip it so usable retrieval evidence still reaches the caller, and keep
      // the status for the failure below when nothing usable came back.
      if (item.status !== 'completed') { incomplete = incomplete || String(item.status ?? 'unknown'); continue }
      searched = true
      const action = object(item.action)
      collect(action.sources)
      // OneAPI Responses may expose the retrieved pages as a sequence of
      // completed `open_page` calls instead of copying them to
      // `web_search_call.action.sources`. The URL is still retrieval metadata
      // produced by the provider, so it is safe to use as a source. Do not
      // parse URLs from the generated answer text.
      if (action.type === 'open_page' && string(action.url)) collect([{ url: string(action.url) }])
    }
    if (item.type === 'message') for (const rawPart of array(item.content)) {
      const part = object(rawPart)
      collect(part.annotations)
      if (part.type === 'output_text' && string(part.text)) content.push(string(part.text)!)
    }
  }
  for (const raw of array(body.content)) {
    const block = object(raw)
    if (block.type === 'web_search_tool_result') {
      searched = true
      const error = object(block.content)
      if (error.type === 'web_search_tool_result_error') throw new WebError('OneAPI native search tool returned an error', 'WEB_PROVIDER_ERROR')
      collect(array(block.content).filter(item => object(item).type === 'web_search_result'))
    }
    if (block.type === 'text') {
      collect(block.citations)
      if (string(block.text)) content.push(string(block.text)!)
    }
  }
  for (const raw of array(body.choices)) {
    const message = object(object(raw).message)
    collect(message.annotations)
    collect(message.citations)
    collect(message.search_results)
    if (string(message.content)) content.push(string(message.content)!)
  }
  const byURL = new Map<string, WebSearchSource>()
  for (const item of candidates) {
    const source = sourceFrom(item)
    if (source) byURL.set(source.url, { ...byURL.get(source.url), ...source })
  }
  const sources = [...byURL.values()]
  if (!searched || sources.length === 0) {
    if (incomplete) throw new WebError(`OneAPI web search did not complete (native call status: ${incomplete})`, 'WEB_PROVIDER_ERROR')
    throw new WebError('OneAPI returned no usable search metadata. Select a search-enabled model/channel that preserves native search results or citation annotations; generated answer links are not search evidence.', 'WEB_SEARCH_METADATA_MISSING')
  }
  return { ...(content.length ? { content: content.join('\n') } : {}), sources: maxResults === undefined ? sources : sources.slice(0, maxResults),
    truncated: maxResults !== undefined && sources.length > maxResults }
}

export function searchEndpoint(baseURL: string, api: SearchApi): string {
  const url = new URL(baseURL)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new WebError('OneAPI baseURL must be an HTTP(S) API base without credentials, query or fragment', 'WEB_PROVIDER_CONFIG_ERROR')
  }
  const base = url.pathname.replace(/\/+$/, '')
  url.pathname = `${base.endsWith('/v1') ? base : `${base}/v1`}/${api === 'responses' ? 'responses' : api === 'anthropic-messages' ? 'messages' : 'chat/completions'}`
  return url.href
}

/** Some OneAPI channels force SSE despite stream:false. Reconstruct only
 * completed native responses, retaining retrieval metadata and citations. */
export function decodeSearchStream(raw: string): unknown {
  const events = raw.split(/\r?\n\r?\n/).flatMap(frame => {
    const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n')
    if (!data || data === '[DONE]') return []
    return [object(JSON.parse(data))]
  })
  const blocks: ObjectValue[] = []
  let message: ObjectValue = {}
  const chat: ObjectValue = { content: '', annotations: [] }
  let complete = false
  for (const event of events) {
    if (['error', 'response.failed', 'response.incomplete'].includes(String(event.type))) {
      throw new WebError('OneAPI search stream reported failure or incomplete output', 'WEB_PROVIDER_ERROR')
    }
    if (event.type === 'response.completed') return event.response
    if (event.type === 'message_start') message = object(event.message)
    if (event.type === 'content_block_start') blocks[Number(event.index)] = { ...object(event.content_block) }
    if (event.type === 'content_block_delta') {
      const block = blocks[Number(event.index)]
      const delta = object(event.delta)
      if (block && delta.type === 'text_delta') block.text = String(block.text ?? '') + String(delta.text ?? '')
      if (block && delta.type === 'citations_delta') block.citations = [...array(block.citations), delta.citation]
    }
    if (event.type === 'message_stop') complete = true
    for (const rawChoice of array(event.choices)) {
      const choice = object(rawChoice)
      const delta = object(choice.delta)
      if (typeof delta.content === 'string') chat.content = String(chat.content) + delta.content
      for (const field of ['annotations', 'citations', 'search_results']) {
        if (Array.isArray(delta[field])) chat[field] = [...array(chat[field]), ...array(delta[field])]
      }
      if (choice.finish_reason) complete = true
    }
  }
  if (!complete) throw new WebError('OneAPI search stream ended before completion', 'WEB_PROVIDER_ERROR')
  return blocks.length ? { ...message, content: blocks } : { choices: [{ message: chat }] }
}

async function readResponse(response: Response): Promise<unknown> {
  const kind = response.headers.get('content-type') ?? ''
  if (!kind.includes('application/json') && !kind.includes('text/event-stream')) {
    await response.body?.cancel()
    throw new WebError('OneAPI search expected JSON or SSE; verify the API base path', 'WEB_PROVIDER_ERROR')
  }
  if (!response.body) throw new WebError('OneAPI search returned an empty body', 'WEB_PROVIDER_ERROR')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let raw = ''
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > 4 * 1024 * 1024) throw new WebError('OneAPI search exceeded the response size limit', 'WEB_PROVIDER_ERROR')
      raw += decoder.decode(chunk.value, { stream: true })
    }
    raw += decoder.decode()
    return kind.includes('text/event-stream') ? decodeSearchStream(raw) : JSON.parse(raw)
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}

function requestBody(options: SearchOptions, query: string): ObjectValue {
  const prompt = `Search the web for: ${query}. Open at least three relevant authoritative source pages to verify the results. Keep the answer brief and cite the retrieved sources.`
  const native = options.api === 'responses'
    ? { input: prompt, tools: [{ type: 'web_search' }], tool_choice: 'required', include: ['web_search_call.action.sources'], max_output_tokens: options.maxTokens }
    : options.api === 'anthropic-messages'
      ? { messages: [{ role: 'user', content: prompt }], tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }], max_tokens: options.maxTokens }
      : { messages: [{ role: 'user', content: prompt }], max_tokens: options.maxTokens }
  // Extras customize native tool type / provider-specific enable_search flags.
  // Never allow them to replace the selected model, query or streaming contract.
  const { model: _model, input: _input, messages: _messages, stream: _stream, ...extras } = options.requestBody ?? {}
  return { ...native, ...extras, model: options.model, stream: false }
}

function aborted(signal: AbortSignal): never {
  throw new WebError(signal.reason?.name === 'TimeoutError' ? 'OneAPI web search timed out' : 'OneAPI web search aborted',
    signal.reason?.name === 'TimeoutError' ? 'WEB_TIMEOUT' : 'WEB_ABORTED')
}

function withSignal<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) aborted(signal)
  return new Promise((resolve, reject) => {
    const cancel = () => { try { aborted(signal) } catch (error) { reject(error) } }
    signal.addEventListener('abort', cancel, { once: true })
    Promise.resolve().then(operation).then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel))
  })
}

export class OneApiSearchProvider implements WebSearchProvider {
  readonly id = 'oneapi'
  private readonly resolveOptions: () => SearchOptions
  private readonly fetcher: typeof fetch
  constructor(resolveOptions: () => SearchOptions, fetcher: typeof fetch = fetch) {
    this.resolveOptions = resolveOptions
    this.fetcher = fetcher
  }

  available(): boolean {
    try {
      const options = this.resolveOptions()
      searchEndpoint(options.baseURL, options.api)
      return Boolean(options.model && (options.apiKey || options.resolveApiKey))
    } catch { return false }
  }

  async search(request: WebSearchRequest, callerSignal?: AbortSignal): Promise<WebSearchResult> {
    // Snapshot once so a settings edit cannot mix endpoint and credentials.
    const options = this.resolveOptions()
    const signal = AbortSignal.any([...(callerSignal ? [callerSignal] : []), AbortSignal.timeout(options.timeoutMs)])
    if (signal.aborted) aborted(signal)
    if (!request.query.trim() || (request.maxResults !== undefined && (!Number.isInteger(request.maxResults) || request.maxResults < 1))) {
      throw new WebError('Search requires a nonempty query and positive maxResults', 'WEB_PROVIDER_CONFIG_ERROR')
    }
    const endpoint = searchEndpoint(options.baseURL, options.api)
    if (!options.model) throw new WebError('Configure web-search-oneapi.model with a search-enabled model ID', 'WEB_PROVIDER_CONFIG_ERROR')
    try {
      const key = options.apiKey || await withSignal(async () => options.resolveApiKey?.(), signal)
      if (signal.aborted) aborted(signal)
      if (!key) throw new WebError(`OneAPI search credential is missing: ${options.apiKeyEnv ?? 'ONEAPI_API_KEY'}`, 'WEB_PROVIDER_CREDENTIAL_MISSING')
      const headers = new Headers(options.headers)
      headers.set('authorization', `Bearer ${key}`)
      if (options.api === 'anthropic-messages') {
        headers.set('x-api-key', key)
        if (!headers.has('anthropic-version')) headers.set('anthropic-version', '2023-06-01')
      }
      headers.set('content-type', 'application/json')
      headers.set('accept', 'application/json')
      const response = await withSignal(() => this.fetcher(endpoint, { method: 'POST', redirect: 'error', headers,
        body: JSON.stringify(requestBody(options, request.query)), signal }), signal)
      if (signal.aborted) aborted(signal)
      if (!response.ok) {
        // Avoid echoing response bodies that may contain credentials or private data.
        await response.body?.cancel()
        throw new WebError(`OneAPI web search failed (HTTP ${response.status}); verify the search model/channel and authorization`, 'WEB_PROVIDER_ERROR')
      }
      const body = await withSignal(() => readResponse(response), signal)
      if (signal.aborted) aborted(signal)
      if (object(body).error) throw new WebError('OneAPI returned an API error', 'WEB_PROVIDER_ERROR')
      return mapOneApiResponse(body, request.maxResults)
    } catch (error) {
      if (signal.aborted) aborted(signal)
      if (error instanceof WebError) throw error
      throw new WebError('OneAPI web search request or response failed; check the configured provider', 'WEB_PROVIDER_ERROR')
    }
  }
}
