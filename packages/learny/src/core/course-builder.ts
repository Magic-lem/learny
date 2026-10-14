import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { basename, join, relative } from 'node:path'
import { z } from 'zod'
import type { Workspace } from './types.ts'
import type { ModelGateway, ResearchBookkeeping, ResearchGateway, Source, StudyCourse, StudyNode } from './study-types.ts'
import { PAGE_CACHE_FORMAT, ResearchBudgetError } from './research-ledger.ts'
import { sourceIdentity } from './source-identity.ts'
import { htmlToText } from './html-text.ts'

const ignored = new Set(['.git', 'node_modules', 'dist', 'build', '.next', 'coverage', '.turbo'])
const priority = (path: string) => {
  const name = basename(path).toLowerCase()
  if (name === 'readme.md') return 0
  if (name === 'package.json' || name === 'pyproject.toml' || name === 'go.mod') return 1
  if (/^(index|main|app|server)\./.test(name)) return 2
  return 3
}

async function collect(root: string, current: string, output: string[], depth = 0): Promise<void> {
  if (depth > 4 || output.length >= 24) return
  let entries
  try { entries = await readdir(current, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.env.example') continue
    if (ignored.has(entry.name)) continue
    const path = join(current, entry.name)
    if (entry.isDirectory()) await collect(root, path, output, depth + 1)
    else if (entry.isFile() && /\.(md|mdx|json|ya?ml|toml|go|rs|java|kt|py|ts|tsx|js|jsx|vue|sql|sh)$/.test(entry.name)) output.push(path)
    if (output.length >= 24) return
  }
}

export async function projectSources(workspace: Workspace): Promise<Source[]> {
  if (workspace.kind !== 'project' || !workspace.materialPath) return []
  const paths: string[] = []
  await collect(workspace.materialPath, workspace.materialPath, paths)
  paths.sort((a, b) => priority(a) - priority(b) || a.localeCompare(b))
  const selected = paths.slice(0, 8)
  const sources: Source[] = []
  for (const [index, path] of selected.entries()) {
    let content
    try { content = await readFile(path, 'utf8') } catch { continue }
    const excerpt = content.slice(0, 5000)
    sources.push({
      id: `project-${index + 1}`,
      title: basename(path),
      path: relative(workspace.materialPath, path) || basename(path),
      url: `file://${path}`,
      sha256: createHash('sha256').update(content).digest('hex'),
      excerpt,
      origin: 'project',
    })
  }
  return sources
}

export async function buildStarterCourse(workspace: Workspace): Promise<StudyCourse> {
  const sources = await projectSources(workspace)
  const source = (index: number) => sources[index]?.id ? [sources[index].id] : []
  const title = workspace.name.trim()
  const nodes: StudyNode[] = [
    { id: 'orientation', title: '项目结构与入口', prerequisite: null,
      prediction: `你认为“${title}”从哪里开始运行？先根据项目目录写下入口和主要组成。`, retryPrediction: '迁移题：如果入口文件替换，哪些模块仍然会被复用？先预测。',
      practice: '打开项目入口和配置文件，画出一次启动路径，记录文件名、输入和输出。', retryPractice: '选择一个不同入口或命令，比较它与原路径的共同点和差异。',
      explanation: '用自己的话解释项目入口、主要模块和一次启动路径，并标记一个还不确定的地方。', sourceIds: source(0),
      criteria: [{ id: 'entry', description: '用实际文件说明项目入口和启动路径。' }, { id: 'structure', description: '能把主要模块与各自职责联系起来。' }] },
    { id: 'flow', title: '核心模块与数据流', prerequisite: 'orientation',
      prediction: '一个核心请求或任务会经过哪些模块？数据在哪里被创建、转换和保存？', retryPrediction: '迁移题：替换一个中间模块后，输入输出会在哪里改变？先预测。',
      practice: '沿一个核心函数或请求追踪调用方、关键数据结构和返回值，记录至少两个源码位置。', retryPractice: '比较成功和失败路径，指出哪个状态或错误信息在模块之间传递。',
      explanation: '解释核心数据流如何跨越模块，说明一个设计取舍和一个可验证的假设。', sourceIds: source(1).concat(source(2)),
      criteria: [{ id: 'trace', description: '给出一条由源码支持的调用或数据流路径。' }, { id: 'state', description: '说明关键状态、输入输出或错误如何传递。' }] },
    { id: 'verify', title: '运行链路与验证', prerequisite: 'flow',
      prediction: '你会用什么最小实验验证自己的理解？预期看到什么结果？', retryPrediction: '迁移题：如果实验结果与预期相反，你先检查哪一层？',
      practice: '执行或设计一个最小验证，记录命令、输入、观察结果和对应源码证据。', retryPractice: '设计一个边界或失败实验，写出预期结果与判断依据。',
      explanation: '把项目的结构、数据流和验证方法连成一段可以向别人讲清楚的解释。', sourceIds: source(3).concat(source(4)),
      criteria: [{ id: 'evidence', description: '实践记录包含可复查的输入、结果或源码证据。' }, { id: 'explanation', description: '解释能连接结构、数据流和验证结果，而不是只复述文件名。' }] },
  ]
  return { version: `project-starter@${workspace.id}:v1`, title, intro: sources.length ? `已从 ${workspace.materialPath} 选取 ${sources.length} 份材料，先生成一条项目导览路线。` : '先用学习目标生成一条项目导览路线，之后可以继续补充源码材料。', nodes, sources }
}

const planNodeSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,48}$/),
  title: z.string().min(2).max(120),
  prerequisite: z.string().regex(/^[a-z0-9][a-z0-9-]{1,48}$/).nullable(),
  // Written by the lesson pass below, so the route skeleton stays inside one
  // output budget; a node without it still has briefing, key points and sources.
  lesson: z.string().min(80).max(4000).optional(),
  // Orientation the learner reads before predicting, and the takeaways they check
  // against the material afterwards. Neither may state the answer outright.
  briefing: z.string().min(10).max(800),
  keyPoints: z.array(z.object({ sourceId: z.string().min(1).max(48), text: z.string().min(4).max(400) }).strict()).min(1).max(5),
  practiceKind: z.enum(['command', 'config', 'compare', 'design', 'mixed']).catch('mixed'),
  prediction: z.string().min(1).max(2000),
  retryPrediction: z.string().min(1).max(2000),
  practice: z.string().min(1).max(4000),
  retryPractice: z.string().min(1).max(4000),
  explanation: z.string().min(1).max(3000),
  sourceIds: z.array(z.string()).min(1).max(8),
  criteria: z.array(z.object({ id: z.string().min(1).max(48), description: z.string().min(1).max(1000) }).strict()).min(1).max(6),
}).strict()
const planSchema = z.object({ title: z.string().min(2).max(160), intro: z.string().min(1).max(2000), nodes: z.array(planNodeSchema).min(3).max(8) }).strict()

