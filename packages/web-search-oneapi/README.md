# dsh-web-search-oneapi

`dsh-web-search-oneapi` registers a dsh `WebSearchProvider` named `oneapi`.
It calls an OpenAI-compatible OneAPI endpoint and maps explicit `sources`,
`search_results`, `documents`, citation annotations, and completed Responses
`open_page` URLs into
dsh's portable `sources[]` shape.

The adapter is deliberately separate from Learny. Learny only depends on
`ctx.web.search()`, so a profile can replace OneAPI with another provider
without changing the learning plugin.

Typical configuration:

```yaml
- id: web
  name: '@deepseek-ai/dsh-web'
  config:
    searchProvider: oneapi
    fetchProvider: http
- id: web-search-oneapi
  name: dsh-web-search-oneapi
  config:
    baseURL: https://oneapi.example.com
    apiKeyEnv: ONEAPI_API_KEY
    api: responses
    model: DeepSeek-V4-Pro
```

The model must be backed by a OneAPI channel that actually performs web
search. A normal chat model returning prose is rejected because it cannot
provide trustworthy citations. `ONEAPI_HEADERS_JSON` can contain extra routing
headers when the OneAPI deployment requires them.

OneAPI `DeepSeek-V4-Pro` returns completed `web_search_call` entries with
`action.type: open_page` and `action.url`, even when `action.sources` and
citation annotations are absent. These are retrieval page URLs, not excerpts.
Learny fetches these pages independently before using their contents to plan
a course. Generated answer links and search query strings are never sources.
