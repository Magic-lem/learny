import { useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { StudySnapshot } from '../core/study-types.ts'
import type {} from './locales.ts'
type Props = { snapshot: StudySnapshot; selected: string | null; disabled: boolean; onSelect: (id: string) => void; t: PropsLocale<'learny'>['t'] }

/** Structured history uses actual stage, outcome and timestamps; bounded pages keep long histories usable. */
export function AttemptHistory({ snapshot, selected, disabled, onSelect, t }: Props) {
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(0)
  const rows = snapshot.attempts.filter(row => filter === 'all' || (filter === 'active' ? row.stage !== 'submitted' : row.stage === 'submitted'))
  const pages = Math.max(1, Math.ceil(rows.length / 10))
  const current = Math.min(page, pages - 1)
  return <details className="attempt-history"><summary>{t('attemptHistory')}<span className="count">{snapshot.attempts.length}</span></summary>
    <div className="history-toolbar"><label>{t('filterAttempts')}<select value={filter} onChange={event => { setFilter(event.target.value); setPage(0) }}><option value="all">{t('allAttempts')}</option><option value="active">{t('activeAttempts')}</option><option value="submitted">{t('submitted')}</option></select></label><span className="muted">{t('recordCount', { count: rows.length })}</span></div>
    <div className="table-scroll"><table className="history-table"><caption className="sr-only">{t('attemptHistory')}</caption><thead><tr><th>{t('taskColumn')}</th><th>{t('statusColumn')}</th><th>{t('createdColumn')}</th><th><span className="sr-only">{t('viewAttempt')}</span></th></tr></thead><tbody>
      {rows.slice(current * 10, (current + 1) * 10).map(row => <tr key={row.id} aria-selected={selected === row.id}><td>{snapshot.nodes.find(node => node.id === row.nodeId)?.title ?? row.nodeId}{row.retry && <small>{t('transferAttempt')}</small>}</td><td><span className={`record-status ${row.evaluation?.outcome ?? row.stage}`}>{row.evaluation ? t(row.evaluation.outcome) : t(row.stage)}</span>{row.modelStatus === 'failed' && <small className="error-text">{t('evaluationFailed')}</small>}</td><td><time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</time></td><td><button disabled={disabled} aria-label={t('viewNamedAttempt', { title: snapshot.nodes.find(node => node.id === row.nodeId)?.title ?? row.nodeId })} onClick={() => onSelect(row.id)}>{selected === row.id ? t('currentRecord') : t('viewAttempt')}</button></td></tr>)}
      {!rows.length && <tr><td colSpan={4} className="table-empty">{t('noAttempts')}</td></tr>}
    </tbody></table></div>
    {pages > 1 && <div className="pagination"><span>{current + 1} / {pages}</span><button disabled={!current} onClick={() => setPage(current - 1)}>{t('previousPage')}</button><button disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>{t('nextPage')}</button></div>}
  </details>
}
