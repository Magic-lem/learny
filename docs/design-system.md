---
version: alpha
name: Learny
description: 本地项目学习工作台，把源码证据、阶段任务、个人解释和导师追问组织成可复习的学习过程。
colors:
  ground: "var(--dsw-alias-bg-base)"
  sunken: "var(--dsw-alias-bg-layer-1)"
  field: "var(--dsw-alias-bg-layer-1)"
  code: "var(--dsw-alias-markdown-code-block)"
  ink: "var(--dsw-alias-label-primary)"
  ink-secondary: "var(--dsw-alias-label-secondary)"
  ink-tertiary: "var(--dsw-alias-label-tertiary)"
  line: "var(--dsw-alias-border-l2)"
  line-soft: "var(--dsw-alias-border-l1)"
  line-strong: "var(--dsw-alias-border-l4)"
  accent: "var(--dsw-alias-link)"
  action: "var(--dsw-alias-button-info-fill)"
  success: "var(--dsw-alias-state-success-primary)"
  warning: "var(--dsw-alias-state-warn-label)"
  danger: "var(--dsw-alias-state-error-primary)"
typography:
  body:
    fontFamily: "var(--dsw-font-family)"
    fontSize: "var(--dsh-content-font-size-secondary, 13px)"
    lineHeight: 1.65
  content:
    fontSize: "var(--dsh-content-font-size, 14px)"
    lineHeight: 1.7
  meta:
    fontSize: 12px
  caption:
    fontSize: 11px
  code:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: 12px
    lineHeight: 1.65
rounded:
  sm: "var(--dsw-radius-sm, 8px)"
  md: "var(--dsw-radius-md, 12px)"
spacing:
  sm: 8px
  md: 14px
  lg: 24px
components:
  button-default:
    minHeight: 28px
    padding: "4px 10px"
    fontSize: 12px
    rounded: "{rounded.sm}"
  button-primary:
    minHeight: 36px
    padding: "0 14px"
    backgroundColor: "{colors.action}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
  field:
    minHeight: 32px
    backgroundColor: "{colors.field}"
    borderColor: "{colors.line-strong}"
    rounded: "{rounded.md}"
---

## Overview

Learny 是 dsh 右侧面板里的本地学习工作台，使用者是正在读一个代码库的工程师。核心任务不是浏览课程，而是从源码和外部资料中形成判断、留下实践证据和解释，并通过验收与导师追问找到下一步。

面板长在宿主应用里，所以颜色、字号、圆角一律使用宿主 token，不另造一套色值。宿主没有定义这些变量时（独立运行、测试）回落到同一组值，两处观感一致。

## Colors

全部取自 `--dsw-alias-*`。三档文字（primary / secondary / tertiary）加一档 11px 的 caption 构成层级，边框用半透明描边分三档，不再用实色灰阶。

- **ground** `--dsw-alias-bg-base`：面板底。深色下是中性近黑，浅色下是白。
- **sunken** `--dsw-alias-bg-layer-1`：笔记列表、表头、通知这类内容区。
- **field** `--dsw-alias-bg-layer-1`：输入框、下拉。宿主只往上叠层，深色下它比面板底更亮，不要反过来做成下沉。
- **code** `--dsw-alias-markdown-code-block`：代码块与行内 code。
- **ink / ink-secondary / ink-tertiary**：标题与当前项 / 长文正文与说明 / 仅用于装饰性字形、计数与时间戳。

只用这三档，不用宿主的 `--dsw-alias-label-caption`：它在浅色白底上只有 1.99:1，深色下 4.24:1，承载不了要读的文字。同理，`ink-tertiary` 在浅色白底上是 3.71:1，所以凡是用户需要读的文字（说明句、标签页、控制按钮、引用、表格表头）都用 `ink-secondary`，tertiary 只留给图标、计数、时间戳这类非关键信息。
- **accent** `--dsw-alias-link`：链接、当前标记、进度条。**action** `--dsw-alias-button-info-fill`：主操作填充。**success / warning / danger**：验收结果与状态。

主操作按钮用的是宿主的蓝色动作填充 `button-info-fill`（浅色深色都是 rgb(65,118,230)）。宿主 `ui-primitives` 的 `Button.primary` 用的是对比色填充 `button-primary-fill`（浅色近黑、深色近白）。如果要让按钮和宿主主按钮完全一致，把 `--ly-button` 换成 `--dsw-alias-button-primary-fill` 即可，这是唯一一处刻意的偏离。

## Typography

