import { Icon } from './icons.tsx'
import { StudyWorkbench, type ManagementView } from './manager.tsx'
import { NotesWorkbench } from './notes-workbench.tsx'
import { SpaceSettings } from './settings.tsx'
import { useEffect, useState, useRef, useId } from 'react'
import type { FormEvent } from 'react'
import type { ClientRemote } from '@deepseek-ai/dsh-api-gateway/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from 'dsh-plugin-learny/remote'
import type { CapabilityStatus, Snapshot, CreateWorkspace, NoteLocation } from '../core/types.ts'
import type {} from './locales.ts'

type Props = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<'learny'> & {
  api: ClientRemote['learny']
  subscribeReset: (listener: () => void) => () => void
  onOpenChat: (sessionId: string) => void
}


/** Session-owned workbench backed by the host's durable snapshot and Markdown files. */
export function LearnyBody({ sessionId, api, t, subscribeReset, onOpenChat }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot>({ workspaces: [], workspaceId: null, notes: [] })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [noteLocation, setNoteLocation] = useState<NoteLocation | undefined>()
  const [view, setView] = useState<ManagementView>('current')
  const [navigationVersion, setNavigationVersion] = useState(0)
  const [settings, setSettings] = useState(false)
  const navRef = useRef<HTMLElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const settingsButton = useRef<HTMLButtonElement>(null)
  const learningScroll = useRef(0)
  const navigationId = useId()
  const [creating, setCreating] = useState(false)
  const [capabilities, setCapabilities] = useState<CapabilityStatus | null>(null)
  const [setupDismissed, setSetupDismissed] = useState(() => {
    try { return localStorage.getItem('learny.setup.dismissed.v1') === '1' } catch { return false }
  })
  const [form, setForm] = useState<CreateWorkspace>({ name: '', goal: '', kind: 'topic', materialPath: '' })
  const alive = useRef(true)
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
      window.dispatchEvent(new CustomEvent('learny:workspace-changed', { detail: sessionId }))
      setCapabilities(hostCapabilities)
    }
  }

  function dismissSetup() {
    setSetupDismissed(true)
    try { localStorage.setItem('learny.setup.dismissed.v1', '1') } catch { /* The check remains dismissible for this render. */ }
  }

  function openSettings() {
    learningScroll.current = rootRef.current?.scrollTop ?? 0
    setCreating(false); setSettings(true); setNotice('')
    rootRef.current?.scrollTo({ top: 0 })
  }

  function closeSettings() {
    setSettings(false)
    requestAnimationFrame(() => {
      rootRef.current?.scrollTo({ top: learningScroll.current })
      settingsButton.current?.focus({ preventScroll: true })
    })
  }

  useEffect(() => {
    alive.current = true
    void run(refresh)
    const dispose = subscribeReset(() => { void run(refresh) })
    return () => { alive.current = false; dispose() }
  }, [sessionId, api, subscribeReset])

  async function createSpace(event: FormEvent) {
    event.preventDefault()
    await run(async () => {
      const space = await unwrap(api.createWorkspace(form, new AbortController().signal))
      await unwrap(api.bindWorkspace(sessionId, space.id, new AbortController().signal))
      await refresh(); setCreating(false); setSettings(false); setView('current')
    })
  }

  async function chooseSpace(id: string) {
    await run(async () => {
      await unwrap(api.bindWorkspace(sessionId, id, new AbortController().signal))
      await refresh(); setView('current'); setSettings(false)
    })
  }

  return <div ref={rootRef} className="learny" data-learny>
    <div className="learny-shell">
      <div className="workspace-chrome"><header className="workspace-header">
        <div className="brand"><Icon name="book" /><h1>{t('title')}</h1></div>

        {!settings && <button className="quiet new-space" aria-label={t('createSpace')} aria-expanded={creating} disabled={busy} onClick={() => setCreating(!creating)}><Icon name="plus" /><span>{t('createSpace')}</span></button>}
        {workspace && !creating && !settings && <button ref={settingsButton} className="quiet" disabled={busy} onClick={openSettings}>{t('spaceSettings')}</button>}
      </header>
      {!settings && <div className="manager-space-picker">        <label className="space-select"><span className="sr-only">{t('spaces')}</span><select value={snapshot.workspaceId ?? ''} disabled={busy} onChange={event => { if (event.target.value) void chooseSpace(event.target.value) }}>
          <option value="" disabled>{t('choose')}</option>{snapshot.workspaces.map(space => <option key={space.id} value={space.id}>{space.name}</option>)}
        </select></label></div>}
      {workspace && !creating && !settings && <nav ref={navRef} className="workspace-nav" role="tablist" aria-label={t('workspaceNavigation')} onKeyDown={event => {
        const buttons = Array.from(navRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const target = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : event.key === 'ArrowRight' ? (index + 1) % buttons.length : event.key === 'ArrowLeft' ? (index - 1 + buttons.length) % buttons.length : -1
        if (target < 0) return
        event.preventDefault(); buttons[target]?.click(); buttons[target]?.focus()
      }}>{(['current', 'map', 'sources', 'notes'] as const).map(tab => <button key={tab} role="tab" id={`${navigationId}-nav-${tab}`} aria-controls={`${navigationId}-content`} aria-selected={view === tab} tabIndex={view === tab ? 0 : -1} onClick={() => { if (tab === 'notes') setNoteLocation(undefined); setView(tab); setSettings(false); setNavigationVersion(version => version + 1) }}>{t(tab === 'current' ? 'currentTab' : tab === 'map' ? 'mapTab' : tab === 'sources' ? 'managementSources' : 'managementNotes')}</button>)}
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
      {!setupDismissed && !settings && !creating && <div className="setup-reminder"><span>{t('setupTitle')}</span><button className="link" disabled={busy} onClick={openSettings}>{t('setupOpen')}</button><button className="quiet" onClick={dismissSetup}>{t('setupDismiss')}</button></div>}
      {settings && <SpaceSettings key={`${workspace?.id ?? 'host'}:${sessionId}`} workspace={workspace} capabilities={capabilities} api={api} sessionId={sessionId} t={t} onBack={closeSettings} onCapabilities={setCapabilities} onSaved={updated => {
        setSnapshot(current => ({ ...current, workspaces: current.workspaces.map(space => space.id === updated.id ? updated : space) }))
        window.dispatchEvent(new CustomEvent('learny:workspace-changed', { detail: sessionId }))
      }} />}
      {notice && <div className="notice" role="status">{notice}</div>}
      {workspace ? <div hidden={creating || settings}>
        <div id={`${navigationId}-content`} role="tabpanel" aria-labelledby={`${navigationId}-nav-${view}`}>
        {view !== 'notes' ? <StudyWorkbench key={`${workspace.id}:${sessionId}`} workspaceId={workspace.id} sessionId={sessionId} api={api} t={t} view={view} navigationVersion={navigationVersion} onView={setView} onOpenChat={onOpenChat} onNote={async (title, nodeId, courseVersion) => { setNoteLocation(nodeId && courseVersion ? { title, nodeId, courseVersion } : undefined); setView('notes') }} onGenerateCourse={async () => { await unwrap(api.generateCourse(workspace.id, sessionId, new AbortController().signal)) }} /> : <NotesWorkbench key={`${workspace.id}:${sessionId}`} workspaceId={workspace.id} sessionId={sessionId} workspaceName={workspace.name} initialLocation={noteLocation} api={api} t={t} onOpenChat={onOpenChat} />}
        </div>
      </div> : !creating && !settings && <div className="empty welcome"><span className="empty-icon"><Icon name="book" /></span><h2>{busy ? t('loading') : t('welcome')}</h2><p>{t('noSpace')}</p>{!busy && <button className="primary" onClick={() => setCreating(true)}><Icon name="plus" />{t('createSpace')}</button>}</div>}
    </div>
  </div>
}