/** The model may fence its JSON or wrap it in a sentence; both are accepted. */
function planJson(output: string): unknown {
  const trimmed = output.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/, '$1')
  try { return JSON.parse(trimmed) } catch {
    const start = trimmed.indexOf('{'), end = trimmed.lastIndexOf('}')
    if (start < 0 || end <= start) throw new Error('course proposal was not JSON')
    return JSON.parse(trimmed.slice(start, end + 1))
  }
}

function sourceId(index: number): string { return `web-${index + 1}` }

/** Models sometimes describe the first node's prerequisite instead of leaving it
 * null. Keep the id-or-null contract, resolving a title to its node id and
 * dropping an unusable value so one stray string cannot void a researched route. */
function normalizePrerequisites(value: unknown): unknown {
  const body = value as { nodes?: unknown } | null
  if (!body || typeof body !== 'object' || !Array.isArray(body.nodes)) return value
  const nodes = body.nodes.filter(node => node && typeof node === 'object') as Record<string, unknown>[]
  const ids = new Set(nodes.map(node => typeof node.id === 'string' ? node.id : '').filter(Boolean))
  const byTitle = new Map(nodes.filter(node => typeof node.id === 'string' && typeof node.title === 'string')
    .map(node => [(node.title as string).trim(), node.id as string]))
  return { ...body, nodes: body.nodes.map(raw => {
    const node = raw as Record<string, unknown>
    if (!node || typeof node !== 'object') return raw
    const prerequisite = node.prerequisite
    if (typeof prerequisite === 'string' && ids.has(prerequisite)) return node
    return { ...node, prerequisite: typeof prerequisite === 'string' ? byTitle.get(prerequisite.trim()) ?? null : null }
  }) }
}

const SOURCE_LIMIT = 6
const EXCERPT_LIMIT = 7000
/**
 * Below this, a run has too little grounded material to plan from. A spent
 * budget stops research here rather than discarding material already read.
 */
