import { useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ClientRemote } from '@deepseek-ai/dsh-api-gateway/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { StudyNode, StudySnapshot } from '../core/study-types.ts'
import { value } from './remote.ts'
import { LearningMap, KnowledgeMap } from './maps.tsx'
import { PracticeWorkbench } from './study.tsx'
import { AttemptHistory } from './history.tsx'
import { FenceView, parseFence } from './fence.tsx'
import type {} from './locales.ts'

export type ManagementView = 'current' | 'map' | 'sources' | 'notes'
type Props = {
  workspaceId: string; sessionId: string; view: ManagementView; api: ClientRemote['learny']; t: PropsLocale<'learny'>['t']
  onView: (view: ManagementView) => void; onNote: (title: string) => Promise<void>; onGenerateCourse: () => Promise<void>
  onOpenChat: (sessionId: string) => void; navigationVersion: number
}
export function StudyWorkbench({ workspaceId, sessionId, view, api, t, onView, onNote, onGenerateCourse, onOpenChat, navigationVersion }: Props) {
  const [snapshot, setSnapshot] = useState<StudySnapshot | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [practiceAttemptId, setPracticeAttemptId] = useState<string | undefined>()
  const [practice, setPractice] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const alive = useRef(true)
  const request = useRef(0)
  const signal = () => new AbortController().signal
  async function refresh() {
    const id = ++request.current
    const next = await value(api.studySnapshot(workspaceId, signal()))
    if (alive.current && id === request.current) setSnapshot(next)
  }
  async function run(operation: () => Promise<void>) {
    setBusy(true); setError('')
    try { await operation() } catch (e) { if (alive.current) { const message = e instanceof Error ? e.message : String(e); setError(message.includes('DEEPSEEK_API_KEY') || message.includes('WEB_PROVIDER_CREDENTIAL_MISSING') ? t('webSearchNotConfigured') : message.includes('LEARNY_RESEARCH_BUDGET') ? t('researchBudgetSpent') : message) } }
    finally { if (alive.current) setBusy(false) }
  }
  useEffect(() => { alive.current = true; void run(refresh); return () => { alive.current = false; request.current++ } }, [workspaceId, sessionId])
  useEffect(() => { setSelected(null); setPractice(false) }, [navigationVersion])

  const nodes = snapshot?.nodes ?? []
  const done = (id: string) => snapshot?.progress?.some(row => row.nodeId === id && row.completed) ?? false
  const validTasks = snapshot?.nodeTasks?.filter(task => nodes.some(node => node.id === task.nodeId)) ?? []
  const recentTask = validTasks.at(-1)
  const focus = nodes.find(node => node.id === recentTask?.nodeId)
    ?? nodes.find(node => !done(node.id)) ?? nodes[0]
  const node = (view === 'map' || practice ? nodes.find(node => node.id === selected) : undefined) ?? focus
  const task = validTasks.filter(item => item.nodeId === node?.id).at(-1)
  const index = nodes.findIndex(item => item.id === node?.id)
  const next = nodes[index + 1]
  const materials = snapshot?.materials ?? snapshot?.course?.sources ?? []
  const selectNode = (id: string) => { setSelected(id); setPractice(false) }
  async function openLesson(target: StudyNode) {
    const existing = validTasks.filter(item => item.nodeId === target.id).at(-1)
    if (existing) { await run(async () => onOpenChat(existing.sessionId)); return }
    await run(async () => {
      await value(api.startNode(workspaceId, target.id, sessionId, signal()))
      await refresh()
      onOpenChat(sessionId)
    })
  }
  const records = node && snapshot && <details className="manager-record" key={`records:${node.id}`}>
    <summary>{t('sectionRecords')}</summary>
    <div className="record-links"><button className="link" onClick={() => onView('notes')}>{t('notes')}</button>
      <button className="link" onClick={() => onView('sources')}>{t('sources')}</button>
      <button className="link" disabled={busy} onClick={() => { void run(() => onNote(node.title)) }}>{t('taskNote')}</button>
    </div>
    <details><summary>{t('learningRecords')}</summary>
      {validTasks.filter(item => item.nodeId === node.id).map(item => <div className="manager-log" key={item.id}>
        <span>{new Date(item.askedAt).toLocaleString()}</span><button className="link" onClick={() => { void run(async () => onOpenChat(item.sessionId)) }}>{t('returnLearningChat')}</button>
      </div>)}
      {!task && <p className="muted">{t('noLearningRecords')}</p>}
    </details>
    {(snapshot.deepDives ?? []).some(dive => dive.nodeId === node.id) && <details><summary>{t('deepenTitle')}</summary>{(snapshot.deepDives ?? []).filter(dive => dive.nodeId === node.id).map(dive => <details key={dive.id} className="record">
      <summary>{dive.question}</summary>
      {dive.mode === 'chat' && dive.sessionId ? <button className="link" onClick={() => { void run(async () => onOpenChat(dive.sessionId!)) }}>{t('returnLearningChat')}</button> : dive.answer ? <div className="prose"><Markdown remarkPlugins={[remarkGfm]}>{dive.answer}</Markdown></div> : <p className="muted">{t('deepenEmpty')}</p>}
    </details>)}</details>}
    {(snapshot.blocks ?? []).some(block => block.nodeId === node.id) && <details><summary>{t('nodeBlocks')}</summary>{(snapshot.blocks ?? []).filter(block => block.nodeId === node.id).map(block => {
      const payload = parseFence(block.payload)
      return payload ? <div key={block.id} className="node-block"><FenceView payload={payload} /></div> : null
    })}</details>}
    <details><summary>{t('practiceRecords')}</summary><AttemptHistory snapshot={{ ...snapshot, attempts: snapshot.attempts.filter(row => row.nodeId === node.id && row.courseVersion === snapshot.courseVersion) }} selected={null} disabled={busy} t={t}
      onSelect={id => { const attempt = snapshot.attempts.find(row => row.id === id); if (attempt) { selectNode(attempt.nodeId); setPracticeAttemptId(id); setPractice(true) } }} /></details>
  </details>
  return <section className="study learning-manager" aria-label={t('study')}>
    {error && <p className="status-error" role="alert">{error}</p>}
    {busy && <p className="muted" role="status">{t('working')}</p>}
    {!snapshot ? <p className="muted">{t('loading')}</p> : !snapshot.course ? <div className="course-empty">
      <div><h2>{t('courseNotReady')}</h2><p className="muted">{t('generateCourseIntro')}</p></div>
      <button className="primary" disabled={busy} onClick={() => { void run(async () => { await onGenerateCourse(); await refresh() }) }}>{busy ? t('generatingCourse') : t('generateCourse')}</button>
    </div> : practice && node ? <>
      <button className="quiet manager-back" onClick={() => { setPractice(false); onView('map'); void run(refresh) }}>{t('returnChapter')}</button>
      <PracticeWorkbench key={node.id} initialNodeId={node.id} initialAttemptId={practiceAttemptId} workspaceId={workspaceId} sessionId={sessionId} api={api} t={t} onNote={onNote} onGenerateCourse={onGenerateCourse} />
    </> : view === 'map' && !selected ? <LearningMap snapshot={snapshot} currentId={focus?.id} disabled={busy} t={t} onSelect={selectNode} />
      : view === 'sources' ? <section className="manager-sources"><div className="manager-heading"><h2>{t('sources')}</h2></div><p className="muted">{t('sourcesManagementHint')}</p>
        {materials.length ? materials.map(source => <details className="manager-source" key={source.id}><summary>{source.title}</summary>
          {source.excerpt && <p className="source-excerpt">{source.excerpt.slice(0, 1200)}</p>}
          <a href={source.url} target="_blank" rel="noreferrer">{t('openSourceOriginal')}</a>
          <div className="source-chapters">{nodes.filter(item => item.sourceIds.includes(source.id)).map(item => <button className="link" key={item.id} onClick={() => { onView('map'); selectNode(item.id) }}>{item.title}</button>)}</div>
        </details>) : <p className="muted">{t('noSourcesYet')}</p>}
      </section> : node ? <article className="manager-current">
        {view === 'map' && selected && <button className="quiet manager-back" onClick={() => setSelected(null)}>{t('backToMap')}</button>}
        <div className="manager-current-main"><p className="section-label">{done(node.id) ? t('selfCompleted') : task ? t('learningNow') : t('todayNext')} / {index + 1}</p>
          <h2>{node.title}</h2><p className="manager-summary">{node.briefing ?? t('todayNextHint')}</p>
          <div className="manager-actions"><button className="primary" disabled={busy} onClick={() => { void openLesson(node) }}>{task ? t('returnLearningChat') : t('nodeStart')}</button>
            <button className="quiet" disabled={busy} onClick={() => { void run(async () => { await value(api.markNodeComplete(workspaceId, node.id, !done(node.id), signal())); await refresh() }) }}>{done(node.id) ? t('undoLearningComplete') : t('markLearningComplete')}</button>
          </div>
        </div>
        {view === 'map' && selected ? <>
          <KnowledgeMap key={node.id} node={node} t={t} />
          <details className="manager-record"><summary>{t('practiceAssessment')}</summary><p className="muted">{t('practiceAssessmentHint')}</p><button onClick={() => { setPracticeAttemptId(undefined); setPractice(true) }}>{t('openPracticeAssessment')}</button></details>
        </> : next && <div className="manager-next"><div><span className="section-label">{t('nextChapter')}</span><p>{next.title}</p></div><button className="link" onClick={() => { onView('map'); selectNode(next.id) }}>{t('viewAttempt')}</button></div>}
        {records}
      </article> : null}
    {snapshot?.course && <footer className="manager-footer"><span>{t('localRecords')}</span><button className="quiet" disabled={busy} onClick={() => { void run(refresh) }}>{t('refresh')}</button></footer>}
  </section>
}
