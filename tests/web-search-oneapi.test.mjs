import test from 'node:test'
import assert from 'node:assert/strict'
import { mapOneApiResponse, OneApiSearchProvider, decodeSearchStream, searchEndpoint } from '../packages/web-search-oneapi/src/provider.ts'
import { Config, apply } from '../packages/web-search-oneapi/src/index.ts'

const options = () => ({ api: 'responses', baseURL: 'https://gateway.example/v1', model: 'search-model', apiKey: 'secret-key', timeoutMs: 1000, maxTokens: 1024 })
const native = () => ({ output: [
  { type: 'web_search_call', status: 'completed', action: { sources: [{ url: 'https://kubernetes.io/docs/', title: 'Docs' }, { url: 'https://kubernetes.io/blog/' }] } },
  { type: 'message', content: [{ type: 'output_text', text: 'Retrieved answer', annotations: [{ type: 'url_citation', url: 'https://kubernetes.io/docs/', title: 'Kubernetes' }] }] },
] })
const responsesOpenPages = () => ({ output: [
  { type: 'web_search_call', status: 'completed', action: { type: 'search', queries: ['Kubernetes official documentation'] } },
  { type: 'web_search_call', status: 'completed', action: { type: 'open_page', url: 'https://kubernetes.io/docs/home/' } },
  { type: 'web_search_call', status: 'completed', action: { type: 'open_page', url: 'https://kubernetes.io/docs/concepts/overview/' } },
  { type: 'message', content: [{ type: 'output_text', text: 'Retrieved answer without citation annotations.' }] },
] })

test('OneAPI citations are normalized and de-duplicated', () => {
  const result = mapOneApiResponse({
    choices: [{ message: {
      content: 'Kubernetes search result',
      annotations: [{ type: 'url_citation', url: 'https://kubernetes.io/docs/', title: 'Kubernetes 文档' }],
    } }],
    search_results: [{ url: 'https://kubernetes.io/docs/', title: 'duplicate' }, { url: 'https://kubernetes.io/blog/' }],
  }, 2)
  assert.deepEqual(result.sources.map(source => source.url), ['https://kubernetes.io/docs/', 'https://kubernetes.io/blog/'])
  assert.equal(result.truncated, false)
})

test('OneAPI prose without explicit citations is rejected', () => {
  assert.throws(() => mapOneApiResponse({ choices: [{ message: { content: 'Kubernetes is a container platform.' } }] }), error => error.code === 'WEB_SEARCH_METADATA_MISSING')
  for (const content of ['[Docs](https://kubernetes.io/docs/)', JSON.stringify({ sources: [{ url: 'https://kubernetes.io/docs/' }] })]) {
    assert.throws(() => mapOneApiResponse({ choices: [{ message: { content } }] }), error => error.code === 'WEB_SEARCH_METADATA_MISSING')
  }
})

test('Responses native search metadata supports annotations and result bounds', () => {
  const result = mapOneApiResponse(native(), 1)
  assert.equal(result.sources.length, 1)
  assert.equal(result.sources[0].title, 'Kubernetes')
  assert.equal(result.truncated, true)
  assert.equal(result.content, 'Retrieved answer')
  assert.throws(() => mapOneApiResponse({ output: [{ type: 'web_search_call', status: 'failed' }] }))
})

test('Responses open_page calls become sources when action.sources is omitted', () => {
  const result = mapOneApiResponse(responsesOpenPages(), 1)
  assert.deepEqual(result.sources.map(source => source.url), ['https://kubernetes.io/docs/home/'])
  assert.equal(result.sources[0].title, undefined)
  assert.equal(result.truncated, true)
})

test('gateway ws_call_id tracking is stripped so repeated page opens de-duplicate', () => {
  const result = mapOneApiResponse({ output: [
    { type: 'web_search_call', status: 'completed', action: { type: 'search', queries: ['k8s 基础'] } },
    { type: 'web_search_call', status: 'completed', action: { type: 'open_page', url: 'https://kubernetes.io/zh-cn/docs/concepts/#ws_call_id=call_01_a' } },
    { type: 'web_search_call', status: 'completed', action: { type: 'open_page', url: 'https://kubernetes.io/zh-cn/docs/concepts/#ws_call_id=call_02_b' } },
    { type: 'web_search_call', status: 'completed', action: { type: 'open_page', url: 'https://example.com/guide?ws_call_id=call_03_c' } },
  ] })
  assert.deepEqual(result.sources.map(source => source.url),
    ['https://kubernetes.io/zh-cn/docs/concepts/', 'https://example.com/guide'])
})

