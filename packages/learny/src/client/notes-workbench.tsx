import { useEffect, useId, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ClientRemote } from '@deepseek-ai/dsh-api-gateway/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { NoteDocument, NoteContext, NoteLocation, NoteSummary, StudyCourse } from '../core/types.ts'
import { value } from './remote.ts'
import { QuickNote, notifyNotes } from './quick-note.tsx'
import { contextOf, locationKey, noteFolders } from './note-tree.ts'
import { NoteOrganizer } from './revisions.tsx'
import type {} from './locales.ts'

type T = PropsLocale<'learny'>['t']
type Shared = { workspaceId: string; sessionId: string; api: ClientRemote['learny']; t: T }
type Props = Shared & { workspaceName: string; initialLocation?: NoteLocation; onOpenChat: (id: string) => void }
type Filter = 'all' | 'raw' | 'question'

export function NotesWorkbench({ workspaceId, sessionId, api, t, workspaceName, initialLocation, onOpenChat }: Props) {
  const [notes, setNotes] = useState<NoteSummary[]>([]), [course, setCourse] = useState<StudyCourse | null>(null)
  const [folder, setFolder] = useState(initialLocation ? locationKey(initialLocation) : 'all'), [filter, setFilter] = useState<Filter>('all'), [search, setSearch] = useState('')
  const [matches, setMatches] = useState<NoteSummary[] | null>(null), [selected, setSelected] = useState<NoteDocument | null>(null)
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [directory, setDirectory] = useState(false)
  const alive = useRef(true), reads = useRef(0), refreshId = useRef(0)
  const directoryId = useId()
  const folders = noteFolders(course, notes)
  const currentFolder = folders.find(item => item.key === folder)
  const initialFolder = initialLocation && locationKey(initialLocation) === folder ? initialLocation : undefined
  const label = currentFolder?.location?.title ?? initialFolder?.title ?? (folder === 'all' ? t('allNotes') : t('spaceNotes'))
  const location = folder === 'all' ? undefined : currentFolder?.location ?? initialFolder ?? null
  const candidates = matches ?? notes
  const rows = candidates.filter(row => (folder === 'all' || locationKey(contextOf(row).location) === folder)
    && (filter === 'question' ? contextOf(row).question : filter === 'raw' ? !contextOf(row).organized : true))
  const signal = () => new AbortController().signal
  async function refresh() {
    const id = ++refreshId.current
    try {
      const [snapshot, study] = await Promise.all([value(api.snapshot(sessionId, signal())), value(api.studySnapshot(workspaceId, signal()))])
      if (alive.current && id === refreshId.current && snapshot.workspaceId === workspaceId) { setNotes(snapshot.notes); setCourse(study.course); setLoading(false) }
    } catch (e) { if (alive.current && id === refreshId.current) { setError(e instanceof Error ? e.message : String(e)); setLoading(false) } }
  }
  useEffect(() => {
    alive.current = true; void refresh()
    const changed = (event: Event) => { if ((event as CustomEvent<string>).detail === workspaceId) void refresh() }
    window.addEventListener('learny:notes-changed', changed)
    return () => { alive.current = false; reads.current++; refreshId.current++; window.removeEventListener('learny:notes-changed', changed) }
  }, [workspaceId, sessionId])
  useEffect(() => {
    let current = true
    if (!search.trim()) { setMatches(null); return }
    const timer = setTimeout(() => {
      void value(api.searchNotes(workspaceId, search, signal())).then(result => { if (current) setMatches(result) })
        .catch(e => { if (current) setError(e instanceof Error ? e.message : String(e)) })
    }, 180)
    return () => { current = false; clearTimeout(timer) }
  }, [search, notes, workspaceId])
  async function openNote(id: string) {
    const request = ++reads.current
    try {
      setError('')
      const note = await value(api.readNote(workspaceId, id, signal()))
      if (alive.current && reads.current === request) { setSelected(note); setDirectory(false) }
    } catch (e) { if (alive.current && reads.current === request) setError(e instanceof Error ? e.message : String(e)) }
  }
  function chooseFolder(key: string) { reads.current++; setFolder(key); setSelected(null); setDirectory(false) }
  return <section className="notes-workbench notes-v2" aria-label={t('notes')}>
    <div className="manager-heading"><h2>{t('notes')}</h2><div className="row"><button className="quiet directory-toggle" aria-expanded={directory} aria-controls={directoryId} onClick={() => setDirectory(!directory)}>{t('noteDirectory')}</button><button className="quiet" onClick={() => { void refresh() }}>{t('refresh')}</button></div></div>
    {error && <p role="alert" className="status-error">{error}</p>}
    <div className={`notes-columns ${directory ? 'directory-open' : ''}`}>
      <nav className="notes-folders" id={directoryId} aria-label={t('noteDirectory')}>
        <button className={folder === 'all' && !selected ? 'active' : ''} onClick={() => chooseFolder('all')}>{t('allNotes')}<span className="count">{notes.length}</span></button>
        <details open className="notes-root"><summary>{workspaceName}</summary>
          {folders.map(item => <details className="notes-branch" key={item.key} open={item.key === folder || item.notes.some(row => row.id === selected?.id)}>
            <summary><button className={folder === item.key && !selected ? 'active' : ''} onClick={event => { event.preventDefault(); chooseFolder(item.key) }}>
              <span>{item.location?.title ?? t('spaceNotes')}{item.historical && <small>{t('historicalChapter')}</small>}</span><span className="count">{item.notes.length}</span></button>
            </summary>
            {item.notes.length ? item.notes.map(row => <button className={`notes-leaf ${selected?.id === row.id ? 'active' : ''}`} key={row.id} aria-current={selected?.id === row.id ? 'page' : undefined} onClick={() => { void openNote(row.id) }}>{row.title}</button>) : <p className="muted">{t('emptyChapterNotes')}</p>}
          </details>)}
        </details>
      </nav>
      <div className="notes-main">
        {selected ? <NoteEditor key={selected.id} {...{ workspaceId, sessionId, api, t, onOpenChat }} initial={selected} folders={folders}
          onBack={() => setSelected(null)} onChanged={saved => { setSelected(saved); notifyNotes(workspaceId) }} /> : <>
          <div className="notes-breadcrumb">{t('notes')} / {label}</div>
          <QuickNote key={`${workspaceId}:${sessionId}:${folder}`} {...{ workspaceId, sessionId, api, t, location }} locationLabel={folder === 'all' ? t('autoCurrentChapter') : t('saveInto', { title: label })} />
          <div className="notes-controls"><div className="notes-filters" aria-label={t('filterNotes')}>{(['all', 'raw', 'question'] as const).map(key => <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{t(key === 'all' ? 'allNotes' : key === 'raw' ? 'unorganized' : 'needsUnderstanding')}</button>)}</div>
            <label className="notes-search"><span className="sr-only">{t('search')}</span><input value={search} maxLength={1000} placeholder={t('searchShort')} onChange={event => setSearch(event.target.value)} /></label></div>
          {loading ? <p className="muted">{t('loading')}</p> : rows.map(row => <button className="notes-row" key={row.id} onClick={() => { void openNote(row.id) }}>
            <strong>{row.title}</strong>{row.excerpt && <span className="notes-excerpt">{row.excerpt}</span>}
            <span className="notes-meta"><span>{contextOf(row).source === 'chat' ? t('chatExcerpt') : t('myRecord')}</span><span>{contextOf(row).location?.title ?? t('spaceNotes')}</span>
              {contextOf(row).question && <span className="notes-state">{t('needsUnderstanding')}</span>}{contextOf(row).organized && <span>{t('organized')}</span>}
              <time dateTime={row.updatedAt}>{new Date(row.updatedAt).toLocaleDateString()}</time></span>
          </button>)}
          {!loading && !rows.length && <p className="notes-empty muted">{t('emptyFilteredNotes')}</p>}
        </>}
      </div>
    </div>
  </section>
}