const MINIMUM_SOURCES = 2

const digest = (text: string) => createHash('sha256').update(text).digest('hex')
const messageOf = (error: unknown) => error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500)
const hostOf = (url: string) => { try { return new URL(url).hostname } catch { return 'source' } }

export interface PageHit { url: string; title?: string; snippet?: string; publishedAt?: string }
export interface PageMaterial { identity: string; url: string; title: string; text: string; sha256: string }

/**
 * Read one page through the host fetch capability.
 *
 * The page text is material for a model call, not a record: it is reused from the
 * page cache when that page was already read, and otherwise read once, cleaned of
 * markup and stored in that cache. Returns null when there is nothing usable —
 * a search snippet, when one exists, is the fallback rather than a bare URL.
 */
export async function readPage(hit: PageHit, workspaceId: string, web: ResearchGateway, bookkeeping: ResearchBookkeeping | undefined, signal: AbortSignal): Promise<PageMaterial | null> {
  const identity = sourceIdentity(hit.url)
  if (!identity) return null
  const title = hit.title?.trim() || hostOf(hit.url)
  const cached = bookkeeping?.cachedPage(identity)
  if (cached) return { identity, url: cached.url, title: cached.title || title, text: cached.excerpt, sha256: cached.sha256 }
  let call: string | undefined
  try {
    call = await bookkeeping?.begin(workspaceId, 'fetch', identity)
    const page = await web.fetch({ url: hit.url }, signal)
    if (page.statusCode < 200 || page.statusCode >= 300) throw new Error(`page read returned HTTP ${page.statusCode}`)
    // An HTML body arrives as markup; keep its prose, not its tags.
    const text = page.body.kind === 'html' ? htmlToText(page.body.content, EXCERPT_LIMIT) : page.body.content.slice(0, EXCERPT_LIMIT)
    // A page whose markup yielded almost nothing is a failed extraction, not material.
    if (page.body.kind === 'html' && text.trim().length < 120) throw new Error('page read returned too little text')
    if (!text.trim()) throw new Error('page read returned no text')
    if (call) await bookkeeping!.finish(call, 'ok')
    const material: PageMaterial = { identity, url: hit.url, title, text, sha256: digest(text) }
    await bookkeeping?.rememberPage({ identity, url: material.url, title: material.title, excerpt: text,
      sha256: material.sha256, fetchedAt: new Date().toISOString(), format: PAGE_CACHE_FORMAT })
    return material
  } catch (error) {
    if (call) await bookkeeping!.finish(call, 'failed', messageOf(error))
    if (error instanceof ResearchBudgetError) throw error
    signal.throwIfAborted()
    const snippet = hit.snippet?.trim() ?? ''
    return snippet ? { identity, url: hit.url, title, text: snippet, sha256: digest(snippet) } : null
  }
}

/**
 * Search and fetch topic material through the host's dsh web capability.
 *
 * Address identity decides what counts as one piece of material, so a gateway
 * that tags the pages it retrieved, or the same page reached twice under
 * different tags, yields one source. A page already read is reused from the
 * ledger instead of fetched again, and every call that is made is recorded
 * against the rolling budget before it happens.
 */
export interface TopicResearch { sources: Source[]; /** source id → page text, held only for the planning call. */ material: Map<string, string> }

export async function researchTopic(workspace: Workspace, web: ResearchGateway, signal: AbortSignal, bookkeeping?: ResearchBookkeeping): Promise<TopicResearch> {
  const query = [workspace.name.trim(), workspace.goal.trim(), 'official documentation architecture concepts hands-on'].filter(Boolean).join(' ')
  const search = await bookkeeping?.begin(workspace.id, 'search', query)
  let hits: readonly { url: string; title?: string; snippet?: string; publishedAt?: string }[]
  try {
    hits = (await web.search({ query, maxResults: SOURCE_LIMIT }, signal)).sources
    if (search) await bookkeeping!.finish(search, 'ok')
  } catch (error) {
    if (search) await bookkeeping!.finish(search, 'failed', messageOf(error))
    throw error
  }
  const sources: Source[] = []
  const material = new Map<string, string>()
  const seen = new Set<string>()
  const seenContent = new Set<string>()
  for (const hit of hits) {
    signal.throwIfAborted()
    if (!hit.url) continue
    const identity = sourceIdentity(hit.url)
    if (!identity || seen.has(identity)) continue
    seen.add(identity)
    let page
    try {
      page = await readPage(hit, workspace.id, web, bookkeeping, signal)
    } catch (error) {
      // A spent budget is not this page's failure: keep the material already
      // read when there is enough of it, and report the budget otherwise.
      if (error instanceof ResearchBudgetError && sources.length >= MINIMUM_SOURCES) break
      throw error
    }
    if (!page || seenContent.has(page.sha256)) continue
    seenContent.add(page.sha256)
    const id = sourceId(sources.length)
    sources.push({ id, title: page.title, path: page.url, url: page.url, sha256: page.sha256, origin: 'web' })
    material.set(id, page.text)
    if (sources.length >= SOURCE_LIMIT) break
  }
  if (!sources.length) throw new Error('dsh web search returned no readable source material for this learning topic')
  return { sources, material }
}

