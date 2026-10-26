import { useEffect, useRef, useState } from 'react'
import type { ClientRemote } from '@deepseek-ai/dsh-api-gateway/client'
import type { Snapshot } from '../core/types.ts'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Icon } from './icons.tsx'
import { value } from './remote.ts'
import { notifyNotes } from './quick-note.tsx'
import type {} from './locales.ts'

// Coalesce per-message action mounts so a long conversation reads the notebook once.
const snapshots = new WeakMap<object, Map<string, Promise<Snapshot>>>()
function captureSnapshot(api: ClientRemote['learny'], sessionId: string): Promise<Snapshot> {
  let pending = snapshots.get(api)
  if (!pending) { pending = new Map(); snapshots.set(api, pending) }
  const existing = pending.get(sessionId)
  if (existing) return existing
  const request = value(api.snapshot(sessionId, new AbortController().signal))
  pending.set(sessionId, request)
  void request.then(() => { pending.delete(sessionId) }, () => { pending.delete(sessionId) })
  return request
}

/** Registered in the host's public finalized-assistant action slot. */
export function MessageCapture({ sessionId, messageId, api, t }: {
  sessionId: string; messageId: string; api: ClientRemote['learny']; t: PropsLocale<'learny'>['t']
}) {
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false), [error, setError] = useState('')
  const alive = useRef(true), inFlight = useRef(false), workspace = useRef<string | null>(null)
  useEffect(() => {
    alive.current = true
    let active = true
    let revision = 0
    const refresh = () => { const current = ++revision; void captureSnapshot(api, sessionId).then(snapshot => {
      if (active && current === revision) { workspace.current = snapshot.workspaceId; setReady(Boolean(snapshot.workspaceId)); setSaved(snapshot.notes.some(row => row.context?.source === 'chat' && row.context.sessionId === sessionId && row.context.messageId === messageId)) }
    }).catch(() => {}) }
    refresh()
    const changed = (event: Event) => { if ((event as CustomEvent<string>).detail === sessionId) refresh() }
    window.addEventListener('learny:workspace-changed', changed)
    return () => { active = false; alive.current = false; window.removeEventListener('learny:workspace-changed', changed) }
  }, [sessionId, messageId])
  // Unbound dsh conversations stay uncluttered.
  if (!ready) return null
  return <span className="learny-message-capture"><button type="button" disabled={busy} aria-label={busy ? t('working') : saved ? t('messageCaptured') : t('captureMessage')} title={t('captureMessageHint')} onClick={() => {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    void value(api.captureMessage(sessionId, messageId, new AbortController().signal)).then(note => {
      notifyNotes(note.workspaceId); if (alive.current && workspace.current === note.workspaceId) setSaved(true)
    }).catch(e => { if (alive.current) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { inFlight.current = false; if (alive.current) setBusy(false) })
  }}><Icon name={saved ? 'check' : 'note'} /></button>{error && <span role="alert">{error}</span>}</span>
}
