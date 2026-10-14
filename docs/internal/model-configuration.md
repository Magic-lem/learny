# Demo 模型配置

Learny 只调用 dsh 的 `ctx.llm.stream`，读取当前聊天的模型选择；未选定时使用 dsh 默认模型。Learny 不提供登录、token 获取、供应商适配或 API URL 配置。学习评价和笔记整理共享这条宿主模型路径。

已有可用模型的 dsh profile 可以直接安装 Learny：只要 profile 里已经配好模型，Learny 不需要任何额外接入。安装前先确认插件声明的宿主版本覆盖你正在用的 dsh 版本，不覆盖时先升级 dsh，不要强行安装。

也可以手动给 dsh 配置模型。示例 [dsh-model.patch.yml](../../examples/dsh-model.patch.yml) 使用当前宿主支持的 `llm-pi-ai` 与 OpenAI 兼容协议；URL、token、模型名称通过进程环境注入，不写入 Learny 配置或产品代码。URL 需要包含服务要求的 API 基础路径（如 `/v1`）。其他协议应在 dsh 中设置对应的 `api`，服务要求的额外 header 也由 dsh provider 配置承担。

```sh
# 在本地终端设置实际 URL、token、模型名称，不提交到代码库。
export LEARNY_DEMO_URL='https://your-model-endpoint/v1'
export LEARNY_DEMO_MODEL='your-model-id'
read -s 'LEARNY_DEMO_TOKEN?Model token: '
export LEARNY_DEMO_TOKEN

DSH_HOME="$PWD/artifacts/dsh-home" \
LEARNY_DATA_DIR="$PWD/artifacts/learny-data" \
node_modules/.bin/dsh --profile learny-smoke \
  --patch "$PWD/examples/dsh-model.patch.yml" \
  --no-open --host 127.0.0.1 --port 3097
```

如果模型服务是 OneAPI，可以直接使用 [dsh-oneapi.patch.yml](../../examples/dsh-oneapi.patch.yml)。这个 overlay 仍然属于 dsh profile：Learny 插件只消费 dsh 的 `ctx.llm`，不会读取或保存 OneAPI endpoint、模型名和密钥。把示例中的环境变量分别设置为 `LEARNY_ONEAPI_URL`、`LEARNY_ONEAPI_MODEL` 和 `LEARNY_ONEAPI_KEY`，并将 `--patch` 指向该文件。使用 `pnpm demo:web` 时只设置 `DSH_PATCH_FILE` 也可以，脚本会把它透传给 dsh。

如果希望把 provider 配置放在环境变量里而不是写进文件，也可以像示例那样用 `!!js process.env.*` 注入整段 provider JSON。这类 overlay 都属于用户自己的 dsh profile，Learny 发布包不依赖其中任何一项。

模型配置和网页搜索是两条能力：OneAPI overlay 负责 `ctx.llm`；主题学习的 `ctx.web.search` / `ctx.web.fetch` 仍需要 dsh profile 挂载搜索 provider。首次打开 Learny 会显示当前挂载状态，真正的搜索凭据会在首次研究主题时由 dsh 校验。

## 网页搜索配置

当前 `dsh-base` 已经内置 `@deepseek-ai/dsh-web-search-deepseek` 和 `@deepseek-ai/dsh-web-fetch-http`，不需要额外安装插件。原生 DeepSeek 搜索使用独立的凭据和 endpoint：

```dotenv
# 写入项目 .env 或 dsh 的凭据服务，不要提交到仓库。
DEEPSEEK_API_KEY=your-search-key
# 可选：内部 Anthropic 兼容搜索网关；默认是 DeepSeek 官方搜索 endpoint。
DEEPSEEK_SEARCH_BASE_URL=https://your-search-gateway/anthropic/v1
```

搜索 provider 的默认配置是 `apiKeyEnv: DEEPSEEK_API_KEY`，并通过 `ctx.web.search()` 自动选择；`web.fetch` 不需要搜索密钥，只会抓取公开 HTTP(S) 页面。修改 `.env` 后需要重启 dsh，当前 Demo 的 `scripts/demo-web.mjs` 会自动读取该文件。

OneAPI 的普通对话模型配置不能自动变成 dsh 搜索 provider。只有当 OneAPI endpoint 同时实现 Anthropic 原生 `web_search` 并返回 `web_search_tool_result` 结构块时，才能通过 dsh 的 `web-search-deepseek` overlay 复用；当前本机 OneAPI 实测能完成模型对话，但没有返回这些搜索结果块，因此 Learny 仍会把搜索能力报告为未配置。若 OneAPI 使用自己的搜索协议，需要在 dsh 中实现一个 `WebSearchProvider` 适配器，Learny 不应直接处理该协议。

仓库现在提供独立的 `dsh-web-search-oneapi` 插件。它位于 dsh 能力层，不进入 Learny，调用 OneAPI 的 OpenAI-compatible `/v1/responses`、`/v1/messages` 或 `/v1/chat/completions`，并接受响应里的 `sources`、`search_results`、`documents`、citation annotations 或已完成的 Responses `open_page` 来源 URL；普通回答中的网址不会被当作搜索证据。安装插件后，在 dsh profile 加上 [dsh-oneapi-web-search.patch.yml](../../examples/dsh-oneapi-web-search.patch.yml)：

```dotenv
ONEAPI_SEARCH_BASE_URL=https://oneapi.example.com
ONEAPI_SEARCH_MODEL=qwen-plus-internet
# 只保存引用名，密钥仍放在 dsh 凭据服务或启动环境。
ONEAPI_SEARCH_KEY_ENV=ONEAPI_API_KEY
# 如果网关需要路由 header，值是 JSON 对象，例如 {"x-gateway-routing":"..."}。
ONEAPI_HEADERS_JSON={}
```

`api` 按网关实际协议选择：`responses`、`anthropic-messages` 或 `chat-completions`。本机 OneAPI 的 `DeepSeek-V4-Pro` 能力目录包含 `web_search`，已实测通过 `/v1/responses` 返回已完成的 `search`、`open_page` 原生调用。它可能省略 `action.sources` 和 citation annotations；适配器会从已完成的 `open_page.action.url` 提取资料 URL，再交给 Learny 通过 dsh `web.fetch` 读取正文。只有 URL 且无法抓取正文、也无搜索摘要的资料不会进入课程规划。模型回答中的链接不被当作检索证据。

网关会给检索到的页面追加 `#ws_call_id=...` 关联片段，适配器会去掉该片段，因此同一页面被多次打开时只保留一个来源。网关偶尔会在已完成调用之外返回一次未完成的 `web_search_call`：只要还有可用的已完成证据，这次未完成的调用会被跳过，而不是让整条路线生成失败；完全没有可用证据时仍然报错。

请求参数（不包含 endpoint 或凭据）：
```json
{
  "model": "DeepSeek-V4-Pro",
  "input": "搜索 Kubernetes 官方资料，打开相关权威页面核实并简要引用。",
  "tools": [{ "type": "web_search" }],
  "tool_choice": "required",
  "include": ["web_search_call.action.sources"],
  "max_output_tokens": 4096,
  "stream": false
}
```

模型、搜索 endpoint 和凭据仍属于 dsh profile，Learny 只消费 `ctx.llm` 和 `ctx.web`。
