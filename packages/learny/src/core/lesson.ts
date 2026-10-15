import { z } from 'zod'
import type { ModelGateway, NodeKeyPoint, ResearchBookkeeping, ResearchGateway, Source, StudyNode } from './study-types.ts'
import { readPage, type PageHit } from './course-builder.ts'

const messageOf = (error: unknown) => error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500)

/** Models cite as `[sourceId:web-1]`, `[资料id:web-1]` or `[web-1]`; keep one form. */
export function normalizeLessonCitations(lesson: string): string {
  return lesson.replace(/\[(?:sourceId|source|资料id|来源id|来源)\s*[:：]\s*([a-z0-9-]+)\]/gi, '[$1]')
}

/**
 * Some replies double-escape newlines, so the decoded JSON string holds a literal
 * `\n` instead of a line break and Markdown renders one long paragraph. When the
 * text carries no real newline at all but does carry escaped ones, those are the
 * intended breaks; decode them. A mixed string is left alone rather than guessed at.
 */
export function normalizeLessonText(lesson: string): string {
  const unescaped = /[\r\n]/.test(lesson) || !lesson.includes('\\n')
    ? lesson
    : lesson.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n')
  return normalizeLessonCitations(unescaped)
}

const lessonSchema = z.object({ lesson: z.string().min(80).max(8000) }).strict()

/** Parse a model reply that must be one JSON object, fence or prose around it included. */
function planJson(output: string): unknown {
  const trimmed = output.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/, '$1')
  try { return JSON.parse(trimmed) } catch {
    const start = trimmed.indexOf('{'), end = trimmed.lastIndexOf('}')
    if (start < 0 || end <= start) throw new Error('model reply was not JSON')
    return JSON.parse(trimmed.slice(start, end + 1))
  }
}

export interface NodeMaterial { id: string; title: string; url: string; text: string }

/**
 * Page text for one node, taken from the research page cache when those pages
 * were already read and re-read through the host capability when they were not.
 * The result never leaves the process except inside a model request.
 */
export async function loadNodeMaterial(node: StudyNode, sources: Source[], workspaceId: string, web: ResearchGateway | undefined, bookkeeping: ResearchBookkeeping | undefined, signal: AbortSignal): Promise<NodeMaterial[]> {
  const material: NodeMaterial[] = []
  for (const id of node.sourceIds) {
    const source = sources.find(item => item.id === id)
    if (!source) continue
    signal.throwIfAborted()
    const hit: PageHit = { url: source.url, title: source.title }
    // A project node reads local material that already carries its text; only a
    // researched node needs the host web capability to bring the page back.
    if (!source.excerpt && !web) throw new Error('Learny 的 dsh web 搜索未配置，无法读取资料。')
    const page = source.excerpt
      ? { identity: source.id, url: source.url, title: source.title, text: source.excerpt, sha256: source.sha256 }
      : await readPage(hit, workspaceId, web!, bookkeeping, signal)
    if (page) material.push({ id, title: page.title, url: page.url, text: page.text })
  }
  return material
}

const brief = (node: StudyNode) => ({
  title: node.title,
  briefing: node.briefing ?? '',
  keyPoints: (node.keyPoints ?? []).map((point: NodeKeyPoint) => point.text),
  practice: node.practice,
  criteria: node.criteria.map(criterion => criterion.description),
})

/**
 * Write the teaching text for one node.
 *
 * The learner reads this instead of the source pages, so it has to explain the
 * node in Chinese rather than point at the material. Running on demand keeps a
 * long route's output small and lets a lesson be rewritten without touching the
 * rest of the course.
 */
export async function writeLesson(workspaceName: string, goal: string, node: StudyNode, material: NodeMaterial[], model: ModelGateway, sessionId: string, signal: AbortSignal): Promise<string> {
  const system = `你是 Learny 的课程作者。下面是一个学习节点和它引用的资料。
**学习者不会去读英文原文**：资料是给你的素材，你要把它写成中文讲解，让学习者读完就能理解这一节。
写 350 到 700 字的中文 Markdown（可用小标题、列表，必要时用表格或代码块），按「这一节解决什么问题 → 关键概念和工作机制 → 容易混淆或需要辨析的地方 → 与本节实践的关系」组织。写得像给同事讲清楚一个概念，不要出现「请阅读原文」「见链接」这类空话，不要只罗列术语，也不要写资料里没有的东西；关键判断在句末用 [资料id] 标注依据。
输出严格 JSON：{lesson}，lesson 里的换行用 \\n 转义。不要输出 JSON 之外的任何内容。`
  const payload = JSON.stringify({ workspaceName, goal, node: brief(node), material: material.map(({ id, title, text }) => ({ id, title, text })) })
  try {
    return normalizeLessonText(lessonSchema.parse(planJson(await model.generate({ sessionId, runId: `lesson:${node.id}`, kind: 'lesson', system, payload }, signal))).lesson)
  } catch (first) {
    const repair = await model.generate({ sessionId, runId: `lesson:${node.id}`, kind: 'lesson',
      system: `${system}
上一次输出没有通过校验（${messageOf(first)}）。重新输出**完整**、符合上述结构的 JSON。`,
      payload }, signal)
    return normalizeLessonText(lessonSchema.parse(planJson(repair)).lesson)
  }
}

const followUpSchema = z.object({ answer: z.string().min(40).max(12_000) }).strict()

/**
 * Answer a learner's follow-up about one node — a question, or a passage they
 * selected and want explained further. Grounded in the node's material and the
 * lesson already written, so the answer stays about this node.
 */