/** Ask the current dsh session model to turn grounded evidence into a learning route. */
export async function planCourse(workspace: Workspace, sources: Source[], model: ModelGateway, sessionId: string, signal: AbortSignal, material: Map<string, string> = new Map()): Promise<StudyCourse> {
  const framing = workspace.kind === 'topic'
    ? '这是知识主题学习，不是源码项目；不要写项目结构、入口、模块数据流等泛化节点。'
    : '这是项目学习；节点必须引用本地材料中的真实文件、命令、配置或调用路径。'
  const system = `你是 Learny 的课程设计师。根据学习空间目标和提供的资料，设计一条可实践、可验收的学习路线。${framing}只使用提供资料支持的事实；每个节点至少引用一个 sourceId。节点按先备知识、再核心机制、再动手验证组织，3 到 8 个节点。节点 id 用小写英文短横线（例如 core-concepts）；prerequisite 只能填另一个节点的 id，第一个节点必须填 null。
briefing 是 2 到 3 句导读，说明这一节在讲什么、和上一节什么关系，出现在讲解之前。
keyPoints 是 2 到 4 条速览要点，每条用 sourceId 指明出处。
practiceKind 决定实践怎样记录：command（执行命令、观察输出）、config（写配置、验证生效）、compare（对比两种做法）、design（做方案取舍）、mixed（说不清时用这个）。
输出严格 JSON：{title,intro,nodes:[{id,title,prerequisite,briefing,keyPoints:[{sourceId,text}],practiceKind,prediction,retryPrediction,practice,retryPractice,explanation,sourceIds,criteria:[{id,description}]}]}。不要输出 Markdown、注释或资料之外的断言。`
  const sourcePayload = sources.map(source => ({ id: source.id, title: source.title, url: source.url,
    excerpt: material.get(source.id) ?? source.excerpt ?? '' }))
  const payload = JSON.stringify({ workspace, sources: sourcePayload })
  const output = await model.generate({ sessionId, runId: `course:${workspace.id}`, kind: 'course', system, payload }, signal)
  let proposal
  try {
    proposal = planSchema.parse(normalizePrerequisites(planJson(output)))
  } catch (first) {
    // One corrective retry: the model sees what it produced and the validation
    // message, instead of the learner losing the research to one JSON slip.
    const repair = await model.generate({ sessionId, runId: `course:${workspace.id}`, kind: 'course',
      system: `${system}
上一次输出没有通过校验（${messageOf(first)}）。按同一份资料重新输出**完整**、符合上述结构的 JSON，只输出 JSON。`,
      payload: JSON.stringify({ workspace, sources: sourcePayload, previousOutput: output.slice(0, 20_000) }) }, signal)
    proposal = planSchema.parse(normalizePrerequisites(planJson(repair)))
  }
  const ids = new Set(sources.map(source => source.id))
  const nodeIds = new Set(proposal.nodes.map(node => node.id))
  if (nodeIds.size !== proposal.nodes.length || proposal.nodes.some(node => node.sourceIds.some(id => !ids.has(id)))) throw new Error('course proposal contains unknown source references')
  if (proposal.nodes.some(node => node.prerequisite !== null && !nodeIds.has(node.prerequisite))) throw new Error('course proposal contains an unknown prerequisite')
  // A reading point that cites a source the node does not carry cannot be
  // checked, so it is dropped rather than failing the whole route.
  const nodes = proposal.nodes.map(node => ({ ...node, keyPoints: node.keyPoints.filter(point => node.sourceIds.includes(point.sourceId)) })) as StudyNode[]
  return { version: `research@${workspace.id}:${new Date().toISOString()}`, title: proposal.title, intro: proposal.intro, nodes, sources }
}
