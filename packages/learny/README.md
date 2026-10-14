# dsh-plugin-learny

Learny 的 dsh 插件本体：在 dsh 右侧工作台提供学习空间、学习路线、中文讲解、实践记录、逐标准评价、追问与本地 Markdown 笔记。完整介绍见仓库根目录的 [README](../../README.md)。

## 安装

```sh
dsh plugin --profile web add link:/absolute/path/to/learny/packages/learny
# 发布到 npm 后：dsh plugin --profile web add dsh-plugin-learny
```

装进 `web` 就是装进你日常 `dsh web` 用的那份 profile；装好后在聊天的右侧工作台选择 Learny。学习空间与单条聊天独立，多个聊天可以绑定同一个空间。

宿主基线为 `@deepseek-ai/dsh@0.2.0-rc.2`，插件声明的兼容范围以此为准。

## 依赖的能力

| 能力 | 用途 | 必需 |
|---|---|---|
| `ctx.llm` | 规划路线、写讲解、评价、笔记整理、导师对话 | 是 |
| `ctx.web.search` / `ctx.web.fetch` | 主题空间的研究 | 主题空间需要 |
| `ctx.storage` | 领域数据的本地持久化 | 是 |

模型、搜索与凭据都由 dsh profile 提供，插件不含任何供应商配置。配置方法见 [配置](../../docs/configuration.md)。

## 数据位置

默认数据目录是插件配置里的 `dataDir`：

```text
<dataDir>/
├── learny.sqlite      # 空间、路线、尝试、评价、讲解、追问、记账、网页缓存
└── notes/             # Markdown 笔记
```

笔记正文是普通 Markdown 文件，可以用任何编辑器打开；保存冲突时会保留浏览器草稿供对照合并。

## 组成

插件包含宿主侧服务（含 Remote API）、Typert 生成的接口元数据和浏览器端入口。SQLite 后端随包安装，React 与 Cordis 由宿主提供。

```sh
pnpm build         # 编译 Host、生成 Remote 类型、打包浏览器端
pnpm test          # 自动化检查
pnpm pack:plugin   # 产出安装用的 tgz
```
