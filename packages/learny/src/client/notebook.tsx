import { Icon } from './icons.tsx'
import { StudyWorkbench } from './study.tsx'
import { NoteOrganizer } from './revisions.tsx'
import { useEffect, useState, useRef } from 'react'
import type { FormEvent } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ClientRemote } from '@deepseek-ai/dsh-api-gateway/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from 'dsh-plugin-learny/remote'
import type { CapabilityStatus, NoteDocument, Snapshot, CreateWorkspace } from '../core/types.ts'
import type {} from './locales.ts'

type Props = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<'learny'> & {
  api: ClientRemote['learny']
  subscribeReset: (listener: () => void) => () => void
}

interface Draft { title: string; content: string; version: string }
const draftKey = (noteId: string) => `learny.draft.${noteId}`

/** Session-owned workbench backed by the host's durable snapshot and Markdown files. */
export function LearnyBody({ sessionId, api, t, subscribeReset }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot>({ workspaces: [], workspaceId: null, notes: [] })
  const [note, setNote] = useState<NoteDocument | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [baseVersion, setBaseVersion] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [preview, setPreview] = useState(false)
  const [view, setView] = useState<'study' | 'notes'>('study')
  const [matches, setMatches] = useState<Snapshot['notes']>([])
  const [creating, setCreating] = useState(false)
  const [capabilities, setCapabilities] = useState<CapabilityStatus | null>(null)
  const [setupDismissed, setSetupDismissed] = useState(() => {
    try { return localStorage.getItem('learny.setup.dismissed.v1') === '1' } catch { return false }
  })
  const [form, setForm] = useState<CreateWorkspace>({ name: '', goal: '', kind: 'topic', materialPath: '' })
  const alive = useRef(true)
  const dirty = note !== null && (title !== note.title || body !== note.content)
  const workspace = snapshot.workspaces.find(row => row.id === snapshot.workspaceId)

  async function unwrap<T>(operation: Promise<{ ok: true; value: T } | { ok: false; error: { code: string; message: string } }>): Promise<T> {
    const result = await operation
    if (!result.ok) throw new Error(result.error.code === 'learny/conflict' ? t('conflict') : result.error.message)
    return result.value
  }

  async function run(operation: () => Promise<void>) {
    setBusy(true); setNotice('')
    try { await operation() } catch (error) {
      if (alive.current) setNotice(t('failure', { message: error instanceof Error ? error.message : String(error) }))
    } finally { if (alive.current) setBusy(false) }
  }

  async function refresh() {
    const [next, hostCapabilities] = await Promise.all([
      unwrap(api.snapshot(sessionId, new AbortController().signal)),
      unwrap(api.capabilityStatus(sessionId, new AbortController().signal)),
    ])
    if (alive.current) {
      setSnapshot(next)
      setCapabilities(hostCapabilities)
      setNote(current => current && current.workspaceId !== next.workspaceId ? null : current)
    }
  }

  function dismissSetup() {
    setSetupDismissed(true)
    try { localStorage.setItem('learny.setup.dismissed.v1', '1') } catch { /* The check remains dismissible for this render. */ }
  }

  function showNote(value: NoteDocument, restore = true) {
    if (!alive.current) return
    let draft: Draft | null = null
    if (restore) {
      try {
        const stored: unknown = JSON.parse(localStorage.getItem(draftKey(value.id)) ?? 'null')
        if (stored && typeof stored === 'object' && 'title' in stored && typeof stored.title === 'string'
          && 'content' in stored && typeof stored.content === 'string' && 'version' in stored && typeof stored.version === 'string') {
          draft = { title: stored.title, content: stored.content, version: stored.version }
        }
      } catch { /* An invalid optional browser draft does not replace the Markdown record. */ }
    }
    setNote(value); setTitle(draft?.title ?? value.title); setBody(draft?.content ?? value.content)
    setBaseVersion(draft?.version ?? value.version); setPreview(false)
    if (draft) setNotice(t('draft'))
  }

  useEffect(() => {
    alive.current = true
    setNote(null); setSearch(''); setPreview(false)
    void run(refresh)
    const dispose = subscribeReset(() => { void run(refresh) })
    return () => { alive.current = false; dispose() }
  }, [sessionId, api, subscribeReset])

  useEffect(() => {
    if (!note) return
    if (!dirty) { try { localStorage.removeItem(draftKey(note.id)) } catch {} return }
    try { localStorage.setItem(draftKey(note.id), JSON.stringify({ title, content: body, version: baseVersion })) }
    catch { /* Browser storage may be unavailable; the explicit Save action still writes through Host. */ }
  }, [note, title, body, baseVersion, dirty])

  useEffect(() => {
    if (!workspace) return
    let current = true
    const timer = setTimeout(() => { void unwrap(api.searchNotes(workspace.id, search, new AbortController().signal)).then(rows => { if (current) setMatches(rows) }).catch(error => { if (current) setNotice(error instanceof Error ? error.message : String(error)) }) }, 150)
    return () => { current = false; clearTimeout(timer) }
  }, [workspace?.id, search, snapshot.notes])

  async function createSpace(event: FormEvent) {
    event.preventDefault()
    await run(async () => {
      const space = await unwrap(api.createWorkspace(form, new AbortController().signal))
      await unwrap(api.bindWorkspace(sessionId, space.id, new AbortController().signal))
      await refresh(); setCreating(false); setNote(null)
    })
  }

  async function chooseSpace(id: string) {
    await run(async () => {
      await unwrap(api.bindWorkspace(sessionId, id, new AbortController().signal))
      await refresh(); setNote(null); setSearch('')
    })
  }

  async function save() {
    if (!note) return
    await run(async () => {
      const saved = await unwrap(api.saveNote({ workspaceId: note.workspaceId, noteId: note.id, title, content: body, expectedVersion: baseVersion }, new AbortController().signal))
      try { localStorage.removeItem(draftKey(saved.id)) } catch { /* Draft cleanup cannot invalidate a committed file save. */ }
      showNote(saved, false); await refresh()
    })
  }

  return <div className="learny" data-learny>
    <div className="learny-shell">
      <div className="workspace-chrome"><header className="workspace-header">
        <div className="brand"><Icon name="book" /><h1>{t('title')}</h1></div>
        <label className="space-select"><span className="sr-only">{t('spaces')}</span><select value={snapshot.workspaceId ?? ''} disabled={busy} onChange={event => { if (event.target.value) void chooseSpace(event.target.value) }}>
          <option value="" disabled>{t('choose')}</option>{snapshot.workspaces.map(space => <option key={space.id} value={space.id}>{space.name}</option>)}
        </select></label>
        <button className="quiet new-space" aria-label={t('createSpace')} aria-expanded={creating} disabled={busy} onClick={() => setCreating(!creating)}><Icon name="plus" /><span>{t('createSpace')}</span></button>
      </header>
      {workspace && !creating && <nav className="workspace-nav" aria-label={t('workspaceNavigation')}><button aria-pressed={view === 'study'} onClick={() => setView('study')}><Icon name="book" />{t('study')}</button><button aria-pressed={view === 'notes'} onClick={() => setView('notes')}><Icon name="note" />{t('notes')}<span className="count">{snapshot.notes.length}</span></button></nav>}
      </div>
      {creating && <form className="space-form" onSubmit={event => { void createSpace(event) }}>
        <div className="form-heading"><h2>{t('createSpace')}</h2><p className="muted">{t('createIntro')}</p></div>
        <label>{t('name')}<input required maxLength={120} value={form.name} placeholder={t('namePlaceholder')} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
        <label>{t('kind')}<select value={form.kind} onChange={event => setForm({ ...form, kind: event.target.value === 'project' ? 'project' : 'topic' })}><option value="topic">{t('topic')}</option><option value="project">{t('project')}</option></select></label>
        <label className="full-width">{t('goal')}<textarea maxLength={5000} rows={2} value={form.goal} placeholder={t('goalPlaceholder')} onChange={event => setForm({ ...form, goal: event.target.value })} /></label>
        {form.kind === 'project' && <label className="full-width">{t('path')}<input required value={form.materialPath} onChange={event => setForm({ ...form, materialPath: event.target.value })} /></label>}
        <div className="row full-width"><button className="primary" disabled={busy} type="submit">{t('create')}</button><button type="button" onClick={() => setCreating(false)}>{t('cancel')}</button></div>
      </form>}
      {!setupDismissed && <section className="setup-check" aria-labelledby="learny-setup-title">
        <div className="setup-heading"><div><p className="section-label">{t('setupEyebrow')}</p><h2 id="learny-setup-title">{t('setupTitle')}</h2><p className="muted">{t('setupIntro')}</p></div><button className="quiet" disabled={busy} onClick={dismissSetup}>{t('setupDismiss')}</button></div>
        <div className="setup-list">
          <div className="setup-row"><span>{t('setupModel')}</span><strong className={capabilities?.model === 'ready' ? 'ready' : 'pending'}>{!capabilities ? t('working') : capabilities.model === 'ready' ? t('setupReady') : t('setupNeedsSession')}</strong><p>{t('setupModelDetail')}</p></div>
          <div className="setup-row"><span>{t('setupSearch')}</span><strong className={capabilities?.webSearch === 'mounted' ? 'ready' : 'pending'}>{!capabilities ? t('working') : capabilities.webSearch === 'mounted' ? t('setupMounted') : t('setupMissing')}</strong><p>{t('setupSearchDetail')}</p></div>
          <div className="setup-row"><span>{t('setupFetch')}</span><strong className={capabilities?.webFetch === 'mounted' ? 'ready' : 'pending'}>{!capabilities ? t('working') : capabilities.webFetch === 'mounted' ? t('setupMounted') : t('setupMissing')}</strong><p>{t('setupFetchDetail')}</p></div>
        </div>
        <p className="setup-footnote">{t('setupOneApiHint')}</p>
      </section>}
      {notice && <div className="notice" role="status">{notice}</div>}
      {creating ? null : workspace ? <>
        {workspace.goal && <details className="goal"><summary><span>{t('goal')}</span><span>{workspace.goal}</span></summary><p>{workspace.goal}</p>{workspace.kind==='project'&&<p className="material-path">{workspace.materialPath}</p>}</details>}

        {view === 'study' ? <StudyWorkbench key={`${workspace.id}:${sessionId}`} workspaceId={workspace.id} sessionId={sessionId} api={api} t={t} onNote={async taskTitle => { await run(async () => { showNote(await unwrap(api.createNote(workspace.id, taskTitle, new AbortController().signal))); await refresh(); setView('notes') }) }} onGenerateCourse={async () => { await unwrap(api.generateCourse(workspace.id, sessionId, new AbortController().signal)) }} /> : <section className="notes-workbench" aria-label={t('notes')}>
          <div className="section-heading"><div><h2>{t('notes')}</h2><p className="muted">{t('notesIntro')}</p></div><button disabled={busy} onClick={() => { void run(async () => { showNote(await unwrap(api.createNote(workspace.id, t('untitled'), new AbortController().signal))); await refresh() }) }}><Icon name="plus" />{t('newNote')}</button></div>
          <div className="layout">
            <aside className="note-list" aria-label={t('noteDirectory')}>
              <div className="search-field"><Icon name="search" /><input className="search" aria-label={t('search')} placeholder={t('searchShort')} value={search} onChange={event => setSearch(event.target.value)} /></div>
              <div className="note-items">{(search ? matches : snapshot.notes).map(row => <button key={row.id} className={`note-item ${note?.id === row.id ? 'active' : ''}`} aria-pressed={note?.id === row.id} disabled={busy} onClick={() => { void run(async () => showNote(await unwrap(api.readNote(workspace.id, row.id, new AbortController().signal)))) }}><Icon name="note" /><span>{row.title}<time dateTime={row.updatedAt}>{new Date(row.updatedAt).toLocaleDateString()}</time></span></button>)}</div>
              {!snapshot.notes.length ? <p className="muted list-empty">{t('empty')}</p> : search && !matches.length && <p className="muted list-empty">{t('noMatches')}</p>}
            </aside>
            {note ? <section className="editor" aria-label={t('noteEditor')}>
              <input className="note-title" aria-label={t('noteTitle')} value={title} maxLength={120} disabled={busy} onChange={event => setTitle(event.target.value)} />
              <div className="row between editor-toolbar"><div className="segmented" aria-label={t('editorMode')}><button aria-pressed={!preview} onClick={() => setPreview(false)}>{t('write')}</button><button aria-pressed={preview} onClick={() => setPreview(true)}>{t('preview')}</button></div>
                <button className="quiet" disabled={busy} onClick={() => { void run(async () => {
                  const latest = await unwrap(api.readNote(note.workspaceId, note.id, new AbortController().signal))
                  if (dirty) { setNote(latest); setBaseVersion(latest.version); setNotice(t('merge')); setPreview(true) }
                  else showNote(latest, false)
                }) }}><Icon name="refresh" />{t('refresh')}</button></div>
              {preview ? <div className="preview"><Markdown remarkPlugins={[remarkGfm]}>{notice === t('merge') ? note.content : body}</Markdown></div>
                : <textarea className="body" aria-label={t('noteBody')} value={body} placeholder={t('placeholder')} disabled={busy} onChange={event => setBody(event.target.value)} />}
              <div className="row between save-bar"><span className="status" role="status"><span className={`status-dot ${dirty ? 'pending' : ''}`} />{busy ? t('busy') : dirty ? t('unsaved') : t('saved')}</span><button className="primary" disabled={busy || !dirty || !title.trim()} onClick={() => { void save() }}>{t('save')}<Icon name="check" /></button></div>
              <NoteOrganizer key={note.id} note={note} dirty={dirty} sessionId={sessionId} api={api} t={t} onChanged={async () => { showNote(await unwrap(api.readNote(note.workspaceId, note.id, new AbortController().signal)), false); await refresh() }} />
              <details className="file-path"><summary>{t('localPath')}</summary><p>{note.path}</p></details>
            </section> : <div className="empty"><span className="empty-icon"><Icon name="note" /></span><h3>{t('captureThought')}</h3><p>{t('noNote')}</p></div>}
          </div>
        </section>}
      </> : <div className="empty welcome"><span className="empty-icon"><Icon name="book" /></span><h2>{busy ? t('loading') : t('welcome')}</h2><p>{t('noSpace')}</p>{!busy && !creating && <button className="primary" onClick={() => setCreating(true)}><Icon name="plus" />{t('createSpace')}</button>}</div>}
    </div>
  </div>
}
