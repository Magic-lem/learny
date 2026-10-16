import { Icon } from './icons.tsx'
import { StudyWorkbench, type ManagementView } from './manager.tsx'
import { NoteOrganizer } from './revisions.tsx'
import { useEffect, useState, useRef, useId } from 'react'
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
  onOpenChat: (sessionId: string) => void
}

interface Draft { title: string; content: string; version: string }
const draftKey = (noteId: string) => `learny.draft.${noteId}`

/** Session-owned workbench backed by the host's durable snapshot and Markdown files. */
export function LearnyBody({ sessionId, api, t, subscribeReset, onOpenChat }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot>({ workspaces: [], workspaceId: null, notes: [] })
  const [note, setNote] = useState<NoteDocument | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [baseVersion, setBaseVersion] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [preview, setPreview] = useState(false)
  const [view, setView] = useState<ManagementView>('current')
  const [matches, setMatches] = useState<Snapshot['notes']>([])
  const [navigationVersion, setNavigationVersion] = useState(0)
  const [settings, setSettings] = useState(false)
  const navRef = useRef<HTMLElement>(null)
  const navigationId = useId()
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
      await refresh(); setCreating(false); setSettings(false); setView('current'); setNote(null)
    })
  }

  async function chooseSpace(id: string) {
    await run(async () => {
      await unwrap(api.bindWorkspace(sessionId, id, new AbortController().signal))
      await refresh(); setNote(null); setSearch(''); setView('current'); setSettings(false)
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

        <button className="quiet new-space" aria-label={t('createSpace')} aria-expanded={creating} disabled={busy} onClick={() => setCreating(!creating)}><Icon name="plus" /><span>{t('createSpace')}</span></button>
        {workspace && <button className="quiet" onClick={() => setSettings(!settings)} aria-expanded={settings}>{t('spaceSettings')}</button>}
      </header>
      <div className="manager-space-picker">        <label className="space-select"><span className="sr-only">{t('spaces')}</span><select value={snapshot.workspaceId ?? ''} disabled={busy} onChange={event => { if (event.target.value) void chooseSpace(event.target.value) }}>
          <option value="" disabled>{t('choose')}</option>{snapshot.workspaces.map(space => <option key={space.id} value={space.id}>{space.name}</option>)}
        </select></label></div>
      {workspace && !creating && <nav ref={navRef} className="workspace-nav" role="tablist" aria-label={t('workspaceNavigation')} onKeyDown={event => {
        const buttons = Array.from(navRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const target = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : event.key === 'ArrowRight' ? (index + 1) % buttons.length : event.key === 'ArrowLeft' ? (index - 1 + buttons.length) % buttons.length : -1
        if (target < 0) return
        event.preventDefault(); buttons[target]?.click(); buttons[target]?.focus()
      }}>{(['current', 'map', 'sources', 'notes'] as const).map(tab => <button key={tab} role="tab" id={`${navigationId}-nav-${tab}`} aria-controls={`${navigationId}-content`} aria-selected={view === tab} tabIndex={view === tab ? 0 : -1} onClick={() => { setView(tab); setSettings(false); setNavigationVersion(version => version + 1) }}>{t(tab === 'current' ? 'currentTab' : tab === 'map' ? 'mapTab' : tab === 'sources' ? 'managementSources' : 'managementNotes')}</button>)}
      </nav>}
      </div>
      {creating && <form className="space-form" onSubmit={event => { void createSpace(event) }}>
        <div className="form-heading"><h2>{t('createSpace')}</h2><p className="muted">{t('createIntro')}</p></div>
        <label>{t('name')}<input required maxLength={120} value={form.name} placeholder={t('namePlaceholder')} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
        <label>{t('kind')}<select value={form.kind} onChange={event => setForm({ ...form, kind: event.target.value === 'project' ? 'project' : 'topic' })}><option value="topic">{t('topic')}</option><option value="project">{t('project')}</option></select></label>
        <label className="full-width">{t('goal')}<textarea maxLength={5000} rows={2} value={form.goal} placeholder={t('goalPlaceholder')} onChange={event => setForm({ ...form, goal: event.target.value })} /></label>
        {form.kind === 'project' && <label className="full-width">{t('path')}<input required value={form.materialPath} onChange={event => setForm({ ...form, materialPath: event.target.value })} /></label>}
        <div className="row full-width"><button className="primary" disabled={busy} type="submit">{t('create')}</button><button type="button" onClick={() => setCreating(false)}>{t('cancel')}</button></div>
      </form>}
      {!setupDismissed && !settings && <div className="setup-reminder"><span>{t('setupTitle')}</span><button className="link" onClick={() => setSettings(true)}>{t('setupOpen')}</button><button className="quiet" onClick={dismissSetup}>{t('setupDismiss')}</button></div>}
      {settings && <section className="setup-check" aria-labelledby="learny-setup-title">
        <div className="setup-heading"><div><p className="section-label">{t('setupEyebrow')}</p><h2 id="learny-setup-title">{t('setupTitle')}</h2><p className="muted">{t('setupIntro')}</p></div><button className="quiet" disabled={busy} onClick={() => { dismissSetup(); setSettings(false) }}>{t('setupDismiss')}</button></div>
        <div className="setup-list">
          <div className="setup-row"><span>{t('setupModel')}</span><strong className={capabilities?.model === 'ready' ? 'ready' : 'pending'}>{!capabilities ? t('working') : capabilities.model === 'ready' ? t('setupReady') : t('setupNeedsSession')}</strong><p>{t('setupModelDetail')}</p></div>
          <div className="setup-row"><span>{t('setupSearch')}</span><strong className={capabilities?.webSearch === 'mounted' ? 'ready' : 'pending'}>{!capabilities ? t('working') : capabilities.webSearch === 'mounted' ? t('setupMounted') : t('setupMissing')}</strong><p>{t('setupSearchDetail')}</p></div>
          <div className="setup-row"><span>{t('setupFetch')}</span><strong className={capabilities?.webFetch === 'mounted' ? 'ready' : 'pending'}>{!capabilities ? t('working') : capabilities.webFetch === 'mounted' ? t('setupMounted') : t('setupMissing')}</strong><p>{t('setupFetchDetail')}</p></div>
        </div>
        <p className="setup-footnote">{t('setupOneApiHint')}</p>
      </section>}
      {notice && <div className="notice" role="status">{notice}</div>}
      {creating ? null : workspace ? <>
        {settings && workspace.goal && <details className="goal"><summary><span>{t('goal')}</span><span>{workspace.goal}</span></summary><p>{workspace.goal}</p>{workspace.kind==='project'&&<p className="material-path">{workspace.materialPath}</p>}</details>}

        <div id={`${navigationId}-content`} role="tabpanel" aria-labelledby={`${navigationId}-nav-${view}`}>
        {view !== 'notes' ? <StudyWorkbench key={`${workspace.id}:${sessionId}`} workspaceId={workspace.id} sessionId={sessionId} api={api} t={t} view={view} navigationVersion={navigationVersion} onView={setView} onOpenChat={onOpenChat} onNote={async taskTitle => { await run(async () => { showNote(await unwrap(api.createNote(workspace.id, taskTitle, new AbortController().signal))); await refresh(); setView('notes') }) }} onGenerateCourse={async () => { await unwrap(api.generateCourse(workspace.id, sessionId, new AbortController().signal)) }} /> : <section className="notes-workbench" aria-label={t('notes')}>
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
        </div>
      </> : <div className="empty welcome"><span className="empty-icon"><Icon name="book" /></span><h2>{busy ? t('loading') : t('welcome')}</h2><p>{t('noSpace')}</p>{!busy && !creating && <button className="primary" onClick={() => setCreating(true)}><Icon name="plus" />{t('createSpace')}</button>}</div>}
    </div>
  </div>
}
