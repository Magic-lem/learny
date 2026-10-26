import { useEffect, useId, useRef, useState } from 'react'
import type { ClientRemote } from '@deepseek-ai/dsh-api-gateway/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { CapabilityStatus, Workspace } from '../core/types.ts'

type Props = PropsLocale<'learny'> & {
  workspace?: Workspace
  capabilities: CapabilityStatus | null
  api: ClientRemote['learny']
  sessionId: string
  onSaved: (workspace: Workspace) => void
  onCapabilities: (capabilities: CapabilityStatus) => void
  onBack: () => void
}

/** A separate task context: editable space fields, immutable source, read-only host diagnostics. */
export function SpaceSettings({ workspace, capabilities, api, sessionId, t, onSaved, onCapabilities, onBack }: Props) {
  const id = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  const keepEditing = useRef<HTMLButtonElement>(null)
  const alive = useRef(true)
  const [baseline, setBaseline] = useState(workspace)
  const [name, setName] = useState(workspace?.name ?? '')
  const [goal, setGoal] = useState(workspace?.goal ?? '')
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState(false)
  const [exitRequested, setExitRequested] = useState(false)
  const dirty = !!baseline && (name !== baseline.name || goal !== baseline.goal)

  useEffect(() => {
    alive.current = true
    heading.current?.focus({ preventScroll: true })
    return () => { alive.current = false }
  }, [])

  useEffect(() => {
    if (exitRequested) keepEditing.current?.focus()
  }, [exitRequested])

  function leave() {
    if (dirty) setExitRequested(true)
    else onBack()
  }

  async function save() {
    if (!baseline || saving || !dirty) return
    setSaving(true); setFeedback(''); setError(false); setExitRequested(false)
    try {
      const result = await api.updateWorkspace({
        workspaceId: baseline.id, name, goal,
        expected: { name: baseline.name, goal: baseline.goal },
      }, new AbortController().signal)
      if (!result.ok) throw new Error(result.error.code === 'learny/workspace-conflict' ? t('settingsConflict') : result.error.message)
      if (!alive.current) return
      setBaseline(result.value); setName(result.value.name); setGoal(result.value.goal)
      onSaved(result.value); setFeedback(t('settingsSaved'))
    } catch (error) {
      if (alive.current) { setError(true); setFeedback(error instanceof Error ? error.message : String(error)) }
    } finally { if (alive.current) setSaving(false) }
  }

  async function check() {
    setChecking(true); setFeedback(''); setError(false)
    try {
      const result = await api.capabilityStatus(sessionId, new AbortController().signal)
      if (!result.ok) throw new Error(result.error.message)
      if (alive.current) { onCapabilities(result.value); setFeedback(t('settingsChecked')) }
    } catch (error) {
      if (alive.current) { setError(true); setFeedback(error instanceof Error ? error.message : String(error)) }
    } finally { if (alive.current) setChecking(false) }
  }

  return <section className="space-settings" aria-labelledby={`${id}-title`}>
    <header className="settings-heading">
      <button className="quiet settings-back" type="button" disabled={saving || checking} onClick={leave}>{t('settingsBack')}</button>
      <h2 ref={heading} tabIndex={-1} id={`${id}-title`}>{t(workspace ? 'spaceSettings' : 'settingsEnvironment')}</h2>
      <p className="muted settings-context">{workspace?.name ?? t('setupIntro')}</p>
    </header>

    {exitRequested && <div className="settings-exit" role="alert"><p>{t('settingsDiscardHint')}</p><div className="row"><button ref={keepEditing} type="button" onClick={() => { setExitRequested(false); heading.current?.focus({ preventScroll: true }) }}>{t('settingsKeepEditing')}</button><button type="button" onClick={onBack}>{t('settingsDiscard')}</button></div></div>}
    {baseline && <form className="settings-form" onSubmit={event => { event.preventDefault(); void save() }}>
      <section className="settings-section" aria-labelledby={`${id}-basic`}>
        <div className="settings-section-heading"><h3 id={`${id}-basic`}>{t('settingsBasic')}</h3><p className="muted">{t('settingsBasicHint')}</p></div>
        <div className="settings-fields">
          <label htmlFor={`${id}-name`}>{t('name')}<input id={`${id}-name`} required maxLength={120} disabled={saving} value={name} onChange={event => { setName(event.target.value); setFeedback(''); setExitRequested(false) }} /></label>
          <label htmlFor={`${id}-goal`}>{t('goal')}<textarea id={`${id}-goal`} maxLength={5000} rows={4} disabled={saving} value={goal} aria-describedby={`${id}-goal-hint`} onChange={event => { setGoal(event.target.value); setFeedback(''); setExitRequested(false) }} /></label>
          <p className="muted" id={`${id}-goal-hint`}>{t('settingsGoalHint')}</p>
        </div>
      </section>
      <section className="settings-section" aria-labelledby={`${id}-source`}>
        <div className="settings-section-heading"><h3 id={`${id}-source`}>{t('settingsSource')}</h3><p className="muted">{t('settingsSourceHint')}</p></div>
        <dl className="settings-source">
          <div><dt>{t('kind')}</dt><dd>{t(baseline.kind === 'project' ? 'project' : 'topic')}</dd></div>
          {baseline.kind === 'project' && <div><dt>{t('path')}</dt><dd className="material-path">{baseline.materialPath}</dd></div>}
        </dl>
      </section>
      <footer className="settings-actions">
        <span className="settings-edit-state">{t(dirty ? 'unsaved' : 'settingsUpToDate')}</span>
        <button type="button" disabled={saving || checking} onClick={leave}>{t('cancel')}</button>
        <button className="primary" type="submit" disabled={saving || !dirty || !name.trim()}>{t(saving ? 'busy' : 'settingsSave')}</button>
      </footer>
    </form>}

    <div className={`settings-feedback${error ? ' status-error' : ''}`} role="status" aria-live="polite">{feedback}</div>

    <section className="settings-environment" aria-labelledby={`${id}-environment`}>
      <div className="settings-environment-heading"><div><h3 id={`${id}-environment`}>{t('settingsEnvironment')}</h3><p className="muted">{t('settingsEnvironmentHint')}</p></div><button type="button" disabled={checking || saving} onClick={() => { void check() }}>{t(checking ? 'working' : 'settingsRecheck')}</button></div>
      <dl className="settings-capabilities">{([
        ['setupModel', 'setupModelDetail', capabilities?.model === 'ready', capabilities?.model === 'ready' ? 'setupReady' : 'setupNeedsSession'],
        ['setupSearch', 'setupSearchDetail', capabilities?.webSearch === 'mounted', capabilities?.webSearch === 'mounted' ? 'setupMounted' : 'setupMissing'],
        ['setupFetch', 'setupFetchDetail', capabilities?.webFetch === 'mounted', capabilities?.webFetch === 'mounted' ? 'setupMounted' : 'setupMissing'],
      ] as const).map(([label, detail, ready, status]) => <div key={label}><dt>{t(label)}</dt><dd><span className={`settings-capability-status ${ready ? 'ready' : 'pending'}`}>{t(!capabilities ? 'working' : status)}</span><p>{t(detail)}</p></dd></div>)}</dl>
      <p className="muted settings-host-hint">{t('setupOneApiHint')}</p>
    </section>
  </section>
}
