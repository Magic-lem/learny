/**
 * Learny 围栏通道：把对话正文里的 ```learny 围栏就地替换成 Learny 自己的块。
 *
 * 宿主（dsh 0.2.0-rc.2）的 markdown 渲染器没有对外暴露任何"按语言接管围栏"的
 * 入口——它只接受 pathImages / fileMentions 两样注入，也没有 genui 注释里提到的
 * registerFenceRenderer。所以想留在正文里，只能在 DOM 层接管代码块。
 *
 * 这一版刻意做小：
 * - 只接管已经停止输出的块。流式途中的块原样显示成代码，输出完再变成块。
 * - 只认自己的载荷：正文体必须是一个 JSON 对象，且 block 字段是我们认识的类型。
 *   宿主对未注册语言统一显示"代码块"，语言名不出现在 DOM 里，所以按内容识别。
 * - 解析失败一律保持原代码块，绝不隐藏——学习者最多看到一段 JSON，不会看到空白。
 */
import { useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { DiagramView } from './diagram.tsx'
import type { DiagramSpec } from './diagram-layout.ts'
import { parseSourcesBlock, sourceHref, type SourcesBlock } from './source-block.ts'

export type QuizQuestion = {
  q: string
  options: string[]
  /** 正确选项下标；多选时给数组。 */
  answer: number | number[]
  explain?: string
}

export type FenceBlock =
  | { block: 'note'; title?: string; body: string }
  | { block: 'quiz'; title?: string; questions: QuizQuestion[] }
  | DiagramSpec
  | SourcesBlock

const BLOCK_TYPES = new Set(['note', 'quiz', 'diagram', 'sources'])
const HOST_CLASS = 'learny-fence-host'
const HIDDEN_CLASS = 'learny-fence-hidden'

/** 围栏正文体 → 块载荷；不是我们的就返回 null，调用方保持原样。 */
export function parseFence(text: string): FenceBlock | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null
  let value: unknown
  try { value = JSON.parse(trimmed) } catch { return null }
  if (typeof value !== 'object' || value === null) return null
  const block = (value as { block?: unknown }).block
  if (typeof block !== 'string' || !BLOCK_TYPES.has(block)) return null
  if (block === 'sources') return parseSourcesBlock(value)
  const candidate = value as FenceBlock
  if (candidate.block === 'quiz' && !Array.isArray(candidate.questions)) return null
  if (candidate.block === 'note' && typeof candidate.body !== 'string') return null
  if (candidate.block === 'diagram' && (!Array.isArray(candidate.nodes) || candidate.nodes.length === 0)) return null
  return candidate
}

/** 讲解里的要点块：一段话，带可选的标题。 */
function NoteBlock({ block }: { block: Extract<FenceBlock, { block: 'note' }> }) {
  return <section className="learny-fence-note">
    {block.title && <h4>{block.title}</h4>}
    {block.body.split(/\n{2,}/).map((para, index) => <p key={index}>{para}</p>)}
  </section>
}

/** 自测块：选完提交，就地判分并给出解析。 */
function QuizBlock({ block }: { block: Extract<FenceBlock, { block: 'quiz' }> }) {
  const questions = block.questions
  const [picks, setPicks] = useState<(number | null)[]>(() => questions.map(() => null))
  const [graded, setGraded] = useState(false)
  const answers = questions.map(question => new Set(Array.isArray(question.answer) ? question.answer : [question.answer]))
  const answered = picks.filter(pick => pick !== null).length
  const right = questions.reduce((total, question, index) => total + (picks[index] !== null && answers[index].has(picks[index]!) ? 1 : 0), 0)
  return <section className="learny-fence-quiz">
    <header>
      <span className="learny-fence-label">自测</span>
      {block.title && <h4>{block.title}</h4>}
    </header>
    <ol>
      {questions.map((question, index) => <li key={index}>
        <p className="learny-fence-question">{question.q}</p>
        <div className="learny-fence-options" role="radiogroup" aria-label={question.q}>
          {question.options.map((option, optionIndex) => {
            const picked = picks[index] === optionIndex
            const isRight = answers[index].has(optionIndex)
            const state = graded && picked ? (isRight ? ' is-right' : ' is-wrong') : graded && isRight ? ' is-answer' : ''
            return <button type="button" key={optionIndex} role="radio" aria-checked={picked} disabled={graded}
              className={`learny-fence-option${picked ? ' is-picked' : ''}${state}`}
              onClick={() => setPicks(current => current.map((value, at) => at === index ? optionIndex : value))}>
              <span className="learny-fence-mark" aria-hidden="true">{picked ? '●' : '○'}</span>{option}
            </button>
          })}
        </div>
        {graded && question.explain && <p className="learny-fence-explain">{question.explain}</p>}
      </li>)}
    </ol>
    <div className="learny-fence-actions">
      <button type="button" className="learny-fence-submit" disabled={graded || answered === 0} onClick={() => setGraded(true)}>提交答卷</button>
      <span className="learny-fence-score">{graded ? `答对 ${right} / ${questions.length}` : `已选 ${answered}/${questions.length}`}</span>
      {graded && <button type="button" className="learny-fence-retry" onClick={() => { setGraded(false); setPicks(questions.map(() => null)) }}>重做一遍</button>}
    </div>
  </section>
}

