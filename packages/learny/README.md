# dsh-plugin-learny

Learny 是 dsh 的本地学习插件。教程与追问发生在 dsh 原生对话，右侧工作台管理学习空间、课程地图、材料、章节笔记和实践记录。

## 安装

当前通过源码构建安装；截至 2026-10-26，尚未发布到 npm，也没有 GitHub Release 安装附件。

```sh
git clone https://github.com/Magic-lem/learny.git
cd learny
pnpm install --frozen-lockfile
pnpm build
dsh plugin --profile web add "link:$PWD/packages/learny"
dsh web
```

前提是 Node.js 24+、pnpm，以及已经能正常对话的 dsh。本版本验证的宿主基线是 `@deepseek-ai/dsh@0.2.0-rc.2`；其他版本的兼容性需另行验证。装好后重启 dsh，在右侧工作台选择 Learny。

已有模型和搜索配置可以直接复用，无需再为 Learny 配置供应商或使用 Demo。主题学习需要 dsh 网页搜索与抓取；默认 DeepSeek 搜索的凭据由 dsh 管理。OneAPI 搜索适配器是可选项。

需要固定安装内容时，可以在仓库根目录执行 `pnpm pack:plugin`，再把生成的 `dsh-plugin-learny-<版本>.tgz` 装进同一 profile。`link:` 安装则必须保留源码与构建目录。

完整说明：

- [产品与快速开始](https://github.com/Magic-lem/learny#readme)
- [安装、更新与配置](https://github.com/Magic-lem/learny/blob/main/docs/install-and-use.md)
- [模型与搜索配置](https://github.com/Magic-lem/learny/blob/main/docs/configuration.md)

## 使用

1. 创建项目或主题学习空间，填写学习目标与已有基础。
2. 生成路线，在 dsh 对话中开始一节，阅读教程并随时追问。
3. 通过「随手记」或回答操作区收录内容，按章节整理、回忆与复习。
4. 实践与验收是可选路径，不要求先写猜想，也不阻断阅读。

讲解中的图示、自测与章末依据直接在对话正文呈现。学习空间独立于单条聊天，多条聊天可以关联同一个空间。

## 本地数据

默认安装配置使用当前 dsh 主目录下的 `learny/`；可通过 `LEARNY_DATA_DIR` 或插件 `dataDir` 指定：

```text
<dataDir>/
├── learny.sqlite      # 空间、路线、学习记录、来源与网页缓存
└── notes/             # Markdown 笔记
```

学习数据留在本机。生成教程、整理笔记或搜索网页时，相关内容会提交给你在 dsh 中配置的模型或网页服务。升级前可在宿主停止后备份整个数据目录。

## 许可

MIT
