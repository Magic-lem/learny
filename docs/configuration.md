# 配置

Learny 自己不保存任何供应商配置：模型、网页搜索、密钥都属于 dsh profile。这一页说明要配什么、配在哪里，以及插件自身的参数。

配置分三层，从下往上：

1. **dsh 模型与搜索**（必须）：让 dsh 能对话、能搜网页。Learny 通过 `ctx.llm`、`ctx.web.search`、`ctx.web.fetch` 使用它们。
2. **插件挂载**：`dsh plugin add` 装在 profile 里，插件的 `cordis.patch.yml` 负责把自己挂到右侧工作台。
3. **Learny 参数**（可选）：数据目录、输出上限、研究预算等，写在同一份 profile 里。

## 1. 模型

Learny 读取当前聊天选中的模型；没有选中时用 dsh 默认模型。也就是说，只要你的 dsh 已经能正常对话，Learny 就不再需要额外配置。

最小 overlay 示例见 [examples/dsh-model.patch.yml](../examples/dsh-model.patch.yml)：

```yaml
- id: llm-pi-ai
  config:
    providers:
      my-model:
        displayName: My model
        api: openai-completions
        baseURL: !!js process.env.LEARNY_MODEL_URL
        apiKeyEnv: LEARNY_MODEL_KEY
        models:
          - id: !!js process.env.LEARNY_MODEL_ID
            contextWindow: 65536
            maxTokens: 8192
            input: [text]
- id: agent-default-model
  config:
    provider: my-model
    model: !!js process.env.LEARNY_MODEL_ID
```

```sh
export LEARNY_MODEL_URL='https://your-gateway/v1'   # 带服务要求的 API 基础路径
export LEARNY_MODEL_KEY='...'
export LEARNY_MODEL_ID='your-model-id'
```

`api` 取 dsh 支持的协议（例如 `openai-completions`、`anthropic-messages`）。需要额外路由 header 的网关，把 header 写在 provider 的 `headers` 里；这类参数属于 dsh，不属于 Learny。

如果网关兼容 Anthropic 协议，也可以参考 [examples/dsh-oneapi.patch.yml](../examples/dsh-oneapi.patch.yml)，它用 `api: anthropic-messages` 并同样从环境变量注入 endpoint、模型名和密钥。

模型能力会影响体验：路线与讲解是长输出任务，建议 `maxTokens` 不低于 8192；输出上限被截断时 Learny 会报 `max-tokens`。

## 2. 网页搜索

主题空间需要它（项目空间不需要）。**搜索能力由 dsh 提供，不是 Learny 的一部分**：Learny 只调用 `ctx.web.search`，谁来实现都行。

### 默认：dsh 内置的 DeepSeek 搜索

`dsh-base` 已经内置 `@deepseek-ai/dsh-web-search-deepseek`，不需要安装任何插件，配一个 Key 就能用：

```sh
export DEEPSEEK_API_KEY='...'
```

如果你已经登录了 DeepSeek 账号，也可以直接走账号模式，不配 Key。

### 可选：把其它网关接成搜索 provider

只有当你的搜索能力来自一个**兼容网关**（能返回结构化来源，但没有 dsh 内置 provider）时，才需要这一步。这时装本仓库的可选适配器 `dsh-web-search-oneapi`：

```sh
dsh plugin --profile web add link:$PWD/packages/web-search-oneapi
# 或打包产物：dsh plugin --profile web add ./artifacts/dsh-web-search-oneapi-0.1.3.tgz
```

再加一份 overlay，示例见 [examples/dsh-oneapi-web-search.patch.yml](../examples/dsh-oneapi-web-search.patch.yml)：

```yaml
- id: web
  config:
    searchProvider: oneapi
    fetchProvider: http
- id: web-search-oneapi
  config:
    api: responses                       # responses | anthropic-messages | chat-completions
    baseURL: !!js process.env.ONEAPI_SEARCH_BASE_URL
    model: !!js process.env.ONEAPI_SEARCH_MODEL
    apiKeyEnv: !!js process.env.ONEAPI_SEARCH_KEY_ENV ?? 'ONEAPI_API_KEY'
    timeoutMs: 180000
```

```sh
export ONEAPI_SEARCH_BASE_URL='https://your-gateway'
export ONEAPI_SEARCH_MODEL='your-search-enabled-model'
export ONEAPI_API_KEY='...'
# 网关需要路由 header 时，值是 JSON 对象，例如 {"x-gateway-routing":"..."}
export ONEAPI_HEADERS_JSON='{}'
```

适配器只接受响应里的结构化检索元数据：`sources`、`search_results`、`documents`、citation annotations，或已完成的 `open_page` 调用里的 URL。**模型在正文里写出的链接不会被当成检索证据**——这是为了区分"真的搜到了"和"看起来像搜到了"。网关只在普通对话里返回正文而不返回这些结构时，Learny 会明确报"没有可用检索元数据"，而不是拿正文里的链接凑数。

这个适配器与 Learny 本体解耦：不装它，Learny 照常工作，主题空间用 DeepSeek 搜索；不需要它时可以直接删掉 `packages/web-search-oneapi` 目录。

## 3. 插件参数

写在与 `llm-pi-ai`、`web` 同一份 profile 里（具体写法取决于你的 profile 结构，键名如下）：

| 配置 | 默认 | 说明 |
|---|---|---|
| `dataDir` | 必填 | 学习数据目录：`learny.sqlite` 与 `notes/` |
| `journalMode` | `wal` | SQLite journal 模式（`wal` / `delete` / `truncate` / `persist`） |
| `timeoutMs` | `60000` | 单次模型调用超时（毫秒） |
| `maxOutputTokens` | `8192` | 单次模型输出上限；路线节点多、讲解更长时调大 |
| `researchDailyCallBudget` | `60` | 每个学习空间滚动 24 小时内的搜索+抓取次数上限 |
| `researchPageCacheTtlDays` | `30` | 已读网页正文的复用天数，过期后重新抓取 |

关于研究预算的三个行为，值得先知道：

- 预算是**按学习空间**算的滚动 24 小时窗口，不是自然日；缓存命中不计入。
- 超预算时不会把已经读到的资料丢掉：够两条来源就照常成课，不够才明确报"预算用尽"。
- 每次搜索和每次抓取都在发出**之前**记账，进程中途退出也会计入，因为那一次可能已经花了钱。

## 4. 数据位置

```text
<dataDir>/
├── learny.sqlite      # 学习空间、路线、尝试、评价、讲解、追问、调用记账、网页缓存
└── notes/             # Markdown 笔记
```

多个宿主不要同时写同一个 `dataDir`。想重建一份干净环境，换一个 `dataDir` 即可，不需要迁移。

## 5. 常见配置问题

| 现象 | 处理 |
|---|---|
| 生成主题路线报"网页搜索未配置" | 没挂搜索 provider，或凭据缺失。按第 2 节配一条后重启 dsh |
| 报"最近 24 小时的外部资料调用已达上限" | 触发 `researchDailyCallBudget`，等窗口过去或调高上限；已读资料仍会复用 |
| 报 `max-tokens` | 调大 `maxOutputTokens`，或换成输出上限更高的模型 |
| 网关直连能搜到，Learny 说没有检索元数据 | 该网关没有返回结构化来源。换支持 `open_page` / `annotations` / `sources` 的渠道，或改用 DeepSeek 搜索 |
| 搜索结果被无关内容带偏 | 检索词包含空间名与目标；空间名里写业务专有词会把无关资料带进来，换中性名字 |
