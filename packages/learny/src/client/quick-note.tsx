import { useEffect, useRef, useState } from 'react'
import type { ClientRemote } from '@deepseek-ai/dsh-api-gateway/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { CaptureNote, NoteLocation, NoteDocument } from '../core/types.ts'
import { value } from './remote.ts'
import { locationKey } from './note-tree.ts'
import type {} from './locales.ts'

type Props = {
  workspaceId: string; sessionId: string; location?: NoteLocation | null; locationLabel: string
  api: ClientRemote['learny']; t: PropsLocale<'learny'>['t']; onSaved?: (note: NoteDocument) => void
}
export const notifyNotes = (workspaceId: string) => window.dispatchEvent(new CustomEvent('learny:notes-changed', { detail: workspaceId }))

/** A durable request id lives with the draft, so an uncertain network result can be retried safely. */
export function QuickNote({ workspaceId, sessionId, location, locationLabel, api, t, onSaved }: Props) {
  const key = `learny.quick.v1.${workspaceId}.${sessionId}.${location === undefined ? 'current' : locationKey(location)}`
  const [draft, setDraft] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? 'null')
      if (saved && typeof saved.id === 'string' && typeof saved.content === 'string') return saved as { id: string; content: string }
    } catch {}
    return { id: crypto.randomUUID(), content: '' }
  })
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false), [durable, setDurable] = useState(true)
  const inFlight = useRef(false), alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    try {
      if (draft.content) localStorage.setItem(key, JSON.stringify(draft))
      else localStorage.removeItem(key)
      setDurable(true)
    } catch { setDurable(false) }
  }, [key, draft])
  function updateDraft(content: string) {
    const next = { id: crypto.randomUUID(), content }
    // Persist in the input event, before navigation/reload can unmount the component.
    try { if (content) localStorage.setItem(key, JSON.stringify(next)); else localStorage.removeItem(key); setDurable(true) }
    catch { setDurable(false) }
    setDraft(next); setSaved(false)
  }
  async function capture() {
    if (inFlight.current || !draft.content.trim()) return
    inFlight.current = true; setBusy(true); setError(''); setSaved(false)
    try {
      const request: CaptureNote = { id: draft.id, workspaceId, sessionId, content: draft.content, ...(location === undefined ? {} : { location }) }
      const note = await value(api.captureNote(request, new AbortController().signal))
      try { if (JSON.parse(localStorage.getItem(key) ?? 'null')?.id === draft.id) localStorage.removeItem(key) } catch {}
      notifyNotes(workspaceId)
      if (alive.current) {
        setDraft({ id: crypto.randomUUID(), content: '' }); setSaved(true); onSaved?.(note)
      }
    } catch (error) { if (alive.current) setError(error instanceof Error ? error.message : String(error)) }
    finally { inFlight.current = false; if (alive.current) setBusy(false) }
  }
  return <div className="quick-note">
    <form onSubmit={event => { event.preventDefault(); void capture() }}>
      <label><span className="sr-only">{t('quickNote')}</span><textarea rows={3} maxLength={1_000_000} placeholder={t('quickPlaceholder')} disabled={busy}
        value={draft.content} onChange={event => updateDraft(event.target.value)}
        onKeyDown={event => { if (!event.nativeEvent.isComposing && event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void capture() } }} /></label>
      <div className="quick-note-footer"><span>{locationLabel}</span><button className="primary" type="submit" disabled={busy || !draft.content.trim()}>{busy ? t('working') : t('captureNote')}</button></div>
    </form>
    <p className={error || !durable ? 'status-error' : 'muted'} role="status">{error || (!durable ? t('draftUnavailable') : saved ? t('quickSaved') : draft.content ? t('quickDraftSaved') : t('quickShortcut'))}</p>
  </div>
}
