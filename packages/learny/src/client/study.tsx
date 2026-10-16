import { useEffect, useRef, useState } from 'react'
import type { ClientRemote } from '@deepseek-ai/dsh-api-gateway/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { Attempt, AttemptAction, PracticeKind, StudySnapshot } from '../core/study-types.ts'
import { value } from './remote.ts'
export { value } from './remote.ts'
import type {} from 'dsh-plugin-learny/remote'
import type {} from './locales.ts'

type Props = {
  initialNodeId?: string; initialAttemptId?: string; workspaceId: string; sessionId: string
  api: ClientRemote['learny']; t: PropsLocale<'learny'>['t']
  onNote: (title: string) => Promise<void>; onGenerateCourse: () => Promise<void>
}
type LabelKey = Parameters<Props['t']>[0]
const FIELDS: Partial<Record<PracticeKind, LabelKey[]>> = {
  command: ['practiceSteps', 'practiceObservation', 'practiceConclusion'],
  config: ['practiceConfig', 'practiceVerification', 'practiceConclusion'],
  compare: ['practiceOptions', 'practiceDifference', 'practiceConclusion'],
  design: ['practiceDesign', 'practiceVerification', 'practiceConclusion'],
}

/** Optional practice surface. Teaching and questions remain in the native chat. */
export function PracticeWorkbench({ initialNodeId, initialAttemptId, workspaceId, sessionId, api, t }: Props) {
  const [snapshot, setSnapshot] = useState<StudySnapshot | null>(null)
  const [selected, setSelected] = useState(initialAttemptId ?? null)
  const [draft, setDraft] = useState('')
  const [fields, setFields] = useState(['', '', ''])
  const [assistance, setAssistance] = useState<Attempt['assistance']>('unknown')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const alive = useRef(true)
  const attempt = snapshot?.attempts.find(item => item.id === selected)
  const node = snapshot?.nodes.find(item => item.id === attempt?.nodeId)
  const keys = FIELDS[node?.practiceKind ?? 'mixed'] ?? []
  const signal = () => new AbortController().signal
  const storageKey = attempt ? `learny.attempt.${attempt.id}.${attempt.stage}` : null
  async function refresh(id?: string) {
    const next = await value(api.studySnapshot(workspaceId, signal()))
    if (!alive.current) return
    setSnapshot(next)
    if (id) setSelected(id)
  }
  async function run(operation: () => Promise<void>) {
    setBusy(true); setError('')
    try { await operation() } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : String(e)) }
    finally { if (alive.current) setBusy(false) }
  }
  useEffect(() => {
    alive.current = true
    void run(async () => {
      if (initialAttemptId) { await refresh(initialAttemptId); return }
      if (!initialNodeId) return
      const started = await value(api.startAttempt(workspaceId, initialNodeId, signal()))
      if (started.stage === 'prediction') await value(api.attemptAction({ workspaceId, attemptId: started.id, expectedRevision: started.revision, action: 'skipPrediction', text: '' }, signal()))
      await refresh(started.id)
    })
    return () => { alive.current = false }
  }, [workspaceId, initialNodeId, initialAttemptId])
  useEffect(() => {
    let saved = ''
    try { saved = storageKey ? localStorage.getItem(storageKey) ?? '' : '' } catch {}
    let structured: string[] | null = null
    if (saved.startsWith('[')) try { const parsed = JSON.parse(saved); if (Array.isArray(parsed)) structured = parsed.map(String) } catch {}
    setFields([0, 1, 2].map(index => structured?.[index] ?? ''))
    setDraft(structured ? '' : saved || (attempt?.stage === 'explanation' ? attempt.explanation : ''))
    setAssistance(attempt?.assistance ?? 'unknown')
  }, [storageKey])
  function edit(text: string) { setDraft(text); try { if (storageKey) localStorage.setItem(storageKey, text) } catch {} }
  function editField(index: number, text: string) {
    const next = fields.map((item, at) => at === index ? text : item); setFields(next)
    try { if (storageKey) localStorage.setItem(storageKey, JSON.stringify(next)) } catch {}
  }
  async function act(action: AttemptAction['action'], text = '') {
    if (!attempt) return
    const saved = await value(api.attemptAction({ workspaceId, attemptId: attempt.id, expectedRevision: attempt.revision, action, text }, signal()))
    try { if (storageKey) localStorage.removeItem(storageKey) } catch {}
    await refresh(saved.id)
  }
  const ready = keys.length ? Boolean(fields[0]?.trim() && fields[keys.length - 1]?.trim()) : Boolean(draft.trim())
  return <section className="practice-workbench" aria-label={t('practiceAssessment')}>
    {error && <p className="status-error" role="alert">{error}</p>}
    {busy && <p className="muted" role="status">{t('working')}</p>}
    {!node || !attempt ? <p className="muted">{t('loading')}</p> : <>
      <div className="manager-heading"><h2>{node.title}</h2><span className="muted">{t(attempt.stage)}</span></div>
      {(attempt.stage === 'prediction' || attempt.stage === 'reading') && <>
        <p className="manager-summary">{t('practiceAssessmentHint')}</p>
        <details className="manager-record"><summary>{t('criteria')}</summary><ul>{node.criteria.map(item => <li key={item.id}>{item.description}</li>)}</ul></details>
        <button className="primary" disabled={busy} onClick={() => { void run(async () => {
          if (attempt.stage === 'prediction') await act('skipPrediction')
          else await act('startPractice')
        }) }}>{attempt.stage === 'prediction' ? t('skipPrediction') : t('beginPractice')}</button>
      </>}
      {attempt.stage === 'practice' && <>
        <p className="manager-summary">{attempt.retry ? node.retryPractice : node.practice}</p>
        {keys.length ? <div className="practice-fields">{keys.map((key, index) => <label key={key}>{t(key)}<textarea rows={4} disabled={busy} value={fields[index]} onChange={event => editField(index, event.target.value)} /></label>)}</div>
          : <label>{t('practiceEvidence')}<textarea rows={8} value={draft} disabled={busy} placeholder={t('practicePlaceholder')} onChange={event => edit(event.target.value)} /></label>}
        <div className="manager-actions"><button className="primary" disabled={busy || !ready} onClick={() => { void run(() => act('practice', keys.length ? keys.map((key, index) => `${t(key)}：\n${fields[index]}`).join('\n\n') : draft)) }}>{t('savePractice')}</button></div>
      </>}
      {attempt.stage === 'explanation' && <>
        <details className="manager-record"><summary>{t('originalPractice')}</summary><pre>{attempt.evidence}</pre></details>
        <p className="manager-summary">{node.explanation}</p>
        <label>{t('yourExplanation')}<textarea rows={8} value={draft} disabled={busy} onChange={event => edit(event.target.value)} /></label>
        <label>{t('assistance')}<select value={assistance} disabled={busy} onChange={event => setAssistance(event.target.value as Attempt['assistance'])}><option value="unknown">{t('helpUnknown')}</option><option value="independent">{t('helpIndependent')}</option><option value="helped">{t('helped')}</option></select></label>
        <button className="primary" disabled={busy || !draft.trim()} onClick={() => { void run(async () => {
          const saved = await value(api.attemptAction({ workspaceId, attemptId: attempt.id, expectedRevision: attempt.revision, action: 'explanation', text: draft }, signal()))
          await value(api.submitAttempt({ workspaceId, attemptId: attempt.id, expectedRevision: saved.revision, sessionId, assistance }, signal()))
          await refresh(attempt.id)
        }) }}>{t('submitEvaluate')}</button>
      </>}
      {attempt.stage === 'submitted' && <>
        {attempt.evaluation ? <><h3>{t(attempt.evaluation.outcome)}</h3><p>{attempt.evaluation.summary}</p>{attempt.evaluation.criteria.map(item => <section className="criterion" key={item.id}><strong>{node.criteria.find(c => c.id === item.id)?.description}</strong><p>{t(item.status)}：{item.reason}</p>{item.quotes.map((quote, i) => <blockquote key={i}>{quote}</blockquote>)}{item.remediation && <p className="muted">{item.remediation}</p>}</section>)}</>
          : <div className="notice" role="status"><p>{attempt.error ?? t('evaluationPending')}</p><button disabled={busy || attempt.modelStatus === 'pending'} onClick={() => { void run(async () => { await value(api.retryEvaluation(workspaceId, attempt.id, sessionId, signal())); await refresh(attempt.id) }) }}>{t('retryEvaluation')}</button></div>}
        <details className="manager-record"><summary>{t('originalSubmission')}</summary><pre>{attempt.evidence}</pre><p className="preserve">{attempt.explanation}</p></details>
        <button disabled={busy || attempt.modelStatus === 'pending'} onClick={() => { void run(async () => {
          const next = await value(api.startAttempt(workspaceId, node.id, signal()))
          if (next.stage === 'prediction') await value(api.attemptAction({ workspaceId, attemptId: next.id, expectedRevision: next.revision, action: 'skipPrediction', text: '' }, signal()))
          await refresh(next.id)
        }) }}>{t('newAttempt')}</button>
      </>}
    </>}
  </section>
}
