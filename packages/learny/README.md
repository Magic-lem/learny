# Learny

面向个人的学习工作台。当前 M0 提供本地学习空间、聊天绑定、Markdown 笔记编辑、预览、标题查找、草稿恢复和保存冲突提示。

宿主固定为 `@deepseek-ai/dsh@0.2.0-rc.2`。安装打包产物后，在聊天的右侧边栏选择 Learny。空间与聊天独立，多个聊天可以选择同一个空间。

```sh
dsh plugin --profile <profile> add /absolute/path/dsh-plugin-learny-0.1.3.tgz
```

Desktop 需先启动一次初始化 profile，完全退出后用 Desktop 自带的 `dsh` 命令安装到 `--profile desktop`，再重启。普通 npm dsh 不负责修改 Desktop profile。

默认数据目录为 `$DSH_HOME/learny`；可设置 `LEARNY_DATA_DIR`。空间及聊天绑定存储在 `learny.sqlite`，笔记在 `notes/<space UUID>/<note UUID>.md`，保存前的原文在 `revisions/<space UUID>/<note UUID>/<hash>.md`。请保留 Markdown frontmatter，外部编辑可修改正文。笔记版本使用整份文件的 SHA256；过期保存返回冲突，保留浏览器草稿供对照合并。

点击“保存笔记”才提交到 Host。浏览器草稿用于意外刷新后的恢复，不能替代 Markdown 文件备份。M1 提供按学习空间隔离的课程路线、证据评价、有限补课和辅助记录；新空间先生成一条基于项目目录和学习目标的起始路线，已有旧 dsh 尝试可以迁移到当前空间路线。当前任务内的“和导师讨论”会把阶段、作答、源码材料和历史对话交给 Host 模型，回复与提问会持久化到本地学习数据库。模型驱动的个性化路线、外部资料检索、复习和成果生成功能仍待后续版本。

插件包含 Host、通过 Typert 生成的接口元数据和 Client 入口；SQLite 后端随包安装，React 和 Cordis 由宿主提供。完整开发、安装和验收说明见项目 `docs/m0-implementation.md`。

M1 adds a fixed three-node learning workflow, evidence-based evaluation proposals, assistance tracking, finite remediation and a context-aware tutor thread for each attempt. Tutor turns persist locally and use the current stage, answers, source excerpts and prior messages. Notes support title/body search and reviewed format, polish and supplement revisions with original restoration. Course generation, personalized routes, review and outcome generation remain future work. Model authentication and provider configuration belong to dsh; Learny calls the Host llm capability.