type EditorProps = Shared & {
  initial: NoteDocument; folders: ReturnType<typeof noteFolders>
  onBack: () => void; onChanged: (note: NoteDocument) => void; onOpenChat: (id: string) => void
}
function NoteEditor({ initial, workspaceId, sessionId, api, t, folders, onBack, onChanged, onOpenChat }: EditorProps) {
  const [record, setRecord] = useState(initial)
  const [draft, setDraft] = useState(() => {
    try {
      const data = JSON.parse(localStorage.getItem(`learny.draft.${initial.id}`) ?? 'null')
      if (data && typeof data.title === 'string' && typeof data.content === 'string' && typeof data.version === 'string') return data as { title: string; content: string; version: string }
    } catch {}
    return { title: initial.title, content: initial.content, version: initial.version }
  })
  const [editing, setEditing] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [review, setReview] = useState(false), [revealed, setRevealed] = useState(false), [answer, setAnswer] = useState(''), [addition, setAddition] = useState(() => { try { return localStorage.getItem(`learny.addition.${initial.id}`) ?? '' } catch { return '' } }), [question, setQuestion] = useState(() => { try { return localStorage.getItem(`learny.question.${initial.id}`) ?? '' } catch { return '' } })
  const alive = useRef(true), flight = useRef<Promise<NoteDocument> | null>(null)
  const latest = useRef(draft); latest.current = draft
  const key = `learny.draft.${initial.id}`
  const dirty = draft.title !== record.title || draft.content !== record.content
  const context = contextOf(record)
  const signal = () => new AbortController().signal
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    try {
      if (dirty) localStorage.setItem(key, JSON.stringify(draft))
      else localStorage.removeItem(key)
    } catch { if (dirty) setError(t('draftUnavailable')) }
  }, [draft, dirty, key])
  function updateDraft(next: typeof draft) {
    try { localStorage.setItem(key, JSON.stringify(next)) } catch { setError(t('draftUnavailable')) }
    latest.current = next; setDraft(next)
  }
  function changed(saved: NoteDocument, replace = false) {
    if (!alive.current) { notifyNotes(workspaceId); return }
    setRecord(saved)
    if (replace) setDraft({ title: saved.title, content: saved.content, version: saved.version })
    else setDraft(current => ({ ...current, version: saved.version }))
    onChanged(saved)
  }
  async function prepare(): Promise<NoteDocument> {
    if (flight.current) return flight.current
    if (!dirty) return record
    const payload = latest.current
    const operation = value(api.saveNote({ workspaceId, noteId: record.id, title: payload.title.trim() || payload.content.trim().split('\n')[0]?.slice(0, 60) || t('untitled'), content: payload.content, expectedVersion: payload.version }, signal()))
    flight.current = operation
    try {
      const saved = await operation
      if (alive.current) {
        setRecord(saved)
        setDraft(current => ({ ...current, title: current.title === payload.title ? saved.title : current.title, version: saved.version }))
        onChanged(saved)
      }
      if (!alive.current) notifyNotes(workspaceId)
      return saved
    } finally { flight.current = null }
  }
  async function run(action: () => Promise<void>) {
    if (busy) return
    setBusy(true); setError('')
    try { await action() } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : String(e)) }
    finally { if (alive.current) setBusy(false) }
  }
  useEffect(() => {
    try {
      if (addition) localStorage.setItem(`learny.addition.${record.id}`, addition); else localStorage.removeItem(`learny.addition.${record.id}`)
      if (question) localStorage.setItem(`learny.question.${record.id}`, question); else localStorage.removeItem(`learny.question.${record.id}`)
    } catch { if (addition || question) setError(t('draftUnavailable')) }
  }, [addition, question, record.id])
  // Editing writes through automatically. Stale browser drafts retain their original base version.
  useEffect(() => {
    if (!dirty || busy || error) return
    const timer = setTimeout(() => { void prepare().catch(e => { if (alive.current) setError(e instanceof Error ? e.message : String(e)) }) }, 1100)
    return () => clearTimeout(timer)
  }, [draft, dirty, busy, error])
  async function updateContext(patch: Partial<NoteContext>) {
    const saved = await prepare()
    changed(await value(api.saveNote({ workspaceId, noteId: saved.id, title: saved.title, content: saved.content, expectedVersion: saved.version, context: { ...contextOf(saved), ...patch } }, signal())), true)
  }
  const markdown = (text: string) => <div className="prose"><Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown></div>
  return <article className="note-detail">
    <div className="row between"><button className="link" onClick={onBack}>{t('backToNotes')}</button><span className="muted" role="status">{busy ? t('working') : dirty ? t('unsaved') : t('saved')}</span></div>
    {error && <div className="status-error" role="alert"><p>{error}</p><button onClick={() => { void run(async () => { await prepare() }) }}>{t('retrySave')}</button><button onClick={() => { void run(async () => {
      const current = await value(api.readNote(workspaceId, record.id, signal()))
      setRecord(current); setDraft(old => ({ ...old, version: current.version })); setEditing(true); setError(t('mergeBeforeSave'))
    }) }}>{t('loadForMerge')}</button><p className="muted">{t('draftRetained')}</p>{error === t('mergeBeforeSave') && <details open><summary>{t('latestSavedNote')}</summary>{markdown(record.content)}</details>}</div>}
    <h2 className="note-detail-title">{record.title}</h2>
    <div className="notes-meta"><span>{context.source === 'chat' ? t('chatExcerpt') : t('myRecord')}</span>{context.question && <span className="notes-state">{t('needsUnderstanding')}</span>}</div>
    <details className="note-location"><summary>{context.location?.title ?? t('spaceNotes')}</summary>
      <label>{t('moveNote')}<select disabled={busy || dirty} value={locationKey(context.location)} onChange={event => { const location = folders.find(item => item.key === event.target.value)?.location ?? null; void run(() => updateContext({ location })) }}>
        {folders.map(item => <option key={item.key} value={item.key}>{item.location?.title ?? t('spaceNotes')}{item.historical ? ` (${t('historicalChapter')})` : ''}</option>)}
      </select></label>
      {context.source === 'chat' && context.sessionId && <><button className="link" onClick={() => onOpenChat(context.sessionId!)}>{t('returnLearningChat')}</button><p className="muted">{t('sessionReturnHint')}</p></>}
    </details>
    {review ? <section className="note-review"><h3>{t('recallTitle')}</h3><p>{t('recallPrompt', { title: record.title })}</p>
      <label><span className="sr-only">{t('myRecall')}</span><textarea rows={3} value={answer} readOnly={revealed} placeholder={t('recallOptional')} onChange={event => setAnswer(event.target.value)} /></label>
      {!revealed ? <button className="primary" disabled={busy} onClick={() => { void run(async () => { await prepare(); setRevealed(true) }) }}>{t('revealNote')}</button> : <><div className="recall-answer">{markdown(record.content)}</div><p className="muted">{t('selfReviewHint')}</p>
        <div className="row">{(['remembered', 'uncertain'] as const).map(outcome => <button key={outcome} disabled={busy} onClick={() => { void run(async () => {
          changed(await value(api.reviewNote(workspaceId, record.id, record.version, outcome, signal())), true); setReview(false)
        }) }}>{t(outcome === 'remembered' ? 'recallRemembered' : 'recallUncertain')}</button>)}</div></>}
      <button className="quiet" onClick={() => setReview(false)}>{t('endRecall')}</button>
    </section> : <>
      {editing ? <div className="note-edit-form"><label>{t('noteTitle')}<input maxLength={120} value={draft.title} onChange={event => { setError(''); updateDraft({ ...draft, title: event.target.value }) }} /></label>
        <label><span className="sr-only">{t('noteBody')}</span><textarea className="note-edit-body" value={draft.content} onChange={event => { setError(''); updateDraft({ ...draft, content: event.target.value }) }} /></label>
        <button disabled={busy} onClick={() => { void run(async () => { await prepare(); setEditing(false) }) }}>{t('finishEditing')}</button>
      </div> : markdown(draft.content)}
      <div className="note-detail-tools"><button className="quiet" disabled={busy} onClick={() => setEditing(!editing)}>{t(editing ? 'preview' : 'editOriginal')}</button><button className="quiet" disabled={busy} onClick={() => { void run(() => updateContext({ question: !context.question })) }}>{t(context.question ? 'clearQuestion' : 'markQuestion')}</button></div>
      <NoteOrganizer note={record} dirty={dirty} sessionId={sessionId} api={api} t={t} prepare={prepare} onChanged={async () => { changed(await value(api.readNote(workspaceId, record.id, signal())), true) }} />
      <details className="note-supplement"><summary>{t('addUnderstanding')}</summary><label><span className="sr-only">{t('addUnderstanding')}</span><textarea rows={3} value={addition} placeholder={t('understandingPlaceholder')} onChange={event => setAddition(event.target.value)} /></label>
        <button disabled={busy || !addition.trim()} onClick={() => { void run(async () => { const saved = await prepare(); changed(await value(api.saveNote({ workspaceId, noteId: record.id, title: saved.title, content: `${saved.content}\n\n## ${t('myUnderstanding')}\n\n${addition.trim()}`, expectedVersion: saved.version }, signal())), true); setAddition('') }) }}>{t('saveUnderstanding')}</button></details>
      <details className="note-supplement"><summary>{t('askAboutNote')}</summary><label><span className="sr-only">{t('noteQuestion')}</span><textarea rows={2} maxLength={2000} value={question} placeholder={t('noteQuestionPlaceholder')} onChange={event => setQuestion(event.target.value)} /></label><button disabled={busy || !question.trim()} onClick={() => { void run(async () => {
        const saved = await prepare()
        await value(api.askAboutNote(workspaceId, saved.id, sessionId, question.trim(), signal()))
        setQuestion(''); onOpenChat(sessionId)
      }) }}>{t('sendNoteQuestion')}</button></details>
      <div className="note-review-entry"><div><h3>{t('recallTitle')}</h3><p className="muted">{context.review ? t('lastRecall', { date: new Date(context.review.at).toLocaleDateString() }) : t('recallIntro')}</p></div><button disabled={busy} onClick={() => { setReview(true); setRevealed(false); setAnswer('') }}>{t('reviewNote')}</button></div>
    </>}
  </article>
}
