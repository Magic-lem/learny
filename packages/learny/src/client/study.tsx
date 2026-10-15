import { Icon } from './icons.tsx'
import { TutorPanel } from './tutor.tsx'
import { AttemptHistory } from './history.tsx'
import { value } from './remote.ts'
export { value } from './remote.ts'
import { useEffect, useId, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { KeyboardEvent, MouseEvent } from 'react'
import type { ClientRemote } from '@deepseek-ai/dsh-api-gateway/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { Attempt, PracticeKind, Stage, StudySnapshot } from '../core/study-types.ts'
import type {} from 'dsh-plugin-learny/remote'
import type {} from './locales.ts'

type Props = { workspaceId: string; sessionId: string; api: ClientRemote['learny']; t: PropsLocale<'learny'>['t']; onNote: (title: string) => Promise<void>; onGenerateCourse: () => Promise<void> }
type LabelKey = Parameters<Props['t']>[0]
/**
 * Turn `[web-1]` into a jump link to that source row so a citation is meaningful
 * instead of noise; ids this node does not carry stay as plain text.
 */
function citeLinks(text: string, known: Set<string>): string {
  return text
    .replace(/\[(?:sourceId|source|资料id|来源id|来源)\s*[:：]\s*([a-z0-9-]+)\]/gi, '[$1]')
    .replace(/\[([a-z0-9-]+)\]/gi, (match, id: string) => known.has(id.toLowerCase()) ? `[${id}](#learny-source-${id.toLowerCase()})` : match)
}
/** Practice is recorded the way the task is done, not always as one free-text box. */
const PRACTICE_FIELDS: Partial<Record<PracticeKind, LabelKey[]>> = {
  command: ['practiceSteps', 'practiceObservation', 'practiceConclusion'],
  config: ['practiceConfig', 'practiceVerification', 'practiceConclusion'],
  compare: ['practiceOptions', 'practiceDifference', 'practiceConclusion'],
  design: ['practiceDesign', 'practiceVerification', 'practiceConclusion'],
}
export function StudyWorkbench({workspaceId,sessionId,api,t,onNote,onGenerateCourse}: Props) {
  const [snapshot,setSnapshot] = useState<StudySnapshot|null>(null)
  const [selected,setSelected] = useState<string|null>(null)
  const [routeExpanded,setRouteExpanded] = useState(false)
  const [draft,setDraft] = useState('')
  const [practice,setPractice] = useState<string[]>(['','',''])
  const [supportTab,setSupportTab] = useState<'criteria'|'tutor'>('criteria')
  const [assistance,setAssistance] = useState<Attempt['assistance']>('unknown')
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const [lessonState,setLessonState] = useState<{status:'idle'|'loading'|'error';error?:string}>({status:'idle'})
  const [question,setQuestion] = useState('')
  const [pick,setPick] = useState('')
  const lessonRef = useRef<HTMLDivElement|null>(null)
  const autoSkipped = useRef<string|null>(null)
  const alive=useRef(true)
  const attempt=snapshot?.attempts.find(a=>a.id===selected)
  const node=snapshot?.nodes.find(n=>n.id===attempt?.nodeId)
  const materials=snapshot?.materials??[]
  const lesson=node?(snapshot?.lessons?.[node.id]??node.lesson??''):''
  const deepDives=(snapshot?.deepDives??[]).filter(item=>item.nodeId===node?.id)
  const cited=new Set(node?.sourceIds??[])
  const lessonBusy=lessonState.status==='loading'
  const practiceFields=PRACTICE_FIELDS[node?.practiceKind??'mixed']??[]
  const practiceText=practiceFields.map((key,index)=>practice[index]?.trim()?`${t(key)}：\n${practice[index].trim()}`:'').filter(Boolean).join('\n\n')
  const practiceReady=practiceFields.length?Boolean(practice[0]?.trim()&&practice[practiceFields.length-1]?.trim()):Boolean(draft.trim())
  const signal=()=>new AbortController().signal
  async function refresh(prefer?: string) {
    const next=await value(api.studySnapshot(workspaceId,signal()))
    if (!alive.current) return
    setSnapshot(next)
    const compatible = next.attempts.filter(item => next.nodes.some(candidate => candidate.id === item.nodeId))
    setSelected(current => prefer && compatible.some(item => item.id === prefer) ? prefer : current && compatible.some(item => item.id === current) ? current : compatible[0]?.id ?? null)
  }
  async function run(operation:()=>Promise<void>) { setBusy(true);setError('');try {await operation()}catch(e){const message=e instanceof Error?e.message:String(e);if(alive.current)setError(message.includes('DEEPSEEK_API_KEY')||message.includes('WEB_PROVIDER_CREDENTIAL_MISSING')?t('webSearchNotConfigured'):message.includes('LEARNY_RESEARCH_BUDGET')?t('researchBudgetSpent'):message)}finally{if(alive.current)setBusy(false)} }
  async function generateCourse() { await onGenerateCourse(); await refresh() }
  useEffect(()=>{alive.current=true;void run(()=>refresh());return()=>{alive.current=false}},[workspaceId,sessionId])
  // Teaching text is written when a node is first read, not with the route.
  useEffect(()=>{
    if(attempt?.stage!=='reading'||!node||lesson||lessonState.status!=='idle')return
    void loadLesson(false)
  },[attempt?.id,attempt?.stage,node?.id,lesson,lessonState.status])
  // Opening a node starts at its explanation; the prediction is an optional
  // self-check inside that step, never a gate in front of it.
  useEffect(()=>{
    if(attempt?.stage!=='prediction'||autoSkipped.current===attempt.id)return
    autoSkipped.current=attempt.id
    void run(()=>act('skipPrediction',''))
  },[attempt?.id,attempt?.stage])
  useEffect(()=>{
    const key=attempt?`learny.attempt.${attempt.id}.${attempt.stage}`:null
    let saved='';try{saved=key?localStorage.getItem(key)??'':''}catch{}
    let structured: string[]|null=null
    if(saved.startsWith('['))try{const parsed=JSON.parse(saved);if(Array.isArray(parsed))structured=parsed.map(value=>String(value??''))}catch{}
    setPractice(['','',''].map((_,index)=>structured?.[index]??''))
    setDraft(structured?'':saved|| (attempt?.stage==='explanation'?attempt.explanation:''));setAssistance(attempt?.assistance??'unknown')
    setLessonState({status:'idle'});setPick('')
  },[selected,attempt?.stage])
  function edit(text:string){setDraft(text);if(attempt)try{localStorage.setItem(`learny.attempt.${attempt.id}.${attempt.stage}`,text)}catch{}}
  function editPractice(index:number,text:string){const next=practice.map((value,at)=>at===index?text:value);setPractice(next);if(attempt)try{localStorage.setItem(`learny.attempt.${attempt.id}.${attempt.stage}`,JSON.stringify(next))}catch{}}
  /** Ask for this node's teaching text, which is written the first time it is opened. */
  async function loadLesson(rewrite:boolean){
    if(!node)return
    setLessonState({status:'loading'})
    try{await value(api.nodeLesson(workspaceId,node.id,sessionId,rewrite,signal()));await refresh();setLessonState({status:'idle'})}
    catch(e){setLessonState({status:'error',error:e instanceof Error?e.message:String(e)})}
  }
  async function askFollowUp(text:string,mode:'panel'|'chat'='chat'){
    const value_=text.trim()
    if(!node||!value_)return
    await run(async()=>{await value(api.deepen({workspaceId,nodeId:node.id,question:value_,sessionId,mode},signal()));if(value_===question.trim())setQuestion('');await refresh()})
  }
  /** Selection inside the lesson is the "this part" the learner wants explained. */
  function capturePick(){
    const selection=typeof window==='undefined'?null:window.getSelection()
    const text=selection?.toString().trim()??''
    setPick(text&&selection?.anchorNode&&lessonRef.current?.contains(selection.anchorNode)?text.slice(0,600):'')
  }
  /** A citation jumps to its source row; expand that row so the link is visible. */
  function openCited(event:MouseEvent<HTMLDivElement>){
    const anchor=(event.target as HTMLElement).closest('a[href^="#learny-source-"]')
    if(!anchor)return
    const target=document.getElementById(anchor.getAttribute('href')!.slice(1))
    if(target instanceof HTMLDetailsElement)target.open=true
  }
  async function act(action:'prediction'|'skipPrediction'|'reading'|'hint'|'startPractice'|'practice'|'explanation',text:string){
    if(!attempt)return
    const next=await value(api.attemptAction({workspaceId,attemptId:attempt.id,expectedRevision:attempt.revision,action,text},signal()))
    if(action!=='hint'&&action!=='reading')try{localStorage.removeItem(`learny.attempt.${attempt.id}.${attempt.stage}`)}catch{}
    await refresh(next.id)
  }
  const supportButtons = useRef<(HTMLButtonElement | null)[]>([])
  function moveSupport(event: KeyboardEvent<HTMLButtonElement>) {
    const current = supportTab === 'criteria' ? 0 : 1
    const target = event.key === 'ArrowLeft' ? (current + 1) % 2 : event.key === 'ArrowRight' ? (current + 1) % 2 : event.key === 'Home' ? 0 : event.key === 'End' ? 1 : -1
    if (target < 0) return
    event.preventDefault()
    setSupportTab(target === 0 ? 'criteria' : 'tutor')
    supportButtons.current[target]?.focus()
  }
  const supportId = useId()
  const routeId = useId()
  // Prediction is optional: the bar only carries it while it is the current step
  // or the learner actually wrote one.
  const stages: readonly Stage[] = attempt?.stage === 'prediction' || attempt?.prediction
    ? ['prediction', 'reading', 'practice', 'explanation', 'submitted']
    : ['reading', 'practice', 'explanation', 'submitted']
  const stageIndex = stages.indexOf(attempt?.stage ?? 'prediction')
  const stageIntro = t(attempt?.stage==='reading'?'readingIntro':attempt?.stage==='practice'?'practiceIntro':attempt?.stage==='explanation'?'explanationIntro':attempt?.stage==='submitted'?'submittedIntro':'predictionIntro')
  return <section className="study" aria-label={t('study')}>
    <div className="task-head">
      {(node||snapshot?.course)&&<div className="task-head__title">
        {node&&<span className="task-course">{snapshot?.course?.title??''}</span>}
        <h2>{node?.title??snapshot?.course?.title??''}</h2>
      </div>}
      <div className="task-head__actions">
        {snapshot?.course ? <button className="route-toggle" aria-expanded={!attempt||routeExpanded} aria-controls={routeId} disabled={busy} onClick={()=>setRouteExpanded(!routeExpanded)}>
          {t('learningRoute')}<span className="count">{snapshot.nodes.length}</span><span className="route-chevron" aria-hidden="true">⌄</span>
        </button> : snapshot ? <span className="course-status">{t('courseNotReady')}</span> : null}
        {snapshot?.courseOrigin === 'legacy' && <button className="quiet route-migrate" disabled={busy} onClick={()=>{void run(generateCourse)}}>{t('replaceLegacyCourse')}</button>}
        {node&&<button className="quiet" disabled={busy} onClick={()=>{void run(()=>onNote(`${node.title} · ${t('taskNote')}`))}}><Icon name="note" />{t('taskNote')}</button>}
        <button className="quiet" disabled={busy} onClick={()=>{void run(()=>refresh())}}><Icon name="refresh" />{t('refresh')}</button>
      </div>
    </div>
    {snapshot?.course ? <div id={routeId} className="course-outline" hidden={!!attempt&&!routeExpanded}>
      <p className="muted">{snapshot.course.intro}</p>
      <div className="node-map" aria-label={t('learningRoute')}>{snapshot?.nodes.map(n=>{
        const attempts=snapshot.attempts.filter(a=>a.nodeId===n.id)
        const result=attempts.find(a=>a.evaluation)?.evaluation?.outcome
        const current=attempts.find(a=>a.stage!=='submitted')
        return <button className={node?.id===n.id?'active':''} aria-pressed={node?.id===n.id} key={n.id} disabled={busy} onClick={()=>{void run(async()=>{const a=await value(api.startAttempt(workspaceId,n.id,signal()));await refresh(a.id);setRouteExpanded(false)})}}>
          <span className="node-info"><strong>{n.title}</strong>{n.prerequisite&&<small>{t('recommendedPrerequisite',{title:snapshot.nodes.find(item=>item.id===n.prerequisite)?.title??''})}</small>}</span>
          <span className="node-state">{current?t(current.stage):result?t(result):t('notStarted')}</span>
          <span className="node-selected" aria-hidden="true">{node?.id===n.id&&<Icon name="check" />}</span>
        </button>
      })}</div>
    </div> : snapshot && <div className="course-empty" role="status"><div><h3>{t('courseNotReady')}</h3><p className="muted">{t('generateCourseIntro')}</p></div><button className="primary" disabled={busy} onClick={()=>{void run(generateCourse)}}>{busy?t('generatingCourse'):t('generateCourse')}</button></div>}
    <div className="status-line" aria-live="polite">
      {error&&<span className="status-error" role="alert">{error}</span>}
      {!error&&busy&&<span>{t('working')}</span>}
    </div>
    {attempt&&node?<article className="task">
      <div className="progress">
        <ol className="progress-track" aria-label={t('taskProgress')}>{stages.map((stage,i)=><li key={stage} aria-current={attempt.stage===stage?'step':undefined} className={attempt.stage===stage?'cur':i<stageIndex?'done':''}><span className="sr-only">{t(stage)}</span></li>)}</ol>
        <p className="progress-label"><strong>{t(attempt.stage)} · {stageIndex+1} / {stages.length}</strong><span>{stageIntro}</span></p>
      </div>
      {attempt.retry&&<p className="notice">{t('transfer')}</p>}
      <div className="task-grid"><div className="task-main">
        {attempt.stage==='prediction'&&<>
          {node.briefing&&<div className="briefing"><span className="section-label">{t('nodeBriefing')}</span><p>{node.briefing}</p>{node.sourceIds.length>0&&<p className="muted">{t('nodeMaterials',{count:node.sourceIds.length})}</p>}</div>}
          <div className="prompt"><p>{attempt.retry?node.retryPrediction:node.prediction}</p></div><label>{t('yourPrediction')}<textarea rows={7} value={draft} placeholder={t('predictionPlaceholder')} disabled={busy} onChange={e=>edit(e.target.value)}/></label><div className="task-actions"><button className="primary" disabled={busy||!draft.trim()} onClick={()=>{void run(()=>act('prediction',draft))}}>{t('savePrediction')}</button><button disabled={busy} onClick={()=>{void run(()=>act('skipPrediction',''))}}>{t('skipPrediction')}</button></div></>}
        {attempt.stage==='reading'&&<><p>{t('readingGuide')}</p>
        {!attempt.prediction&&<details className="predict-box"><summary>{t('predictFirst')}</summary><p className="muted">{attempt.retry?node.retryPrediction:node.prediction}</p>
          <label>{t('yourPrediction')}<textarea rows={4} value={draft} placeholder={t('predictionPlaceholder')} disabled={busy} onChange={e=>edit(e.target.value)}/></label>
          <div className="task-actions"><button disabled={busy||!draft.trim()} onClick={()=>{void run(()=>act('prediction',draft))}}>{t('savePrediction')}</button></div></details>}
        {lesson?<div className="lesson" ref={lessonRef} onMouseUp={capturePick} onClick={openCited}><span className="section-label">{t('lessonTitle')}</span><div className="prose"><Markdown remarkPlugins={[remarkGfm]}>{citeLinks(lesson,cited)}</Markdown></div>
          <div className="row between lesson-foot"><small className="muted">{t('lessonOnDemand')}</small><button className="quiet" disabled={busy||lessonBusy} onClick={()=>{void loadLesson(true)}}><Icon name="refresh" />{t('lessonRewrite')}</button></div></div>
          :<div className="lesson lesson-empty" role="status">{lessonState.status==='error'?<><p className="status-error">{t('lessonFailed',{message:lessonState.error??''})}</p><button disabled={busy} onClick={()=>{void loadLesson(false)}}>{t('lessonRetry')}</button></>
            :<><p className="muted">{t('lessonLoading')}</p>{!lessonBusy&&<button disabled={busy} onClick={()=>{void loadLesson(false)}}>{t('lessonRetry')}</button>}</>}</div>}
        {!!pick&&<div className="pick-bar"><span>{t('selectionHint',{count:pick.length})}</span><button className="quiet" disabled={busy} onClick={()=>{void askFollowUp(t('selectionAsk',{text:pick}));setPick('')}}>{t('deepenSelection')}</button><button className="quiet" disabled={busy} onClick={()=>setPick('')}>{t('deepenClear')}</button></div>}
        {!!node.keyPoints?.length&&<div className="key-points"><span className="section-label">{t('keyPoints')}</span><ol>{node.keyPoints.map(point=><li key={point.text}><p>{point.text}</p><small>{materials.find(source=>source.id===point.sourceId)?.title??point.sourceId}</small></li>)}</ol></div>}
        <div className="deepen"><span className="section-label">{t('deepenTitle')}</span><p className="muted">{t('deepenIntro')}</p>
          <label>{t('deepenLabel')}<textarea rows={2} value={question} placeholder={t('deepenPlaceholder')} disabled={busy} onChange={e=>setQuestion(e.target.value)}/></label>
          <div className="task-actions"><button className="primary" disabled={busy||!question.trim()} onClick={()=>{void askFollowUp(question,'chat')}}>{t('deepenInChat')}</button><button disabled={busy||!question.trim()} onClick={()=>{void askFollowUp(question,'panel')}}>{t('deepenHere')}</button></div>
          {deepDives.map(dive=><details key={dive.id} className="dive" open><summary>{dive.question}</summary>{dive.answer.trim()?<div className="prose"><Markdown remarkPlugins={[remarkGfm]}>{citeLinks(dive.answer,cited)}</Markdown></div>:<p className="muted">{t('deepenAnsweredInChat')}</p>}</details>)}</div>
        {!!node.sourceIds.length&&<><p className="muted originals-hint">{t('sourceOriginalHint')}</p>
        {node.sourceIds.map(id=>{
          const source=materials.find(s=>s.id===id)
          const read=attempt.readingIds.includes(id)
          return <details key={id} id={`learny-source-${id}`} className="source"><summary><span>{source?.title??id}</span><span className={`source-state ${read?'is-read':''}`}>{read?t('readRecorded'):t('toRead')}</span></summary><div className="source-content">
            {source&&<a href={source.url} target="_blank" rel="noreferrer" onClick={()=>{if(!read)void run(()=>act('reading',id))}}>{source.path}<Icon name="arrow" /></a>}
            <div className="row between source-footer">{source&&<small title={source.sha256}>{t('sourceVersion',{version:source.sha256.slice(0,12)})}</small>}{!read&&<button disabled={busy} onClick={()=>{void run(()=>act('reading',id))}}>{t('openMaterial')}<Icon name="check" /></button>}</div></div></details>
        })}</>}<div className="task-actions"><span className="muted">{t('readingProgress',{read:node.sourceIds.filter(id=>attempt.readingIds.includes(id)).length,total:node.sourceIds.length})}</span><button className="primary" disabled={busy||!lesson} onClick={()=>{void run(()=>act('startPractice',''))}}>{t('beginPractice')}</button></div></>}
        {attempt.stage==='practice'&&<><div className="prompt"><p>{attempt.retry?node.retryPractice:node.practice}</p></div>
          {practiceFields.length?<div className="practice-fields">{practiceFields.map((key,index)=><label key={key}>{t(key)}<textarea rows={index===0?4:3} disabled={busy} value={practice[index]??''} onChange={e=>editPractice(index,e.target.value)}/></label>)}</div>
            :<label>{t('practiceEvidence')}<textarea rows={9} placeholder={t('practicePlaceholder')} disabled={busy} value={draft} onChange={e=>edit(e.target.value)}/></label>}
          <div className="task-actions"><span className="muted">{t('practiceRecordHint')}</span><button className="primary" disabled={busy||!practiceReady} onClick={()=>{void run(()=>act('practice',practiceFields.length?practiceText:draft))}}>{t('savePractice')}</button></div></>}
        {attempt.stage==='explanation'&&<><details className="record"><summary>{t('originalPractice')}</summary><pre>{attempt.evidence}</pre></details><div className="prompt"><p>{node.explanation}</p></div><label>{t('yourExplanation')}<textarea rows={9} placeholder={t('explanationPlaceholder')} value={draft} disabled={busy} onChange={e=>edit(e.target.value)}/></label><label>{t('assistance')}<select value={assistance} disabled={busy} onChange={e=>setAssistance(e.target.value as Attempt['assistance'])}><option value="unknown">{t('helpUnknown')}</option><option value="independent">{t('helpIndependent')}</option><option value="helped">{t('helped')}</option></select></label><div className="task-actions"><button className="primary" disabled={busy||!draft.trim()} onClick={()=>{void run(async()=>{
          const saved=await value(api.attemptAction({workspaceId,attemptId:attempt.id,expectedRevision:attempt.revision,action:'explanation',text:draft},signal()))
          await value(api.submitAttempt({workspaceId,attemptId:attempt.id,expectedRevision:saved.revision,sessionId,assistance},signal()));await refresh(attempt.id)
        })}}>{t('submitEvaluate')}</button></div></>}
        {attempt.stage==='submitted'&&<>
          {attempt.evaluation?<><div className={`evaluation-summary ${attempt.evaluation.outcome}`}><span className="section-label">{t('evaluationResult')}</span><h3 className="outcome">{t(attempt.evaluation.outcome)}</h3><p>{attempt.evaluation.summary}</p></div>{attempt.evaluation.criteria.map(c=><div className="criterion" key={c.id}><div className="row between"><strong>{node.criteria.find(item=>item.id===c.id)?.description}</strong><span className={`criterion-state ${c.status}`}>{t(c.status)}</span></div><p>{c.reason}</p>{c.quotes.map((q,i)=><blockquote key={i}>{q}</blockquote>)}<div className="muted">{t('sources')}: {c.sourceIds.join(', ')}</div>{c.status!=='met'&&<p className="notice">{t('remediation')}: {c.remediation}</p>}</div>)}</>:<div className="notice" role="status">{attempt.error??t('evaluationPending')}<button disabled={busy} onClick={()=>{void run(async()=>{await value(api.retryEvaluation(workspaceId,attempt.id,sessionId,signal()));await refresh(attempt.id)})}}>{t('retryEvaluation')}</button></div>}
          <details className="record"><summary>{t('originalSubmission')}</summary><h3>{t('practice')}</h3><pre>{attempt.evidence}</pre><h3>{t('explanation')}</h3><p className="preserve">{attempt.explanation}</p><p>{t('assistance')}: {t(attempt.assistance==='independent'?'helpIndependent':attempt.assistance==='helped'?'helped':'helpUnknown')}</p></details>
          <div className="task-actions"><button className="primary" disabled={busy||attempt.modelStatus==='pending'} onClick={()=>{void run(async()=>{const a=await value(api.startAttempt(workspaceId,node.id,signal()));await refresh(a.id)})}}>{t('newAttempt')}</button></div>
        </>}
      </div><aside className="task-support" aria-label={t('learningSupport')}>
        <nav className="support-tabs" role="tablist" aria-label={t('learningSupport')}>
          <button ref={element=>{supportButtons.current[0]=element}} id={`${supportId}-criteria-tab`} role="tab" aria-controls={`${supportId}-criteria`} tabIndex={supportTab==='criteria'?0:-1} aria-selected={supportTab==='criteria'} onKeyDown={moveSupport} onClick={()=>setSupportTab('criteria')}>{t('criteria')}</button>
          <button ref={element=>{supportButtons.current[1]=element}} id={`${supportId}-tutor-tab`} role="tab" aria-controls={`${supportId}-tutor`} tabIndex={supportTab==='tutor'?0:-1} aria-selected={supportTab==='tutor'} onKeyDown={moveSupport} onClick={()=>setSupportTab('tutor')}>{t('tutorTitle')}</button>
        </nav>
        <div className="support-content" id={`${supportId}-criteria`} role="tabpanel" tabIndex={0} aria-labelledby={`${supportId}-criteria-tab`} hidden={supportTab!=='criteria'}>
          <div className="support-section"><p className="muted">{t('criteriaIntro')}</p><ul className="criteria-list">{node.criteria.map((c,i)=><li key={c.id}><span>{i+1}</span><p>{c.description}</p></li>)}</ul></div>
          {attempt.stage!=='prediction'&&<details className="record"><summary>{t('originalPrediction')}</summary><p className="preserve">{attempt.prediction}</p></details>}
          {attempt.stage!=='prediction'&&attempt.stage!=='submitted'&&<div className="support-section hint-section"><h3>{t('needHelp')}</h3><p className="muted">{t('hintDisclosure')}</p><button disabled={busy||attempt.hints.length>=2} onClick={()=>{void run(()=>act('hint',''))}}>{t('requestHint')}</button></div>}
          {!!attempt.hints.length&&<div className="notice"><strong>{t('usedHints')}</strong><ol>{attempt.hints.map(h=><li key={h}>{h}</li>)}</ol></div>}
        </div>
        <div className="support-content" id={`${supportId}-tutor`} role="tabpanel" tabIndex={0} aria-labelledby={`${supportId}-tutor-tab`} hidden={supportTab!=='tutor'}>
          <TutorPanel key={attempt.id} attempt={attempt} sessionId={sessionId} messages={snapshot?.tutorMessages.filter(item=>item.attemptId===attempt.id)??[]} api={api} t={t} onRefresh={()=>refresh()} />
        </div>
      </aside></div>
    </article>:snapshot?.course?<div className="empty route-empty"><span className="empty-icon"><Icon name="book" /></span><h3>{t('startLearning')}</h3><p>{t('chooseNode')}</p></div>:null}
    {!!snapshot?.attempts.length&&<AttemptHistory snapshot={snapshot} selected={selected} disabled={busy} t={t} onSelect={setSelected} />}
  </section>
}
