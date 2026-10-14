# Learny M0 实现与验证

宿主为 `@deepseek-ai/dsh@0.2.0-rc.2`，插件为 `dsh-plugin-learny@0.0.5`。代码位于 `packages/learny`，以独立 tgz 安装到 dsh profile，没有修改宿主运行时代码。M0 提供空间和笔记基础设施；教学闭环在 M1 实施。

## 1 已实现的行为

在右侧边栏打开 Learny，创建知识主题或本地项目空间，填写目标；多个聊天可选择同一个空间。项目目录要求绝对路径且确实存在。

笔记支持新建、编辑标题和 Markdown、GFM 预览、标题查找、手动保存与重新读取。未保存编辑写入浏览器草稿，重新打开笔记时恢复。切换聊天清空当前编辑视图，空间和文件从 Host 重新读取。

Host 在保存前校验文件 SHA256，并在同一进程内按笔记串行写入；过期保存返回 `learny/conflict`，不覆盖已读到的外部修改。界面保留草稿，可读取最新内容并对照合并。此机制没有跨进程文件锁，不能保证外部编辑器恰在最后检查与替换之间写入时无竞争；M0 不支持两个 Host 同时写同一数据目录。

保存采用临时文件、fsync 和 rename，临时文件在异常后清理；旧版完整文件保存为修订快照。当前没有 AI 整理、教学任务、正文搜索、修订恢复界面和删除功能。

## 2 开发与 Web 安装

需要支持 `node:sqlite` 的 Node.js（包声明 `^22.19 || >=24`）及 pnpm。本次使用 Node 25.3.0、pnpm 11.21.0；Desktop 使用官方自带运行时与 pnpm 11.7.0。

在项目根目录执行：

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
pnpm pack:plugin
pnpm demo:install
pnpm demo:web
```

`demo:install` 初始化或复用 `artifacts/dsh-home/profiles/learny-smoke`，并安装 `artifacts/dsh-plugin-learny-0.0.5.tgz`。`demo:web` 使用该 profile，在 `127.0.0.1:3097` 启动；使用终端输出的带本次访问 token 的 URL 打开。`LEARNY_PROFILE`、`LEARNY_PORT`、`DSH_HOME` 和 `LEARNY_DATA_DIR` 可覆盖默认值。未初始化时先安装再启动。

M0 的空间和笔记接口不调用模型。启动脚本继承用户环境与宿主配置，不写入 API key。验收启动时使用了明确的无效测试占位 key 跳过 onboarding，未调用模型或搜索服务；教学演示需配置真实模型。

## 3 Desktop 安装

下载官方同版本 Desktop 并启动一次，完全退出后通过 Desktop 自带 CLI 安装：

```sh
DSH_HOME=/absolute/path/desktop-home \
  '/path/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh' \
  plugin --profile desktop add /absolute/path/dsh-plugin-learny-0.0.5.tgz