四档，从八档（12/13/14/15/16/18/21/22）收敛而来。层级由字重和颜色承担，不再靠字号体量。

- **11px caption**：计数、状态标注、来源版本、行内编号。
- **12px meta**：辅助说明、表格正文、验收标准、导师消息。
- **13px body**：面板正文、按钮、节点标题。取自 `--dsh-content-font-size-secondary`。
- **14px content**：任务标题、当前问题、笔记与源码正文。取自 `--dsh-content-font-size`。
- **12px 等宽**：代码块。

字号跟随宿主设置：正文字号由用户在设置里改（`--dsh-content-font-size`），派生档位自动取低一档。不要写死 13px 或 14px。

标题一律 500 字重。500 与 400 的差别加上颜色就够了，不靠 600/650 再叠字号。

## Layout

面板从上到下只有这些层：工作区栏（品牌 + 空间选择 + 创建）→ 工作区导航（学习任务 / 我的笔记）→ 学习目标一行 → 任务页头 → 进度 → 任务主体 → 历次尝试。

- **任务页头只有一层**：课程名 11px caption 在节点名上方，节点名 14px/500 作主标题，右侧是路线、笔记、刷新三个动作。`flex-wrap` 让动作在窄面板里换行，而不是挤掉标题。
- **进度用 3px 细条加一行说明**（`预测 · 1 / 5 | 先写下你的判断`），不用圆圈步骤条。步骤名与说明各自只出现一次。
- **任务主体两列**：宽度达到 680px 时左列是问题与输入，右列 270px 起（1000px 以上 300px）放验收标准与导师对话。
- **右列定高内部滚动**（`height: 25em`）。两个标签页内容长短不同，定高后切换标签不再推动下方内容；导师面板自己管线程滚动与自动滚底。

## Elevation & Depth

不用阴影、渐变、玻璃和发光。层级只由背景层、半透明描边和留白表达。悬停用 `--dsw-alias-interactive-bg-hover` 的轻微叠加。

## Shapes

圆角跟随宿主：控件与列表项 `--dsw-radius-sm`（8px），输入框、代码块、源码块、预览面 `--dsw-radius-md`（12px），行内 code 4px。不要引入宿主没有的中间值。

## Components

- **Workspace chrome**：品牌、空间选择、创建入口，所有页面复用。
- **Workspace nav**：学习任务与我的笔记，当前项用 ink + 500 字重 + 底部蓝线。
- **Course outline**：可展开节点目录，默认收起；节点标题是主信息，先修关系与状态是辅助信息。
- **Progress**：真实学习顺序，保留 `<ol>` 语义，当前项 `aria-current="step"`，视觉是五段细条。
- **Support tabs**：验收标准与导师对话共用一个定高容器，支持键盘左右切换。
- **Attempt history**：表格承载记录、状态、时间与查看操作，窄面板横向滚动。
- **Notebook**：左侧笔记目录，右侧编辑/预览，和工作区共用同一套 chrome 与 token。

## 布局稳定性

面板里有多处可展开模块和会变长的内容，容易造成跳动。改动时守住这几条：

1. **状态行常驻**。忙碌与错误提示放在固定的 `.status-line` 里（`min-height: 1.6em`），出现时不把下面内容顶下去。不要再把提示作为条件渲染的新增行插到任务上方。
2. **右列定高**。切换标签页不得改变右列高度，也不得推动历次尝试的位置；内容更长时在容器内滚动。
3. **可展开模块只影响自己**。学习目标、学习路线、源码条目、历次尝试用 `<details>`，展开时允许下方内容下移，但触发按钮自身行高不变，箭头用 transform 旋转而不是换字符。
4. **计数与状态标签定高**。`.count` 固定高度，数字从 3 变到 12 时只有宽度变化。
5. **不写死会随字号变化的高度**。控件用固定高度（与宿主一致），文字用 `--ly-fs-*`；文字变大时靠 `min-height` 而不是 `height` 承接。
6. **窄面板靠换行**。页头、表格工具栏、导师消息头都允许 `flex-wrap`，不靠省略号硬挤。

## Do's and Don'ts

