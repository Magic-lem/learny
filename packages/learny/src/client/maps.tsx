import { useEffect, useId, useRef, useState } from 'react'
import type { StudyNode, StudySnapshot } from '../core/study-types.ts'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { routeLayout } from './learning-map.ts'
type T = PropsLocale<'learny'>['t']

export function LearningMap({ snapshot, currentId, disabled, t, onSelect }: {
  snapshot: StudySnapshot; currentId?: string; disabled: boolean; t: T; onSelect: (id: string) => void
}) {
  const [mode, setMode] = useState<'graph' | 'list'>('graph')
  const [fontSize, setFontSize] = useState(13)
  const [width, setWidth] = useState(320)
  const container = useRef<HTMLDivElement>(null)
  const marker = useId().replace(/:/g, '')
  useEffect(() => {
    const element = container.current
    if (!element) return
    const resize = () => { setWidth(Math.max(200, element.clientWidth)); setFontSize(parseFloat(getComputedStyle(element).fontSize) || 13) }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [mode])
  const layout = routeLayout(snapshot.nodes, width, fontSize)
  const status = (id: string) => snapshot.progress?.some(row => row.nodeId === id && row.completed) ? t('selfCompleted')
    : snapshot.attempts.some(row => row.nodeId === id && row.evaluation?.outcome === 'independent') ? t('independent')
      : id === currentId ? t('learningNow') : t('notStarted')
  return <section className="learning-map">
    <div className="manager-heading"><h2>{t('mapTab')}</h2><div className="view-switch" aria-label={t('mapDisplay')}>
      <button aria-pressed={mode === 'graph'} onClick={() => setMode('graph')}>{t('mapGraph')}</button>
      <button aria-pressed={mode === 'list'} onClick={() => setMode('list')}>{t('mapList')}</button>
    </div></div>
    <p className="muted map-intro">{t('mapIntro')}</p>
    {mode === 'graph' ? <div ref={container} className="route-canvas" style={{ height: layout.height }}>
      <svg width="100%" height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} className="route-lines" aria-hidden="true">
        <defs><marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M1 1 L9 5 L1 9" /></marker></defs>
        {layout.links.map(link => <path key={link.to} d={link.path} markerEnd={`url(#${marker})`} />)}
      </svg>
      {layout.boxes.map(box => {
        const node = snapshot.nodes.find(row => row.id === box.id)!
        return <button key={node.id} disabled={disabled} className={`route-node ${currentId === node.id ? 'active' : ''}`}
          style={{ left: box.x, top: box.y, width: box.w, minHeight: box.h }} onClick={() => onSelect(node.id)}>
          <small>{status(node.id)}</small><strong>{node.title}</strong>
        </button>
      })}
    </div> : <div className="manager-chapters">{snapshot.nodes.map((node, index) => <button key={node.id} disabled={disabled}
      className={node.id === currentId ? 'active' : ''} onClick={() => onSelect(node.id)}>
      <span className="chapter-index">{index + 1}</span><span><strong>{node.title}</strong>
        {node.prerequisite && <small>{t('recommendedPrerequisite', { title: snapshot.nodes.find(row => row.id === node.prerequisite)?.title ?? node.prerequisite })}</small>}
      </span><small>{status(node.id)}</small>
    </button>)}</div>}
    <p className="muted map-caption">{t('mapLegend')}</p>
    {layout.cyclic.length > 0 && <p className="status-error">{t('mapCycle')}</p>}
  </section>
}

/** Branches come from stored course evidence, never fabricated concepts. */
export function KnowledgeMap({ node, t }: { node: StudyNode; t: T }) {
  const [mode, setMode] = useState<'tree' | 'outline'>('tree')
  const element = useRef<HTMLElement>(null)
  const branches = [
    { title: t('keyPoints'), items: node.keyPoints?.map(point => point.text) ?? [] },
    { title: t('criteria'), items: node.criteria.map(item => item.description) },
  ].filter(branch => branch.items.length)
  return <section ref={element} className="knowledge-map" aria-label={t('nodeKnowledgeMap')}>
    <div className="manager-heading"><h3>{t('nodeKnowledgeMap')}</h3><div className="view-switch" aria-label={t('knowledgeDisplay')}>
      <button aria-pressed={mode === 'tree'} onClick={() => setMode('tree')}>{t('knowledgeTree')}</button>
      <button aria-pressed={mode === 'outline'} onClick={() => setMode('outline')}>{t('knowledgeOutline')}</button>
    </div></div>
    {mode === 'tree' ? <>
      <div className="knowledge-tree"><div className="knowledge-root">{node.title}</div><div className="knowledge-branches">
        {branches.map((branch, index) => <details className="knowledge-branch" key={branch.title} open={index === 0}>
          <summary>{branch.title}<span className="count">{branch.items.length}</span></summary>
          <ul>{branch.items.map((text, i) => <li key={i}>{text}</li>)}</ul>
        </details>)}
      </div></div>
      <button className="quiet expand-knowledge" onClick={event => {
        const rows = Array.from(element.current?.querySelectorAll('details') ?? [])
        const open = rows.some(row => !row.open)
        rows.forEach(row => { row.open = open })
        event.currentTarget.textContent = t(open ? 'collapseKnowledge' : 'expandKnowledge')
      }}>{t('expandKnowledge')}</button>
    </> : <ul className="knowledge-outline">{branches.map(branch => <li key={branch.title}><strong>{branch.title}</strong><ul>{branch.items.map((text, i) => <li key={i}>{text}</li>)}</ul></li>)}</ul>}
    <p className="muted">{t('knowledgeEvidenceHint')}</p>
  </section>
}
