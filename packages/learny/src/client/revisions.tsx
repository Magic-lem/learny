import { useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ClientRemote } from '@deepseek-ai/dsh-api-gateway/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { NoteDocument, NoteRevision, RevisionMode } from '../core/types.ts'
import { value } from './remote.ts'
import type {} from './locales.ts'

type Props = {
  note: NoteDocument; dirty: boolean; sessionId: string; api: ClientRemote['learny']; t: PropsLocale<'learny'>['t']
  prepare: () => Promise<NoteDocument>; onChanged: () => Promise<void>
}
export function NoteOrganizer({ note, dirty, sessionId, api, t, prepare, onChanged }: Props) {
  const [rows, setRows] = useState<NoteRevision[]>([]), [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [instruction, setInstruction] = useState(''), [expanded, setExpanded] = useState(false)
  const alive = useRef(true), inFlight = useRef(false), revision = rows.find(row => row.id === selected)
  const signal = () => new AbortController().signal
  async function refresh(id?: string) {
    const next = await value(api.noteRevisions(note.workspaceId, note.id, signal()))
    if (alive.current) { setRows(next); setSelected(current => id ?? current ?? next[0]?.id ?? null) }
  }
  async function run(action: () => Promise<void>) {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    try { await action() } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : String(e)) }
    finally { inFlight.current = false; if (alive.current) setBusy(false) }
  }
  useEffect(() => { alive.current = true; void run(refresh); return () => { alive.current = false } }, [note.id])
  async function generate(mode: RevisionMode, preset: string) {
    await run(async () => {
      const saved = await prepare()
      const result = await value(api.organizeNote({ id: crypto.randomUUID(), sessionId, workspaceId: note.workspaceId, noteId: note.id,
        expectedVersion: saved.version, mode, instruction: preset }, signal()))
      await refresh(result.id); if (alive.current) setExpanded(true)
    })
  }
  const markdown = (text: string) => <div className="prose"><Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown></div>
  return <section className="note-organizer" aria-label={t('organize')}>
    <div className="row"><button disabled={busy || !note.content.trim() && !dirty} onClick={() => { void generate('polish', '将已有内容组织成简洁要点。保留作者的意思、疑问和不确定性，不添加事实、例子或结论。') }}>{t('organizePoints')}</button>
      <button disabled={busy || !note.content.trim() && !dirty} onClick={() => { void generate('polish', '精简重复表达，使叙述清楚。保留所有不同的观点、代码和不确定性，不增加事实或结论。') }}>{t('conciseWriting')}</button>
      <button className="quiet" disabled={busy} onClick={() => { void generate('format', '只调整已有内容的标题、列表、换行和空格，保持所有文字、标点和代码不变。') }}>{t('formatOnly')}</button></div>
    {busy && <p className="muted" role="status">{t('working')}</p>}
    {error && <p className="status-error" role="alert">{error}</p>}
    <details className="note-custom"><summary>{t('customOrganization')}</summary><label><span className="sr-only">{t('organizeInstruction')}</span><textarea value={instruction} maxLength={5000} rows={2} onChange={event => setInstruction(event.target.value)} /></label><button disabled={busy || !instruction.trim()} onClick={() => { void generate('polish', instruction) }}>{t('generateRevision')}</button></details>
    {rows.length > 0 && <details className="note-revision-history" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}><summary>{t('revisionHistory')}</summary>
      <label><span className="sr-only">{t('revisionHistory')}</span><select disabled={busy} value={selected ?? ''} onChange={event => setSelected(event.target.value)}>
        {rows.map(row => <option key={row.id} value={row.id}>{t(row.status === 'applied' ? 'revisionApplied' : row.status === 'restored' ? 'revisionRestored' : row.status === 'ready' ? 'revisionReady' : 'revisionPending')} / {new Date(row.createdAt).toLocaleString()}</option>)}
      </select></label>
      {revision && <div className="note-revision">
        <p className="muted">{revision.summary}</p>{revision.error && <p className="status-error">{revision.error.includes('format changed content') ? t('formatRejected') : revision.error}</p>}
        {revision.result !== null ? <>
          <details><summary>{t('original')}</summary>{markdown(revision.original)}</details>
          <h3>{t('organized')}</h3>{markdown(revision.result)}<p className="muted">{t('preserveOriginal')}</p>
          <div className="row"><button className="primary" disabled={busy || dirty || revision.status !== 'ready' || revision.original !== note.content || revision.title !== note.title} onClick={() => { void run(async () => {
            await value(api.applyRevision(note.workspaceId, revision.id, false, signal())); await onChanged(); await refresh(revision.id); if (alive.current) setExpanded(false)
          }) }}>{t('applyRevision')}</button>
            <button disabled={busy || dirty || revision.status !== 'applied' || revision.result !== note.content || revision.title !== note.title} onClick={() => { void run(async () => {
              await value(api.applyRevision(note.workspaceId, revision.id, true, signal())); await onChanged(); await refresh(revision.id); if (alive.current) setExpanded(false)
            }) }}>{t('restoreOriginal')}</button></div>
          {(revision.status === 'ready' && (revision.original !== note.content || revision.title !== note.title) || revision.status === 'applied' && (revision.result !== note.content || revision.title !== note.title)) && <p className="muted">{t('revisionOutdated')}</p>}
        </> : <button disabled={busy} onClick={() => { void run(async () => { await value(api.retryOrganization(note.workspaceId, revision.id, signal())); await refresh(revision.id) }) }}>{t('retryOrganization')}</button>}
      </div>}
    </details>}
  </section>
}