test('Anthropic and nested Chat citations map while unsafe and invalid URLs are rejected', () => {
  assert.equal(mapOneApiResponse({ choices: [{ message: { annotations: [{ type: 'url_citation', url_citation: { url: 'https://kubernetes.io', title: 'K8s' } }] } }] }).sources[0].title, 'K8s')
  assert.equal(mapOneApiResponse({ content: [{ type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: 'https://kubernetes.io', title: 'K8s' }] }] }).sources.length, 1)
  for (const url of ['javascript:alert(1)', 'http://', 'https://user:password@example.com']) {
    assert.throws(() => mapOneApiResponse({ sources: [{ url }] }), error => error.code === 'WEB_SEARCH_METADATA_MISSING')
  }
  assert.throws(() => mapOneApiResponse({ search_results: [] }), error => error.code === 'WEB_SEARCH_METADATA_MISSING')
  assert.throws(() => mapOneApiResponse({ content: [{ type: 'web_search_tool_result', content: { type: 'web_search_tool_result_error', error_code: 'too_many_requests' } }] }))
})

test('endpoint normalization appends v1 once and rejects credential-bearing API bases', () => {
  for (const base of ['https://gateway.example', 'https://gateway.example/v1/']) assert.equal(searchEndpoint(base, 'responses'), 'https://gateway.example/v1/responses')
  assert.equal(searchEndpoint('https://gateway.example/proxy/v1', 'anthropic-messages'), 'https://gateway.example/proxy/v1/messages')
  for (const base of ['file:///tmp/oneapi', 'https://user:secret@gateway.example', 'https://gateway.example?key=secret']) assert.throws(() => searchEndpoint(base, 'responses'))
})

test('per-operation credential resolution, query and native tool request reach the transport', async () => {
  let reads = 0, requests = []
  const provider = new OneApiSearchProvider(() => { reads++; return { ...options(), apiKey: undefined, resolveApiKey: async () => 'stored-key', headers: { 'X-Routing': 'demo' }, requestBody: { model: 'ignored', input: 'ignored', stream: true, tools: [{ type: 'web_search_preview' }] } } }, async (url, init) => {
    requests.push([url, init]); return Response.json(native())
  })
  assert.equal(provider.available(), true)
  const result = await provider.search({ query: 'Pod 生命周期', maxResults: 1 })
  assert.equal(reads, 2) // available + one snapshot for search
  assert.equal(result.sources.length, 1)
  const [url, init] = requests[0], body = JSON.parse(init.body)
  assert.equal(url, 'https://gateway.example/v1/responses')
  assert.equal(init.headers.get('authorization'), 'Bearer stored-key')
  assert.equal(init.headers.get('x-routing'), 'demo')
  assert.equal(init.redirect, 'error')
  assert.equal(body.model, 'search-model'); assert.equal(body.stream, false)
  assert.match(body.input, /Pod 生命周期/)
  assert.deepEqual(body.tools, [{ type: 'web_search_preview' }])
})

test('credentials service-only secrets are resolved lazily and refreshed each search', async () => {
  let provider, version = 0
  const ctx = { web: { registerSearchProvider(p) { provider = p } }, get(service) {
    return service === 'credentials' ? { async resolve(ref) { assert.equal(ref, 'STORED_TOKEN'); return { value: `secret-${++version}` } } } : undefined
  } }
  apply(ctx, Config({ baseURL: 'https://gateway.example', model: 'search-model', apiKeyEnv: 'STORED_TOKEN' }))
  assert.equal(provider.available(), true)
  assert.equal(version, 0)
  // Use the plugin's resolved options with a deterministic transport.
  const injected = new OneApiSearchProvider(provider.resolveOptions, async (_url, init) => {
    assert.equal(init.headers.get('authorization'), `Bearer secret-${version}`)
    return Response.json(native())
  })
  await injected.search({ query: 'Pod' }); await injected.search({ query: 'Service' })
  assert.equal(version, 2)
})

