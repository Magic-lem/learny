import { useEffect, useRef, useState } from 'react'
import type { ClientRemote } from '@deepseek-ai/dsh-api-gateway/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { NoteDocument, NoteRevision, RevisionMode } from '../core/types.ts'
import { value } from './study.tsx'
import type {} from './locales.ts'
type Props={note:NoteDocument;dirty:boolean;sessionId:string;api:ClientRemote['learny'];t:PropsLocale<'learny'>['t'];onChanged:()=>Promise<void>}
export function NoteOrganizer({note,dirty,sessionId,api,t,onChanged}:Props){
  const [mode,setMode]=useState<RevisionMode>('format'),[instruction,setInstruction]=useState(''),[rows,setRows]=useState<NoteRevision[]>([]),[selected,setSelected]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const alive=useRef(true), revision=rows.find(r=>r.id===selected)
  const signal=()=>new AbortController().signal
  async function refresh(id?:string){const next=await value(api.noteRevisions(note.workspaceId,note.id,signal()));if(alive.current){setRows(next);setSelected(current=>id??current??next[0]?.id??null)}}
  async function run(operation:()=>Promise<void>){setBusy(true);setError('');try{await operation()}catch(e){if(alive.current)setError(e instanceof Error?e.message:String(e))}finally{if(alive.current)setBusy(false)}}
  useEffect(()=>{alive.current=true;void run(()=>refresh());return()=>{alive.current=false}},[note.id])
  return <details className="organizer"><summary>{t('organize')}</summary>
    <p className="muted">{t('organizeIntro')}</p><label>{t('organizeMode')}<select disabled={busy} value={mode} onChange={e=>setMode(e.target.value as RevisionMode)}><option value="format">{t('format')}</option><option value="polish">{t('polish')}</option><option value="supplement">{t('supplement')}</option></select></label>
    <label>{t('organizeInstruction')}<textarea rows={3} maxLength={5000} disabled={busy} value={instruction} onChange={e=>setInstruction(e.target.value)}/></label>
    {dirty&&<p className="notice">{t('saveFirst')}</p>}
    <div className="row"><button className="primary" disabled={busy||dirty||!instruction.trim()} onClick={()=>{void run(async()=>{const r=await value(api.organizeNote({id:crypto.randomUUID(),sessionId,workspaceId:note.workspaceId,noteId:note.id,expectedVersion:note.version,mode,instruction},signal()));await refresh(r.id)})}}>{busy?t('working'):t('generateRevision')}</button><button disabled={busy} onClick={()=>{void run(()=>refresh())}}>{t('refresh')}</button></div>
    {error&&<div className="notice" role="alert">{error}</div>}
    {!!rows.length&&<label>{t('revisionHistory')}<select value={selected??''} onChange={e=>setSelected(e.target.value)}>{rows.map(r=><option key={r.id} value={r.id}>{t(r.mode)} · {t(r.status==='applied'?'revisionApplied':r.status==='restored'?'revisionRestored':r.status==='ready'?'revisionReady':'revisionPending')} · {new Date(r.createdAt).toLocaleString()}</option>)}</select></label>}
    {revision&&<>{revision.error&&<p className="notice" role="status">{revision.error}</p>}<p>{revision.summary}</p>
      {revision.result!==null?<><div className="comparison"><section><strong>{t('original')}</strong><pre>{revision.original}</pre></section><section><strong>{t('organized')}</strong><pre>{revision.result}</pre></section></div>
        <div className="row"><button className="primary" disabled={busy||dirty||revision.status!=='ready'} onClick={()=>{void run(async()=>{await value(api.applyRevision(note.workspaceId,revision.id,false,signal()));await onChanged();await refresh(revision.id)})}}>{t('applyRevision')}</button><button disabled={busy||dirty||revision.status!=='applied'} onClick={()=>{void run(async()=>{await value(api.applyRevision(note.workspaceId,revision.id,true,signal()));await onChanged();await refresh(revision.id)})}}>{t('restoreOriginal')}</button></div>
      </>:<button disabled={busy} onClick={()=>{void run(async()=>{await value(api.retryOrganization(note.workspaceId,revision.id,signal()));await refresh(revision.id)})}}>{t('retryOrganization')}</button>}
    </>}
  </details>
}
