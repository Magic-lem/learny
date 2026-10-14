# dsh-web-search-oneapi

**可选包，不是 Learny 的依赖。** Learny 主题学习只需要 dsh 暴露一个搜索 provider；
dsh 自带 DeepSeek 搜索，大多数用户不需要装这个包。只有当搜索能力来自一个兼容网关
（返回结构化来源，但 dsh 没有对应 provider）时，才需要它。

`dsh-web-search-oneapi` registers a dsh `WebSearchProvider` named `oneapi`,
backed by any OpenAI- or Anthropic-compatible gateway (OneAPI, or another
gateway exposing `/v1/responses`, `/v1/messages` or `/v1/chat/completions`).
It maps explicit `sources`, `search_results`, `documents`, citation annotations
and completed Responses `open_page` URLs into dsh's portable `sources[]` shape.

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
