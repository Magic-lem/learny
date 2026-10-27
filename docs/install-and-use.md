# 安装与使用

Learny 是一个 dsh 插件：它装在 dsh profile 里，学习数据留在本机，模型调用和网页资料走你自己配置的 dsh 能力。本页是从零到第一次生成学习路线的完整步骤。

## 发布状态与日常使用

截至 2026-10-26，Learny 已有公开源码和完整插件包结构，但尚未发布 npm 包，也没有 GitHub Release 附件。`dsh plugin add dsh-plugin-learny` 暂时不能作为安装方式。旧 `v0.1.4` 标签不代表最新 `main`。

日常使用是把插件装进你已有的 `web` profile，然后运行 `dsh web`；不需要启动本仓库的 Demo，不需要 Learny 服务器，也不需要复制演示环境的凭据或数据。模型和搜索沿用你的 dsh 配置。

## 1. 前置条件

| 需要 | 说明 |
|---|---|
| Node.js | 24 及以上（`node -v`） |
| pnpm | 用来安装工作区和打包插件 |
| dsh | 版本要覆盖插件声明的宿主基线，本仓库固定 `@deepseek-ai/dsh@0.2.1-rc.2`（见 [维护者笔记里的基线说明](internal/runtime-baseline.md)） |
| 模型 | 任意一个 dsh 能调用的模型：DeepSeek、OpenAI 兼容网关、公司内部网关都可以，只要能在 dsh 里跑通一次对话 |
| 网页搜索 | 主题路线需要。dsh 自带 DeepSeek 搜索，配 `DEEPSEEK_API_KEY` 即可；项目空间只用本地材料，不需要搜索 |

Learny 自己不保存任何供应商配置：endpoint、密钥、模型名都属于 dsh profile，插件只消费 dsh 暴露的 `ctx.llm`、`ctx.web.search`、`ctx.web.fetch`。

## 2. 拿到插件

插件以 `lib/` 为入口，`lib/` 是构建产物（不随仓库提交），所以从源码用它要先 build 一次。**不需要打成 tgz**，装进 profile 时直接指向源码目录即可：

```sh
git clone https://github.com/Magic-lem/learny.git
cd learny
pnpm install --frozen-lockfile
pnpm build
```

需要把插件分发给别人、或想固定一个版本时，再打包：

```sh
pnpm pack:plugin          # 产出 artifacts/dsh-plugin-learny-<版本>.tgz（以及可选的搜索适配器）
```

## 3. 装进 dsh profile

profile 是 dsh 的插件集合。**直接装进 `web` 就行**——dsh 会自动把自带的 web 模板落成 `$DSH_HOME/profiles/web`，路径里带上插件；这也是你日常 `dsh web` 用的那份：

```sh
dsh plugin --profile web add "link:$PWD/packages/learny"   # 源码目录
# 或者：dsh plugin --profile web add ./artifacts/dsh-plugin-learny-0.1.5.tgz
# 发布到 npm 之后：dsh plugin --profile web add dsh-plugin-learny
```

`dsh plugin add` 就是在该 profile 里执行 `pnpm add`，所以来源可以是源码目录、tgz、npm 包名或 git 地址。安装后 profile 的 `package.json` 里会出现 `dsh-plugin-learny`，并自动加进 `bundles` 列表；插件的 `cordis.patch.yml` 负责把 Learny 挂到右侧工作台。

安装或更新构建后，重启正在运行的 `dsh web`，确保宿主与浏览器都加载新版本。`link:` 安装依赖本地构建目录，请保留该目录；需要迁移或固定安装内容时可使用自己构建的 tgz。独立 profile 仅用于可选的隔离测试，日常安装不需要 `--from-default-profile`。

**搜索不需要装任何插件**：dsh 内置了 DeepSeek 搜索，配一个 Key 就行（见第 5 节）。

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

主题路线需要先搜资料。**搜索能力来自 dsh，不需要为 Learny 装任何插件**；默认用 dsh 内置的 DeepSeek 搜索：

```sh
export DEEPSEEK_API_KEY='...'
```

已经登录 DeepSeek 账号的话也可以走账号模式，不配 Key。

只有当你的搜索能力来自一个**兼容网关**（能返回结构化来源，但 dsh 没有对应 provider）时，才需要本仓库的可选适配器 `dsh-web-search-oneapi`：

```sh
dsh plugin --profile web add link:$PWD/packages/web-search-oneapi
```

再给 profile 加一份 overlay，参考 [dsh-oneapi-web-search.patch.yml](../examples/dsh-oneapi-web-search.patch.yml)：

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

这个适配器和 Learny 本体解耦：不装它，Learny 照常工作，主题空间走 DeepSeek 搜索。

## 6. 启动

已经配置好 dsh 模型与搜索时：

```sh
dsh web
```

只有采用本页第 4 节的示例环境变量配置时，才需要挂模型 overlay：

```sh
dsh web --patch ./examples/dsh-model.patch.yml
```

终端会打印一行带本次访问 token 的地址，用它打开页面，在右侧工作台切到 Learny。