/** A quiet, keyboard-accessible bibliography, collapsed until requested. */
function SourcesView({ block }: { block: SourcesBlock }) {
  return <details className="learny-fence-sources">
    <summary>本章依据<span className="learny-source-count">{block.items.length} 份资料</span></summary>
    <ul>{block.items.map((item, index) => {
      const href = sourceHref(item.url)
      return <li key={index}>
        {href ? <a href={href} target="_blank" rel="noopener noreferrer">{item.title}</a> : <span className="learny-source-title">{item.title}</span>}
        {item.url?.startsWith('file:') && <span className="learny-source-kind">本地文件</span>}
        {item.note && <p>{item.note}</p>}
      </li>
    })}</ul>
  </details>
}

export function FenceView({ payload }: { payload: FenceBlock }) {
  return <div className="learny-fence" data-learny-fence={payload.block}>
    {payload.block === 'sources' && <SourcesView block={payload} />}
    {payload.block === 'note' && <NoteBlock block={payload} />}
    {payload.block === 'quiz' && <QuizBlock block={payload} />}
    {payload.block === 'diagram' && <DiagramView spec={payload} />}
  </div>
}

type Mount = { card: HTMLElement; container: HTMLElement; root: Root }

/** 候选卡片：宿主的代码块外壳。锚点用语义属性，避开每日构建都会变的哈希类名。 */
function cards(root: ParentNode): HTMLElement[] {
  const found = new Set<HTMLElement>()
  for (const content of root.querySelectorAll<HTMLElement>('[data-code-block-content]')) {
    if (content.parentElement) found.add(content.parentElement)
  }
  for (const card of root.querySelectorAll<HTMLElement>('.md-code-block')) found.add(card)
  return [...found]
}

/**
 * 装上通道，返回卸载函数。纯 DOM 接管：宿主重渲染后重新扫描补挂，
 * 已经挂过的块靠卡片上的标记跳过。
 */
export function installFenceRenderer(): () => void {
  const mounts = new Set<Mount>()
  let scheduled = false

  const unmount = (mount: Mount) => {
    mounts.delete(mount)
    try { mount.root.unmount() } catch { /* 宿主已经把节点拿走了 */ }
    mount.container.remove()
    mount.card.classList.remove(HIDDEN_CLASS)
    mount.card.removeAttribute('hidden')
    delete mount.card.dataset.learnyFence
  }

  const scan = () => {
    scheduled = false
    // 先回收：宿主换掉了卡片或我们的容器，就拆掉重挂，避免留下孤儿块。
    for (const mount of [...mounts]) {
      if (!mount.card.isConnected || !mount.container.isConnected || mount.card.nextElementSibling !== mount.container) unmount(mount)
    }
    for (const card of cards(document)) {
      if (card.classList.contains(HIDDEN_CLASS)) continue
      if (card.closest('[data-streaming]')) continue
      const body = card.querySelector('pre')?.textContent ?? ''
      const payload = parseFence(body)
      if (!payload) continue
      const container = document.createElement('div')
      container.className = HOST_CLASS
      card.classList.add(HIDDEN_CLASS)
      card.setAttribute('hidden', '')
      card.after(container)
      const root = createRoot(container)
      root.render(<FenceView payload={payload} />)
      card.dataset.learnyFence = payload.block
      mounts.add({ card, container, root })
    }
  }

  const schedule = () => { if (scheduled) return; scheduled = true; queueMicrotask(scan) }
  const observer = new MutationObserver(schedule)
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  scan()
  return () => {
    observer.disconnect()
    for (const mount of [...mounts]) unmount(mount)
  }
}

/** React 侧的无渲染装配：挂上通道并在卸载时还原宿主 DOM。 */
export function useFenceRenderer(): void {
  useEffect(() => installFenceRenderer(), [])
}