test('missing credentials, HTTP errors and HTML responses fail without leaking secrets', async () => {
  const missing = new OneApiSearchProvider(() => ({ ...options(), apiKey: undefined, resolveApiKey: async () => undefined }), async () => { throw new Error('should not fetch') })
  await assert.rejects(missing.search({ query: 'Pod' }), error => error.code === 'WEB_PROVIDER_CREDENTIAL_MISSING')
  for (const response of [new Response('secret-key', { status: 401 }), new Response('<html>secret-key</html>', { headers: { 'content-type': 'text/html' } })]) {
    const provider = new OneApiSearchProvider(options, async () => response)
    await assert.rejects(provider.search({ query: 'Pod' }), error => error.code === 'WEB_PROVIDER_ERROR' && !error.message.includes('secret-key'))
  }
})

test('abort cancels credential preflight and request timeouts have stable errors', async () => {
  const control = new AbortController()
  let fetched = false
  const provider = new OneApiSearchProvider(() => ({ ...options(), apiKey: undefined, resolveApiKey: async () => new Promise(() => {}) }), async () => { fetched = true; return Response.json(native()) })
  const waiting = provider.search({ query: 'Pod' }, control.signal)
  control.abort()
  await assert.rejects(waiting, error => error.code === 'WEB_ABORTED')
  assert.equal(fetched, false)
  // A ref'd interval keeps Node alive while AbortSignal.timeout uses an unref'd timer.
  const keepAlive = setInterval(() => {}, 100)
  try {
    const slow = new OneApiSearchProvider(() => ({ ...options(), timeoutMs: 10 }), async () => new Promise(() => {}))
    await assert.rejects(slow.search({ query: 'Pod' }), error => error.code === 'WEB_TIMEOUT')
  } finally { clearInterval(keepAlive) }
})

test('forced SSE preserves native search metadata and refuses incomplete streams', async () => {
  const stream = `event: response.completed\ndata: ${JSON.stringify({ type: 'response.completed', response: native() })}\n\n`
  assert.equal(mapOneApiResponse(decodeSearchStream(stream)).sources.length, 2)
  assert.throws(() => decodeSearchStream('data: {"type":"response.created"}\n\n'))
  const anthropic = [
    { type: 'message_start', message: {} },
    { type: 'content_block_start', index: 0, content_block: { type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: 'https://kubernetes.io' }] } },
    { type: 'message_stop' },
  ].map(event => `data: ${JSON.stringify(event)}\n\n`).join('')
  assert.equal(mapOneApiResponse(decodeSearchStream(anthropic)).sources.length, 1)
  const provider = new OneApiSearchProvider(options, async () => new Response(stream, { headers: { 'content-type': 'text/event-stream' } }))
  assert.equal((await provider.search({ query: 'Pod' })).sources.length, 2)
})


test('open_page sources require completed calls and validated URLs, never answer links', () => {
  for (const action of [{type:'search',queries:['https://example.com']},{type:'open_page',url:'javascript:alert(1)'},{type:'find_in_page',url:'https://example.com'}]) {
    assert.throws(() => mapOneApiResponse({output:[{type:'web_search_call',status:'completed',action}]}), error => error.code === 'WEB_SEARCH_METADATA_MISSING')
  }
  assert.throws(() => mapOneApiResponse({status:'incomplete',...responsesOpenPages()}), error => error.code === 'WEB_PROVIDER_ERROR')
  assert.throws(() => mapOneApiResponse({output:[{type:'web_search_call',status:'failed',action:{type:'open_page',url:'https://example.com'}}]}))
  // An unfinished call next to completed evidence is skipped, not fatal.
  assert.deepEqual(mapOneApiResponse({ output: [...responsesOpenPages().output, { type: 'web_search_call', status: 'in_progress', action: { type: 'open_page', url: 'https://unfinished.example/page' } }] }).sources.map(source => source.url),
    ['https://kubernetes.io/docs/home/', 'https://kubernetes.io/docs/concepts/overview/'])
  assert.throws(() => mapOneApiResponse({ output: [
    { type: 'web_search_call', status: 'completed', action: { type: 'search', queries: ['k8s'] } },
    { type: 'web_search_call', status: 'in_progress', action: { type: 'open_page', url: 'https://example.com/docs' } },
  ] }), error => error.code === 'WEB_PROVIDER_ERROR' && /in_progress/.test(error.message))
  const stream = `data: ${JSON.stringify({type:'response.completed',response:responsesOpenPages()})}\n\n`
  assert.equal(mapOneApiResponse(decodeSearchStream(stream)).sources.length,2)
})
