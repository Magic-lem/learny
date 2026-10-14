# M1 实现记录

2026 年 10 月 9 日，Learny 增加固定内容的学习闭环和 AI 笔记整理。基线仍为 `dsh@0.2.0-rc.2`、源码 commit `639ed015397290b3745d163aafe02ffee4aa3f84`。最终插件版本 `0.1.3`。

## 已实现

- dsh 示例空间保留 3 个有限节点：工具如何被模型看到、一次调用如何执行、结果怎样进入后续推理。新学习空间默认没有路线；项目空间读取本地材料，主题空间先通过 dsh `ctx.web.search/fetch` 搜索并抓取资料，再由当前 dsh 会话模型生成带来源引用的路线。课程记录按空间持久化，旧尝试可迁移并保留历史。源码摘录从固定 commit 核对，附文件 SHA256 和原文链接；任务包含标准与迁移题。
- 保存预测后才开放材料；阅读完成后进入实践，再保存自己的解释并提交。历史提交不能改写。先修节点是建议，可以探索后续节点。
- 提示先持久记录再展示。逐标准评价必须覆盖全部标准，引用提交中的逐字证据与有效来源；程序决定独立通过、辅助完成或补课。使用提示、外部帮助或无法确认辅助情况都不能独立通过。
- 评价失败保留原始提交，可以单独重试；同一提交的并行请求合并为一次模型调用。重新练习创建新记录，保留历史。
- 笔记标题与正文查找、任务内随手记、Markdown 编辑预览和本地草稿。
- 按用户指令生成补充、润色、排版版本，保留原文、指令、范围、来源和结果；对照后应用，可以恢复原文。补充内容放在标明 AI 补充的单独段落，原文不重写。润色须逐字保留原文的不确定性句子，排版校验原有文字、标点和代码。
- 文件版本发生变化时，过期整理版本不能覆盖新笔记；提案仍保留。应用与恢复有可重启恢复的中间状态。
- 学习提交和笔记整理的进行中模型请求在重启后标为中断，可继续重试；实践命令不会由 Learny 自动执行。

## 研究与模型边界

路线研究使用宿主提供的 `ctx.web.search()` 和 `ctx.web.fetch()`，来源 URL、摘录和 SHA256 会随课程保存。课程规划、导师、评价和笔记整理通过 `ctx.llm.stream` 调用 dsh 管理的模型，使用当前聊天已选的模型，缺省使用 dsh 默认模型；Learny 不包含供应商 URL 配置、登录、token 获取或 dsh 适配。宿主配置示例见 [模型配置](model-configuration.md)。`dsh-web-search-deepseek` 默认读取 `DEEPSEEK_API_KEY`，也支持已登录的 DeepSeek Account 会话；未配置时主题路线会明确提示，而不会退回通用三节点模板。

模型输出是提案；程序校验结构、标准覆盖、引用与辅助记录。模型对语义的判断仍可能出错，界面保留依据供用户检查；这份 Demo 不是经过教育测量校准的掌握评估器。外部辅助依赖用户如实声明。

每次辅助模型调用的准确输入（route、system、messages、maxTokens）和返回提案保存进 dsh 会话日志。在 rc.2 中，`Session.append` 不能给外部自定义事件设置 `ignorable` envelope，因此使用正常的 `user/message` context notice，声明来源 `learny`、表单 `notice`；既保留准确输入，也避免未知必需事件阻断恢复。这些记录也进入会话 surface，对后续聊天可见。

## 存储与兼容

M0 的 `learny` domain version 1 保持原状，M1 在同一个专有 SQLite 后端新增 `learny_study` domain version 1。每次学习尝试（含提交与评价）和笔记整理分别是单个权威聚合记录，不依赖跨表事务。笔记正文仍为可外部编辑的 Markdown；应用整理复用文件 hash 版本检查与原文修订快照。

主测试数据：`artifacts/learny-m1-data/learny.sqlite` 与 `notes/<workspace>/<note>.md`。测试宿主：`artifacts/dsh-home/profiles/learny-m1`。不要让多个宿主同时写同一个 Learny 数据目录。

## 验证

- Host、生成 Remote 与浏览器 Client 构建成功。
- 10 项自动化检查通过：M0 实际进程重启、文件冲突与空间范围；M1 阶段和提示规则、模型失败、重复请求、引用校验、补课、笔记范围、应用/恢复、正文搜索，以及强制终止进程后的模型中断恢复。
- 使用真实 dsh Remote API 与已配置的宿主模型执行了提示后辅助完成、缺少实践证据后的补课；三种笔记整理都执行了生成、应用、恢复。报告：`artifacts/m1-smoke.json`。模型验收版本为 `0.1.1`，`0.1.3` 仅修复 Client 布局切换的订阅稳定性和迁移练习的本次阅读确认。
- Web 界面实际检查学习评价、迁移练习的预测 → 阅读确认 → 实践、正文搜索、整理历史与原文对照。真实宿主退出并重启后，两条聊天恢复成功，原始提交、评价和笔记 hash 一致，结果见报告的 restartVerifiedAt。界面截图：`artifacts/learny-m1-workbench.jpg`。
- M0 已验证 Desktop Host；M1 当前在 Web Host 验收。Desktop 原生窗口仍未验收，不将 Web 结果当作 Desktop 窗口结果。

## 使用

```sh
pnpm install
pnpm build
pnpm test
pnpm pack:plugin
pnpm demo:install
```

在已有模型配置的宿主中启动 `pnpm demo:web`；手动 URL/token 配置使用 [示例 overlay](../examples/dsh-model.patch.yml)。打开 Learny，创建或选择学习空间，从节点开始。模型操作需要已有的 dsh 聊天；不要仅用未保存的临时草稿聊天进行模型操作。

重现模型验收时对测试宿主设置 `LEARNY_SMOKE_URL`、临时宿主访问凭证 `LEARNY_SMOKE_TOKEN`、报告路径 `LEARNY_SMOKE_REPORT`，执行 `node scripts/smoke-m1.mjs`；退出并重新启动后执行 `node scripts/smoke-m1.mjs --resume`。报告不保存模型 token 或宿主访问凭证。

M2 的个性化路线、Agent 工具、复习与笔记疑问转补课，M3 的成果和面试功能尚未实现。
