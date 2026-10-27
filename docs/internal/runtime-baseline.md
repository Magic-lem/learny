# Learny dsh 开发基线

## 当前基线：2026-10-26

Learny `0.1.5` 已将构建、宿主和客户端依赖统一升级为 `dsh@0.2.1-rc.2`；Cordis 为 `~4.0.5`，Schemastery 为 `~3.18.5`。可选搜索适配器 `0.1.3` 同步升级。发布包的 peerDependencies、SQLite 运行依赖与 `dsh.engines` 均按这一精确基线声明，不借助 `allow-version`。旧 `0.1.4` 面向 `0.2.0-rc.2`，新版安装器拒绝其依赖是预期行为。

验证结果：新版依赖下构建、类型检查和软件回归通过；本机全局 `dsh@0.2.1-rc.2` 在全新临时 `DSH_HOME` 的 `web` profile 安装 `0.1.5` tgz 成功，无豁免。真实 Web 宿主启动后，通过认证的 Remote API 创建并绑定学习空间、快速记录并读取笔记；重启后验证绑定、内容、版本和笔记元数据保持一致。未改动日常 profile 或真实学习数据，也未在此次兼容检查中调用外部模型验证教学质量。

Typert 生成器仍需要识别发布的外部 `dsh-typert-protocol` 声明的补丁，新补丁绑定 `0.2.1-rc.2`，由锁文件固定。打包与 Demo 安装从各包 manifest 读取版本，避免更新包版本后仍引用旧 tgz。

## 历史基线：2026-10-08（以下为历史记录）

Learny Demo 使用 DeepSeek Harness 官方 npm `latest` 渠道对应的已发布版本，并固定精确标签与提交。当前该渠道仍为 RC 预发布版本，不等同于无预发布后缀的稳定版。

核对日期：2026 年 10 月 8 日，Asia/Shanghai。

## 1 发布渠道与固定版本

| 项目 | 当前值 |
| --- | --- |
| 上游仓库 | `https://github.com/deepseek-ai/deepseek-harness` |
| npm 包 | `@deepseek-ai/dsh` |
| npm `latest` | `0.2.0-rc.2` |
| npm `next` | `0.2.0-rc.2` |
| npm `alpha` | `0.2.1-alpha.1` |
| Demo 开发标签 | `dsh-v0.2.0-rc.2` |
| Demo 源码提交 | `639ed015397290b3745d163aafe02ffee4aa3f84` |
| 该版本 GitHub 发布时间 | 2026 年 9 月 29 日 17:42:36，Asia/Shanghai |
| 该版本 npm 发布时间 | 2026 年 9 月 29 日 17:56:27，Asia/Shanghai |
| 本地源码目录 | 你自己的 dsh 源码克隆路径（例如 `~/workspace/deepseek-harness`） |
| 当前检出方式 | detached HEAD，指向上述发布标签 |

截至核对时，GitHub 的已发布 Release 全部标为 prerelease，npm 包版本也未发现无预发布后缀的稳定版本。最新 GitHub Release 是 `0.2.1-alpha.1`，与 npm `latest` 不同。Demo 选择 `latest` 渠道的 RC 版本，避免直接使用更新的 alpha 或浮动 `master`。

参考：[官方 RC 发布记录](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.0-rc.2)、[官方 alpha 发布记录](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-alpha.1)、[npm 发布元数据](https://registry.npmjs.org/@deepseek-ai%2fdsh)。

远端源码和标签已通过 `git fetch origin --tags` 更新。本地检出发布标签用于只读分析和开发对照；Learny 插件代码位于独立项目目录。Web 和同版本官方 Desktop Host 已完成独立安装与数据往返验证；实际平台边界与构建时生成器补丁见 [M0 实现记录](m0-implementation.md)。

## 2 该版本的集成依据

以下依据都来自上面那个上游仓库；路径是上游仓库内的相对位置，请在你自己的源码克隆里对照（下面的 `dsh-v0.2.0-rc.2` 指向本次基线标签）：

- `AGENTS.md`：宿主仓库规则——应用启动通过 dsh profile；新行为使用插件扩展点；模型可见输入必须可由会话日志追踪。
- `docs/cookbook/adding-a-remote-api.md`：自定义 Remote API——Host 服务声明接口，生成 `./typert` 与 `./remote` 元数据，Client 需要装配对应贡献。
- `packages/client/ui-sidebar-right/README.md`：右侧工作台扩展——Tab 类型注册、内容 slot、导航及普通和全屏呈现。
- `packages/storage/storage-domain/README.zh.md`：领域存储——schema 校验的 KV 记录、持久写入及变更事件；无跨表事务、二级索引和自动迁移。
- `packages/storage/storage-sqlite/README.zh.md`：SQLite 后端——本地持久化后端与版本要求。
- `apps/desktop/README.md`：Desktop 运行说明——Electron 壳承载完整 Web 应用，本地 Host 通过经认证的 HTTP 和 WebSocket 提供能力。

早期交接资料中的“Desktop 不开放监听端口”不适用于当前基线。`0.2.0-rc.2` Desktop 默认端口为 `19387`，Web 默认为 `3080`。这属于宿主本地运行机制，不改变 Learny 无需部署应用服务器的产品方向。

## 3 开发约束

一个外部插件包包含 Host 与 Client 两个入口，具体导出、共享依赖、Typert 生成和安装装配在 M0 验证。不得仅凭仓库内新增接口的教程推定第三方插件无需接线。

插件通过已发布扩展点实现；任何必要的宿主改动都需先说明原因和影响。开发启动遵循该版本的 profile 与构建方式。模型和网页服务使用宿主配置，凭据不进入 Learny 项目文档或代码。

既有架构图是基于旧提交的拟议方案；引用宿主 API 前须按当前标签重新核对。后续升级使用明确版本，重新验证安装、接口、存储恢复和 Desktop/Web 行为，再更新基线。
