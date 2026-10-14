import { z } from 'zod'
import type { ModelGateway, NodeKeyPoint, ResearchBookkeeping, ResearchGateway, Source, StudyNode } from './study-types.ts'
import { readPage, type PageHit } from './course-builder.ts'

const messageOf = (error: unknown) => error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500)

/** Models cite as `[sourceId:web-1]` about as often as `[web-1]`; keep one form. */
export function normalizeLessonCitations(lesson: string): string {
  return lesson.replace(/\[sourceId:\s*([a-z0-9-]+)\]/gi, '[$1]')
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
export async function loadNodeMaterial(node: StudyNode, sources: Source[], workspaceId: string, web: ResearchGateway, bookkeeping: ResearchBookkeeping | undefined, signal: AbortSignal): Promise<NodeMaterial[]> {
  const material: NodeMaterial[] = []
  for (const id of node.sourceIds) {
    const source = sources.find(item => item.id === id)
    if (!source) continue
    signal.throwIfAborted()
    const hit: PageHit = { url: source.url, title: source.title }
    const page = source.excerpt
      ? { identity: source.id, url: source.url, title: source.title, text: source.excerpt, sha256: source.sha256 }
      : await readPage(hit, workspaceId, web, bookkeeping, signal)
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
    return normalizeLessonCitations(lessonSchema.parse(planJson(await model.generate({ sessionId, runId: `lesson:${node.id}`, kind: 'lesson', system, payload }, signal))).lesson)
  } catch (first) {
    const repair = await model.generate({ sessionId, runId: `lesson:${node.id}`, kind: 'lesson',
      system: `${system}
上一次输出没有通过校验（${messageOf(first)}）。重新输出**完整**、符合上述结构的 JSON。`,
      payload }, signal)
    return normalizeLessonCitations(lessonSchema.parse(planJson(repair)).lesson)
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
    return normalizeLessonCitations(read(await model.generate({ sessionId, runId: `followup:${node.id}`, kind: 'followup', system, payload }, signal)))
  } catch (first) {
    const repair = await model.generate({ sessionId, runId: `followup:${node.id}`, kind: 'followup',
      system: `${system}
上一次输出没有通过校验（${messageOf(first)}）。重新输出**完整**、符合上述结构的 JSON。`,
      payload }, signal)
    return normalizeLessonCitations(read(repair))
  }
}