```

重新打开同一 `DSH_HOME` 的 Desktop。普通 npm dsh 不能修改 Electron 管理的 Desktop profile。本次官方 macOS arm64 zip 从生产更新源下载，SHA512 与源文件声明一致，版本 `0.2.0-rc.2`。测试包和数据都在 `artifacts` 下；启动 Electron 时额外使用 `--user-data-dir` 隔离客户端缓存。

Desktop 没有内置 `dsh-storage-sqlite`，插件将其作为精确运行时依赖安装。Cordis、storage、storage-domain 和协议依赖由宿主提供，profile 的 pnpm 可能报告这些 peer 缺失；加载和接口往返另行验证，不能仅凭 peer 警告判断装配成功。

## 4 代码与接口

| 路径 | 职责 |
| --- | --- |
| `src/index.ts` | Host 插件入口、配置、卸载清理 |
| `src/host/controller.ts` | `learny` 命名空间的 Remote 方法 |
| `src/host/runtime.ts` | 独立 SQLite 后端、领域存储、生命周期 |
| `src/core/service.ts` | 空间、聊天绑定和笔记业务动作 |
| `src/storage/domain.ts` | schema 校验的空间与绑定表 |
| `src/storage/notes.ts` | Markdown、版本校验与修订快照 |
| `src/client` | 侧栏注册、编辑预览、草稿和中文/英文文案 |
| `scripts/build.mjs` | Host 编译、Typert/Remote 生成、Client 自动 JSX 打包 |
| `scripts/smoke-host.mjs` | 真实宿主接口、参数校验、跨聊天与重启验收 |

Remote 方法为 `snapshot`、`createWorkspace`、`bindWorkspace`、`createNote`、`readNote` 和 `saveNote`。界面调用自己装配的生成 Remote；Host 通过 Typert 检查精确参数与业务值，没有手写旁路 HTTP 服务。

已发布生成器在第三方 workspace 中不能识别官方 npm 声明中的 `@Remote`。项目通过 `patches/@deepseek-ai__dsh-typert-generator@0.2.0-rc.2.patch` 修复构建时符号识别，并在 pnpm workspace 中锁定补丁。该补丁只用于开发依赖，不进入运行时插件，不要求改宿主。升级生成器时需检查是否可移除补丁。

## 5 数据位置

默认 `$DSH_HOME/learny`，可用 `LEARNY_DATA_DIR` 覆盖：

```text
learny.sqlite
notes/<workspace UUID>/<note UUID>.md
revisions/<workspace UUID>/<note UUID>/<SHA256>.md
```

SQLite 保存空间、目标与聊天绑定；Markdown 为正文的事实来源，列表扫描文件。文件为 0600，笔记目录为 0700。frontmatter 包含 id、所属空间、标题和时间；外部编辑应保留 frontmatter。备份应同时复制数据库和 notes/revisions，浏览器草稿不能替代备份。

本次 Web 数据在 `artifacts/learny-data`，Desktop 数据在 `artifacts/desktop-learny-data`。验收记录 `artifacts/web-smoke.json`、`artifacts/desktop-smoke.json` 只保存示例内容与标识，不保存认证 token 或凭据。

## 6 验收记录

验证跨 2026 年 10 月 8 日至 9 日进行。结果以最终检查为准：

| 项目 | 结果 |
| --- | --- |
| Host、Client 类型检查及独立构建 | 已通过 |
| 数据自动化测试 | 3 项通过：独立进程恢复、过期/并发保存、空间与路径隔离 |
| Web tgz 安装、侧栏打开、空间创建、笔记保存、预览与刷新恢复 | 已通过 |
| Web 真实 Remote、额外参数拒绝、两个聊天共享空间 | 已通过 |
| Desktop 自带 CLI 安装、插件 Host 加载、真实 Remote 与两个聊天共享空间 | 已通过 |
| 最终包在 Web 与 Desktop Host 的重启恢复 | 已通过：正文、版本和两个聊天绑定一致 |
| Desktop Host 的共享 Client 在浏览器中的侧栏、笔记读取与预览 | 已通过，无浏览器 error 日志；截图 `artifacts/learny-m0-desktop-host.png` |
| Desktop 原生窗口交互 | 未验证：Computer Use 未获原生应用操作权限 |

Desktop Host 的接口和浏览器承载的共享 Client 验证不能替代 Electron 原生窗口验收。保留这一项待验证，不宣称 M0 全部验收完成。

Web 最终预览截图为 `artifacts/learny-m0-web.png`。最终核对使用 `0.0.5` 安装包，三项数据测试和两端类型检查均通过。Web demo 保留运行，Desktop 隔离实例在验收后停止。

运行真实 Host 验收时，为 `scripts/smoke-host.mjs` 提供环境变量 `LEARNY_SMOKE_URL`、`LEARNY_SMOKE_TOKEN`、`LEARNY_SMOKE_REPORT`；首次创建或复用示例空间、笔记与两个会话，重启宿主后追加 `--resume`，对比保存前后的正文、版本及两份聊天绑定。认证 token 来自本次宿主启动输出，不提交到文件。
