import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { LessonMarkdown } from './lesson-markdown.tsx'
import type { ClientRemote } from '@deepseek-ai/dsh-api-gateway/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { Attempt, TutorMessage } from '../core/study-types.ts'
import { value } from './remote.ts'
import type {} from 'dsh-plugin-learny/remote'
import type {} from './locales.ts'

type Props = { attempt: Attempt; sessionId: string; messages: TutorMessage[]; api: ClientRemote['learny']; t: PropsLocale<'learny'>['t']; onRefresh: () => Promise<void> }

/** Keyed by attempt: drafts and in-flight responses never cross task boundaries. */
export function TutorPanel({ attempt, sessionId, messages, api, t, onRefresh }: Props) {
  const key = `learny.tutor-draft.${attempt.id}`
  const [draft, setDraft] = useState(() => { try { return localStorage.getItem(key) ?? '' } catch { return '' } })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const active = useRef(true)
  const request = useRef<AbortController | null>(null)
  const thread = useRef<HTMLDivElement>(null)
  const follow = useRef(true)

  useEffect(() => { active.current = true; return () => { active.current = false; request.current?.abort() } }, [])
  useEffect(() => {
    try { if (draft) localStorage.setItem(key, draft); else localStorage.removeItem(key) } catch { /* Sending still works when optional browser drafts are unavailable. */ }
  }, [key, draft])
  useEffect(() => {
    if (follow.current && thread.current) thread.current.scrollTop = thread.current.scrollHeight
  }, [messages.length, busy])

  async function send(event: FormEvent) {
    event.preventDefault()
    if (busy || !draft.trim()) return
    const controller = new AbortController()
    request.current = controller
    setBusy(true); setError(''); follow.current = true
    try {
      await value(api.tutorChat({ workspaceId: attempt.workspaceId, attemptId: attempt.id, sessionId, message: draft.trim() }, controller.signal))
      if (active.current) { setDraft(''); await onRefresh() }
    } catch (cause) {
      if (active.current) {
        setError(t('tutorFailure', { message: cause instanceof Error ? cause.message : String(cause) }))
        // The Host may have saved the question before the model failed.
        try { await onRefresh() } catch { /* Keep the original failure and editable draft. */ }
      }
    } finally { if (active.current) setBusy(false) }
  }

  return <div className="tutor-panel">
    <p className="muted tutor-context">{t('tutorContext')}</p>
    <div ref={thread} className="tutor-thread" role="log" aria-label={t('tutorConversation')} aria-live="polite" aria-relevant="additions" aria-busy={busy}
      onScroll={event => { const el = event.currentTarget; follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48 }}>
      {messages.map(message => <article className={`tutor-message ${message.role}`} key={message.id}>
        <header><strong>{message.role === 'assistant' ? t('tutorRole') : t('you')}</strong><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></header>
        {message.role === 'assistant' ? <div className="prose"><LessonMarkdown>{message.content}</LessonMarkdown></div> : <p className="preserve">{message.content}</p>}
      </article>)}
      {!messages.length && <div className="tutor-empty"><p>{t('tutorEmpty')}</p><span>{t('tutorIntro')}</span></div>}
      {busy && <p className="tutor-wait" role="status">{t('tutorWorking')}</p>}
    </div>
    {error && <div className="notice error" role="alert"><p>{error}</p><button disabled={busy} onClick={() => { void onRefresh().catch(cause => setError(String(cause))) }}>{t('refresh')}</button></div>}
    <form className="tutor-form" onSubmit={send}>
      <label>{t('tutorInput')}<textarea rows={3} maxLength={6000} value={draft} disabled={busy} placeholder={t('tutorPlaceholder')} onChange={event => setDraft(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} /></label>
      <div className="row between"><span className="muted">⌘ / Ctrl + Enter</span><button className="primary" disabled={busy || !draft.trim()} type="submit">{busy ? t('working') : t('askTutor')}</button></div>
    </form>
  </div>
}