export async function answerFollowUp(workspaceName: string, goal: string, node: StudyNode, lesson: string | undefined, material: NodeMaterial[], question: string, model: ModelGateway, sessionId: string, signal: AbortSignal): Promise<string> {
  const system = `你是 Learny 的课程导师。学习者正在学这一节，就某个点追问。只根据下面给出的讲解和资料回答，不编造资料里没有的内容，必要时说明资料没有覆盖到这一点。
用中文 Markdown 回答，250 到 700 字：先把这一点讲清楚，再给一个能验证或对比的小例子，最后指出还需要注意或自己确认的地方。关键判断在句末用 [资料id] 标注依据。
输出严格 JSON：{answer}，answer 里的换行用 \\n 转义。不要输出 JSON 之外的任何内容。`
  const payload = JSON.stringify({ workspaceName, goal, node: brief(node), lesson: lesson ?? '', question,
    material: material.map(({ id, title, text }) => ({ id, title, text })) })
  const read = (output: string) => followUpSchema.parse(planJson(output)).answer
  try {
    return normalizeLessonText(read(await model.generate({ sessionId, runId: `followup:${node.id}`, kind: 'followup', system, payload }, signal)))
  } catch (first) {
    const repair = await model.generate({ sessionId, runId: `followup:${node.id}`, kind: 'followup',
      system: `${system}
上一次输出没有通过校验（${messageOf(first)}）。重新输出**完整**、符合上述结构的 JSON。`,
      payload }, signal)
    return normalizeLessonText(read(repair))
  }
}

/**
 * The message Learny sends to the conversation when the learner starts a node.
 *
 * The lesson is taught in the chat, so this prompt carries everything the agent
 * needs to teach this node well — orientation, the node's own key points, and the
 * material it may use — plus the shape the panel can summarize afterwards. It asks
 * for the lesson itself, not for the learner's answer.
 */
export function nodeTaskPrompt(workspaceName: string, node: StudyNode, material: NodeMaterial[]): string {
  const parts = [
    `【Learny 开始一节】学习空间「${workspaceName}」，本节：${node.title}`,
    node.briefing ? `本节导读：${node.briefing}` : '',
    node.keyPoints?.length ? `本节要点（供你参考，不要逐条复述）：\n${node.keyPoints.map(point => `- ${point.text}（${point.sourceId}）`).join('\n')}` : '',
    material.length ? `可用资料（优先使用，不要编造资料之外的内容）：\n${material.map(item => `- [${item.id}] ${item.title} ${item.url}`).join('\n')}` : '',
    '请按这个结构讲这一节，面向已经会写代码但刚接触这个主题的人：\n1. 这一节解决什么问题（为什么需要它）\n2. 关键概念与工作机制（把容易误解的地方点出来）\n3. 一个学习者可以自己动手验证的下一步',
    '用中文 Markdown，小节标题加粗即可，不要写总结性客套话；引用依据时在句末标注 [资料id]。讲解是给学习者读的，不要替学习者完成实践题。',
    fenceContract(),

  ]
  return parts.filter(Boolean).join('\n\n')
}

/**
 * 讲解里允许穿插的块。Learny 的客户端会把对话正文里的 ```learny 围栏就地渲染成
 * 可交互的块（见 client/fence.tsx），所以这里要把格式和用法讲清楚，模型才知道能写、
 * 怎么写。数量与位置都不限制：块只在真的比文字更清楚时用，中间照常用文字接着讲。
 */
export function fenceContract(): string {
  return [
    '讲解里可以穿插 ```learny 围栏块，数量与位置都不限制，块与块之间照常用文字接着讲。',
    '块体是一个 JSON 对象，只用下面三种：',
    '1) 结构图/流程图（讲「有哪些部分」「怎么走」时优先用图，不要只用文字堆）：',
    '```learny',
    '{"block":"diagram","title":"控制平面与节点","nodes":[{"id":"api","label":"API Server","group":"控制平面"},{"id":"kubelet","label":"kubelet","group":"节点"}],"edges":[{"from":"api","to":"kubelet","label":"下发 Pod 规格"}]}',
    '```',
    '2) 自测（讲完一个容易混淆的点后，让学习者当场判断）：',
    '```learny',
    '{"block":"quiz","title":"这一节的自测","questions":[{"q":"问题","options":["选项A","选项B"],"answer":1,"explain":"为什么是它"}]}',
    '```',
    '3) 要点卡（把一段容易散的结论收拢成一条，正文里不必再重复）：',
    '```learny',
    '{"block":"note","title":"要点标题","body":"一两句话，段间空行分段"}',
    '```',
    '要求：图的 nodes 每个要有唯一 id，edges 只引用已有的 id；节点文字要短（不超过 12 个字），',
    '细节放正文里写，不要塞进框；一张图 3~10 个节点，再多就拆成两张；',
    'answer 是从 0 开始的正确选项下标；explain 必须解释为什么，不要只写"正确"；',
    '每节最多 2~3 个块，讲不清的地方用文字补，不要为了好看硬塞块；JSON 必须能被直接解析，不要加注释或多余文字。',
  ].join('\n')
}

/**
 * 从一段讲解里取出 ```learny 围栏。块在对话里渲染，宿主侧只关心载荷本身：
 * 这里按出现次序解析，认得出来的才回收，解析不了的原样跳过。
 */
export function fencesIn(markdown: string): { kind: string; payload: string }[] {
  const found: { kind: string; payload: string }[] = []
  const pattern = /```learny[^\n]*\n([\s\S]*?)```/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(markdown)) !== null) {
    const body = match[1].trim()
    if (!body.startsWith('{')) continue
    try {
      const value = JSON.parse(body) as { block?: unknown }
      if (typeof value.block !== 'string' || !value.block) continue
      found.push({ kind: value.block, payload: body })
    } catch { /* 写坏了就当作普通文字，不回收 */ }
  }
  return found
}