- Do 先查宿主有没有对应 token，再考虑新增。
- Do 用源码路径、来源版本、验收标准、尝试状态这些真实字段。
- Do 让目录、阶段、历史记录支持键盘焦点与可见状态。
- Do 改字号时同步检查 11/12/13/14 四档是否够用，不够就先扩契约。
- Don't 使用 Hero、统计卡片、营销文案或虚构图表。
- Don't 使用紫色渐变、玻璃拟态、发光、阴影堆叠或彩色侧边条。
- Don't 添加与内容无关的 01/02/03 装饰编号；只有真实学习顺序才编号。
- Don't 把 18px 以上的标题放进面板——宿主全仓 18px 以上只出现 26 次。
- Don't 为了「反模板」换成奶油陶土、黑底酸绿或报纸风格。

## 学习管理视图（2026-10-16）

默认导航收敛为“当前 / 地图 / 资料 / 笔记”。教学、追问和正文围栏仍由 dsh 原生对话承载，Learny 不提供第二个聊天区域。

- **当前**：本节导读、回到原生会话、个人完成标记、下一节。本节记录默认折叠。标题取宿主正文字号 + 2px，正文与控件跟随宿主设置。
- **地图**：从课程实际 `prerequisite` 生成有向图，保留目录替代视图。宽屏同层并排，窄屏重排为纵向；不缩小整图文字。缺失依赖不补造，有环关系隐藏连线并提示。
- **章节知识图**：把已保存的课程要点与验收标准组织成可展开知识树；提供要点列表。它是现有证据的组织方式，暂未生成更细的概念关系，不能当成完整概念图。
- **资料**：出处按需展开，展示可用摘要与原文地址，取消逐份必读和已读门槛。
- **笔记**：沿用本地 Markdown 存储、浏览器草稿与并发版本校验。
- **完成标记**：写入独立的本地 `node_progress` 表，按空间和课程版本隔离。标记学完不修改提交、评分或掌握程度，旧记录保持可读。
- **实践验收**：从章节详情按需进入，仅记录证据、解释与验收反馈，移除独立导师对话和资料阅读表单。
- **宿主导航**：已开始章节通过 dsh `uiWorkspace.openSession` 返回关联会话，并收起 Learny 面板；不会重新发送教学请求。当前宿主尚未提供本插件使用的消息定位接口，因此只切换会话，不承诺定位到具体消息。

页头、导航、内容采用同一左边界；宽版内边距 24px，窄版 20px。默认页取消固定最低高度、常驻搜索用量与尝试统计。首次能力检查缩为一行入口，详细配置检查按需打开。

## 快速记录与章节笔记（2026-10-19）

- “当前”页与“笔记”页复用速记框，不要求标题、分类或整理指令。正文第一行自动形成标题，保存使用稳定请求 ID；对话摘录使用章节名形成标题并保留消息 ID。
- 目录只使用真实课程章节，不生成不存在的阶段。默认有“空间笔记”，课程更新后的旧章节以版本隔离；宽面板常驻目录，窄面板按需展开。待理解、未整理是跨目录筛选，不是文件夹。
- 笔记默认阅读；编辑自动写入本机，浏览器另保留未保存草稿。元数据和正文采用同一个乐观版本，冲突后先对照合并，禁止自动覆盖。
- 整理操作使用预设动作并自动保存编辑，无需先写 prompt。结果先预览再采用，原文快照可读；历史默认折叠。正文变化后不强行应用旧修订，纯元数据变化不阻止安全恢复。
- 自测替换正文区域，允许在心里回答，由用户判断是否记得；只记录自测状态，不改变实践评分。
- dsh 公开回答操作插槽承载收录图标，通过宿主消息 ID 读取正文。旧消息按照其发生时的章节任务归档；没有可靠关联时放入空间笔记。当前只支持整条回答收录与返回会话。

## 空间设置（2026-10-19）

- 设置是独立任务视图。进入后隐藏空间切换器、学习标签页、课程和笔记；保留底层学习组件的草稿与选中状态，返回时恢复滚动位置和入口焦点。
- 页头只有返回入口、设置标题和当前空间名称，不通过大字号、Hero 或统计卡片制造层级。720px 以上用说明列 + 字段列，窄面板改为上下排布。
- “基本信息”是可编辑表单，支持名称和学习目标本地持久化。保存不自动生成课程；来源类型和项目目录只读。保存区明确显示未保存状态，离开前提供继续编辑或放弃修改的选择。
- 运行环境是单独的次级表面，以只读状态列表展示，明确属于 dsh 且所有空间共享。刷新只读取能力挂载状态，实际可用性在调用时验证。
- 提示、保存结果和失败反馈复用宿主语义 token，结果行预留高度；首次使用提示使用轻蓝背景，与学习正文区分。更长说明和路径允许换行，状态文案不依赖纯颜色识别。
