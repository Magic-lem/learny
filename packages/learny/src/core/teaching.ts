import type { StudyCourse, StudyNode } from './study-types.ts'

/**
 * A teaching brief is derived from the existing route, not a second curriculum.
 * The prerequisite may differ from the preceding item in a branching route.
 */
export function teachingBrief(node: StudyNode, course?: Pick<StudyCourse, 'nodes'>) {
  const index = course?.nodes.findIndex(item => item.id === node.id) ?? -1
  const prerequisite = course?.nodes.find(item => item.id === node.prerequisite)
  const next = index >= 0 ? course?.nodes[index + 1] : undefined
  return {
    chapter: index >= 0 ? index + 1 : null,
    prerequisite: prerequisite ? { title: prerequisite.title, briefing: prerequisite.briefing ?? '' } : null,
    next: next ? { title: next.title, briefing: next.briefing ?? '' } : null,
    outcomes: (node.criteria ?? []).map(criterion => criterion.description),
    optionalPractice: node.practice ?? '',
  }
}

/**
 * Shared authoring guidance for native dsh teaching and the legacy lesson API.
 * This is an instruction to the host model, not an automatic quality guarantee.
 * See docs/internal/teaching-design.md for research, scope, and manual review.
 */
export function teachingContract(mode: 'chat' | 'material'): string {
  const evidence = mode === 'chat'
    ? '资料摘录和课程要点只是选题线索，可能截断或概括失真。先用宿主工具读取相关原文件。凡正文断言通信协议、函数调用、依赖或进程边界，都要沿对应实现/配置交叉核对，不能只重读 README 或架构图。概览课的讲授深度与备课证据范围是两件事：教师仍要读实现核实，呈现给学习者时才简化；无法交叉核对时，明确写成“文档概览，尚未由实现核实”，不当作实现事实；缺少必要原理时，使用宿主已配置的网页搜索查阅官方文档并读相关正文。不要凭记忆补全陌生术语，也不要为了搜索而搜索。若工具不可用或证据不足，明确缺口，收窄讲授范围。'
    : '当前调用没有文件读取或网页搜索工具。只使用给出的资料；资料缺少必要原理或实现时，明确缺口，收窄讲授范围，不假装已经读过其他文件或搜索过网页。'
  return `你正在编写可供自学的正式中文课程章节。学习者应当能直接读本章建立理解，原始资料用于核对，不承担替你讲课的责任。

编写过程：
1. 备课：结合学习者基础、本节目标、先备章节与下一节边界，确定本节的中心问题、可观察的学习结果和一个贯穿案例。导读、要点与验收标准是自动生成的备课草案，若只是要求记组件/抄图，或与学习者背景冲突，应调整为解释关系和运用知识的目标；不能继承其中的错误，也不能以“概览”省略理解所需的前提。先安排概念依赖与具体小节，再写正文；最终回答直接从章标题开始；不把备课过程、工具操作计划或自我评价当成教程正文，阅读路线使用实际小节名称，不展示 Markdown 标记。
2. 核实：${evidence}
3. 成文：用有先后关系的章节、完整段落、解释和示范带领学习者理解，按下方要求写出正文。
4. 复核：交付前对照学习目标逐项检查；缺少概念前提、解释跳步、例子不完整、引用不支持断言时先修订。不输出“已通过质量检查”等自我认证。

正文组织：
- 开头用 ## 写本章标题，简短交代学习结果、与前面知识的连接以及本章范围，给出具体小节的阅读路线。正文用 ### 组织有实际含义的小节，确有必要再用 ####；不要仅用加粗句子充当整章结构。
- 小节标题要告诉读者这一段在解释什么，例如“创建请求为什么要经过调度器”；不要所有章节都套“解决什么问题 / 关键概念 / 下一步”三段。小节数量由中心问题和概念依赖决定。
- 从学习者熟悉的具体场景开始，逐步引入抽象，不以产品卖点或 README 摘要代替情境。术语在首次需要时定义，解释它解决什么问题、怎样工作、在本例中对应什么；不要在一个段落塞入大量未解释的新名词。核心新概念需要给出足以理解本章的说明；可以把内部细节留到后续，但不能用“现在只要记住”“暂时不必懂”跳过概念本身。
- 每段推进一个推理环节，小节之间说明前一结论为何引出下一问题。核心机制必须讲清原因、步骤、输入输出或状态变化；不要用组件职责清单、箭头链、术语表替代讲解。
- 围绕贯穿案例至少完整示范一次：给出具体但可标为假设的输入、需求或请求，逐步展开关键过程，指出中间观察点与结果，再解释结果为何支持结论。仅说“一次 create 从 A 到 B”，然后依次列职责，不算完整示范。源码课展示经核实的短源码并逐段解读；架构入门课可展示有依据的请求场景、消息或分层图，不必硬塞实现细节。
- 图、表、代码与正文互相解释：图前交代看什么，图后解读关键关系。示意、伪代码、假设输入、预期输出必须标明；不能把概念关系图画成部署进程图，也不能把假设故障写成本次实测。
- 区分通用原理、项目文档说法与源码已证实的实现。引用资料只支持对应断言，性能宣传不能写成验证结论；发现旧讲解或路线要点错误，应在相应位置明确更正。
- 每章结尾收拢概念之间的关系，说明下一节会沿哪条线继续。讲授后可给一个自己动手验证的下一步，标为可选并说明观察点/判断依据；也可穿插可跳过的自测。先示范再独立练习，完整教学示范不能被“不要代写实践答案”替代。不要要求先猜想、先答题或先读原文才能继续学习。

完整性和表达：
- 不按统一字数或固定段数压缩整章；篇幅由学完本节所需的推导决定，也不重复凑字数。若单次输出预算不足，优先完成一个连贯部分并明确标出尚未展开的小节，不能把未讲内容假装为已讲完。
- 使用清楚、准确的中文书面语，保留必要英文术语。不要用“你会立刻迷失”“只要记住”“显然”等话替代解释；不要用聊天式邀约、泛泛鼓励收尾。
${sourcePresentationContract()}`
}


/** Evidence stays available without interrupting tutorial prose with storage IDs. */
export function sourcePresentationContract(): string {
  return `来源呈现：
- 正文不输出内部资料编号或引用串，例如 [project-1]、[web-2]、[sourceId:…]；提供的 id 仅用于内部追踪，不是读者需要记住的概念。
- 源码讲解中仍保留真正有助理解的文件名、函数名、配置项；行号仅在读取确认后使用。不要把必要代码定位当作引用编号一起删掉。
- 文档与实现不一致、推断、尚未验证的结论等限定，必须在对应段落讲清，不能藏进章末。
- 本次回答末尾用一个 learny 围栏列出“本章依据”，客户端会默认折叠。只列本次实际使用的资料，title 用真实文件路径或文档标题，url 用已提供或工具读取确认的原地址，note 简述它支持的内容。已有资料的 sourceId 沿用输入值，新增资料可省略 sourceId。不得编造标题、地址、行号或读取结果；没有可用依据时直接说明缺口，不生成虚假的来源块。不要在正文重复来源清单。
\`\`\`learny
{"block":"sources","items":[{"sourceId":"project-1","title":"src/service/create.go","url":"file:///repo/src/service/create.go","note":"创建入口及请求参数"}]}
\`\`\`
示例仅说明格式，不是本次已读资料。JSON 必须能直接解析，字段里的换行用 \\n 转义。`
}
