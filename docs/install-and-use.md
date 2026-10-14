# 安装与使用

Learny 是一个 dsh 插件：它装在 dsh profile 里，学习数据留在本机，模型调用和网页资料走你自己配置的 dsh 能力。本页是从零到第一次生成学习路线的完整步骤。

## 1. 前置条件

| 需要 | 说明 |
|---|---|
| Node.js | 24 及以上（`node -v`） |
| pnpm | 用来安装工作区和打包插件 |
| dsh | 版本要覆盖插件声明的宿主基线，本仓库固定 `@deepseek-ai/dsh@0.2.0-rc.2`（见 [维护者笔记里的基线说明](internal/runtime-baseline.md)） |
| 模型 | 任意一个 dsh 能调用的模型：DeepSeek、OpenAI 兼容网关、公司内部网关都可以，只要能在 dsh 里跑通一次对话 |
| 网页搜索（可选） | 生成主题路线时需要。项目空间只用本地材料，不需要搜索 |

Learny 自己不保存任何供应商配置：endpoint、密钥、模型名都属于 dsh profile，插件只消费 dsh 暴露的 `ctx.llm`、`ctx.web.search`、`ctx.web.fetch`。

## 2. 拿到插件包

```sh
git clone https://github.com/<你的账号>/learny.git
cd learny
pnpm install --frozen-lockfile
pnpm build
pnpm pack:plugin          # 产出 artifacts/dsh-plugin-learny-<版本>.tgz
```

`pack:plugin` 会同时打出两个包：

- `dsh-plugin-learny`：本体，学习空间、路线、笔记、评价、讲解都在这里。
- `dsh-web-search-oneapi`：可选。把 OneAPI 之类的 OpenAI/Anthropic 兼容网关接成 dsh 的搜索 provider，供 Learny 生成主题路线时使用。

## 3. 装进 dsh profile

profile 是 dsh 的插件集合。给 Learny 单独开一个，避免影响你日常用的那份：

```sh
dsh --profile learny --from-default-profile web --dump-config
dsh plugin --profile learny add ./artifacts/dsh-plugin-learny-0.1.4.tgz
dsh plugin --profile learny add ./artifacts/dsh-web-search-oneapi-0.1.2.tgz   # 可选
```

安装后 profile 的 `package.json` 里会出现这两个依赖；本体的 `cordis.patch.yml` 已经把 Learny 挂到右侧工作台。

## 4. 配置模型

Learny 读取当前聊天选中的模型，没有选中时用 dsh 默认模型。最小配置是给 profile 一个 provider 和一个默认模型，参考 [dsh-model.patch.yml](../examples/dsh-model.patch.yml)：

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
export LEARNY_MODEL_URL='https://your-gateway/v1'   # 要带服务要求的 API 基础路径
export LEARNY_MODEL_KEY='...'
export LEARNY_MODEL_ID='your-model-id'
```

内部网关往往要额外路由 header，这类参数写在 dsh provider 的 `headers` 里，不要写进 Learny。完整说明见 [配置](configuration.md)。

## 5. 配置网页搜索

主题路线需要先搜资料。两条路，任选一条：

**A. 用 dsh 自带的 DeepSeek 搜索**（需要 DeepSeek API Key）：

```sh
export DEEPSEEK_API_KEY='...'
```

**B. 用你自己的兼容网关**（OneAPI 等）：装上面的 `dsh-web-search-oneapi`，再给 profile 加一份 overlay，参考 [dsh-oneapi-web-search.patch.yml](../examples/dsh-oneapi-web-search.patch.yml)：

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
```

适配器只接受响应里的结构化检索元数据（`sources`、`search_results`、citation annotations，或已完成的 `open_page` 调用里的 URL）。模型在正文里写出的链接不会被当成检索证据，这是为了避免"看起来有来源、其实没搜"。

## 6. 启动

```sh
dsh --profile learny \
  --patch ./examples/dsh-model.patch.yml \
  --patch ./examples/dsh-oneapi-web-search.patch.yml \
  --no-open --host 127.0.0.1 --port 3097
```

终端会打印一行带本次访问 token 的地址，用它打开页面，在右侧工作台切到 Learny。

## 7. 第一次使用

1. **看能力自检**：Learny 顶部会列出模型、网页搜索、网页抓取三类能力。显示"已挂载"表示宿主挂好了，真正的凭据等第一次调用时验证。
2. **建学习空间**：项目空间指向一个本地仓库目录，只用目录里的材料；主题空间（例如"Kubernetes 基础学习"）会先搜资料再规划。
3. **生成学习路线**：主题空间会先搜索、读取资料，再由当前模型规划出 3 到 8 个节点。每个节点带导读、阅读要点、实践类型和验收标准。
4. **打开节点**：第一次进入阅读阶段时，Learny 才为这一节写中文讲解（通常十几秒），之后复用缓存；资料更新可以点"重写本节讲解"。
5. **实践与追问**：按节点给的实践类型记录（命令与配置 / 输出与观察 / 结论），卡住可以直接问，也可以选中讲解里的某一段追问那一段。
6. **提交评价**：提交预测、实践证据和自己的解释，模型按验收标准逐条给出结论与补课任务。

## 8. 插件配置项

在 profile 里给 Learny 的 config 段可以调这些（都有默认值）：

| 配置 | 默认 | 作用 |
|---|---|---|
| `dataDir` | 必填 | Learny 数据目录，存放 `learny.sqlite` 与 `notes/` |
| `journalMode` | `wal` | SQLite journal 模式 |
| `timeoutMs` | `60000` | 单次模型调用超时 |
| `maxOutputTokens` | `8192` | 单次模型输出上限；路线节点多或讲解更长时可以调大 |
| `researchDailyCallBudget` | `60` | 每个学习空间滚动 24 小时内的搜索+抓取调用上限，超过就暂停抓取（已读资料仍会复用） |
| `researchPageCacheTtlDays` | `30` | 已读网页正文的复用天数，过期后重新抓取 |

## 9. 数据放在哪里

全部在本机：`<dataDir>/learny.sqlite` 存学习空间、路线、尝试、讲解、追问和记账，`<dataDir>/notes/` 存 Markdown 笔记。联网只发生在三类调用上：模型推理、网页搜索、网页抓取。学习产物里不保存网页正文，只保留来源的标题、链接与 SHA256；网页正文仅短期留在研究缓存里，用于生成讲解和回答追问。

## 10. 常见问题

| 现象 | 原因与处理 |
|---|---|
| 生成路线时报"网页搜索未配置" | 没有挂搜索 provider，或凭据缺失（`WEB_PROVIDER_CREDENTIAL_MISSING`）。按第 5 节配一条搜索能力后重启 dsh |
| 报"最近 24 小时的外部资料调用已达上限" | 触发了 `researchDailyCallBudget`。等窗口过去，或调高该配置；已读资料仍会复用 |
| 报 `max-tokens` | 模型输出被截断，调大 `maxOutputTokens`（或换支持更长输出的模型） |
| 某个节点显示"讲解没有生成成功" | 模型那一步失败，节点上的重试按钮可以单独重来，不影响其他节点 |
| 节点里没有讲解 | 讲解是按需生成的：进入阅读阶段才会写。若刚刚失败，点"生成本节讲解" |
| 搜索结果被主题名带偏 | 检索词包含空间名与目标，空间名里写业务专有词（例如某个网关名）会把无关资料带进来，换个中性名字即可 |