上面只挂了模型；搜索用 dsh 内置的 DeepSeek 搜索时，`DEEPSEEK_API_KEY` 放进启动环境即可。只有装了可选适配器时，才需要再加上 `--patch ./examples/dsh-oneapi-web-search.patch.yml`。

## 7. 第一次使用

1. **看能力自检**：Learny 顶部会列出模型、网页搜索、网页抓取三类能力。显示"已挂载"表示宿主挂好了，真正的凭据等第一次调用时验证。
2. **建学习空间**：项目空间指向一个本地仓库目录，只用目录里的材料；主题空间（例如"Kubernetes 基础学习"）会先搜资料再规划。
3. **生成学习路线**：主题空间会先搜索、读取资料，再由当前模型规划出 3 到 8 个节点。每个节点带导读、阅读要点、实践类型和验收标准。
4. **在对话里开始这一节**：打开节点后点「在对话里开始这一节」，Learny 把这一节连同它的资料发进左侧 dsh 对话，由对话里的模型讲解；讲解、追问、动手过程都在那边发生，面板只留要点、出处与记录。
5. **随手记**：在「当前」或「笔记」里直接输入内容，点击「记下来」或按 `⌘ / Ctrl + Enter`。标题自动提取，笔记自动关联学习章节；还没有章节时放入「空间笔记」。
6. **收录对话**：在已绑定学习空间的 dsh 对话里，回答操作区的笔记图标可以收录整条回答，保留会话出处并按对应章节归档。重复收录不会产生副本；返回时打开关联会话，暂不定位到具体消息。
7. **整理与复习**：「笔记」按课程章节组织目录，窄面板点击「笔记目录」展开。打开笔记后可以自动保存编辑、移动位置、标记待理解、补充自己的解释，或点击「整理要点 / 精简表达 / 只整理排版」。整理通过 dsh 当前模型生成预览，经你确认后采用，原文快照仍可查看；正文未被后续改动时可以直接恢复。复习先回忆再对照笔记，不必填写答案、不自动评分；当前不提供定时复习提醒。
8. **按需实践**：在章节详情打开「实践与验收」，记录证据和自己的解释。实践验收与个人的“标记学完”分别保存，不要求先写猜想。教学和继续追问仍在 dsh 原生对话进行。

### 更新已安装的源码版本

保留自己的 dsh profile 和 Learny 数据目录，在克隆的仓库里更新并重新构建：

```sh
git pull --ff-only
pnpm install --frozen-lockfile
pnpm build
```

停止并重新启动 `dsh web`。原来使用 `link:` 安装的插件会读取新构建，不必重新安装；使用 tgz 安装的用户需要重新打包并执行 `dsh plugin --profile web add <新包路径>`。升级前建议在宿主停止后备份整个 Learny 数据目录；固定提交和验证过的 dsh 版本，避免把浮动 `main` 当作稳定发行版。

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

笔记正文与章节位置、来源和复习状态一起保存在 Markdown 文件中，旧笔记默认归入「空间笔记」。未保存的速记、编辑和提问草稿保留在当前浏览器；笔记保存成功后以本机文件为准。整理或向 dsh 提问时，会把相关笔记内容交给你配置的模型。

## 10. 宿主兼容性

Learny `0.1.5` 的宿主基线是 `dsh@0.2.1-rc.2`。`0.1.4` 的宿主依赖锁在 `0.2.0-rc.2`，在新版 dsh 上会被安装器拒绝。请更新源码、重新安装依赖、构建，再安装新的源码目录或 `0.1.5` 包；不要用 `allow-version --accept-risk` 绕过检查，也不要继续使用旧 tgz。

```sh
git pull --ff-only
pnpm install --frozen-lockfile
pnpm build
dsh plugin --profile web add "link:$PWD/packages/learny"
```

退出并重新启动 `dsh web`。插件版本、宿主依赖、锁文件与构建产物必须一致。当前不宣称兼容未经验证的其他 dsh 版本。

## 11. 常见问题

| 现象 | 原因与处理 |
|---|---|
| 生成路线时报"网页搜索未配置" | 没有挂搜索 provider，或凭据缺失（`WEB_PROVIDER_CREDENTIAL_MISSING`）。按第 5 节配一条搜索能力后重启 dsh |
| 报"最近 24 小时的外部资料调用已达上限" | 触发了 `researchDailyCallBudget`。等窗口过去，或调高该配置；已读资料仍会复用 |
| 报 `max-tokens` | 模型输出被截断，调大 `maxOutputTokens`（或换支持更长输出的模型） |
| 某个节点显示"讲解没有生成成功" | 模型那一步失败，节点上的重试按钮可以单独重来，不影响其他节点 |
| 面板里没有教程正文 | 教程在 dsh 原生对话中，点击「在对话里开始这一节」或「回到学习对话」；需要新版时在「本节记录」点击「重新讲解本节」 |
| 搜索结果被主题名带偏 | 检索词包含空间名与目标，空间名里写业务专有词（例如某个网关名）会把无关资料带进来，换个中性名字即可 |
