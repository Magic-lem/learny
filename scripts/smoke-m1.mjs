import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
const pluginVersion=JSON.parse(await readFile(new URL('../packages/learny/package.json',import.meta.url),'utf8')).version
const hostVersion=JSON.parse(await readFile(new URL('../node_modules/@deepseek-ai/dsh/package.json',import.meta.url),'utf8')).version
const base=process.env.LEARNY_SMOKE_URL,token=process.env.LEARNY_SMOKE_TOKEN,reportPath=process.env.LEARNY_SMOKE_REPORT
if(!base||!token||!reportPath)throw Error('Set LEARNY_SMOKE_URL, LEARNY_SMOKE_TOKEN and LEARNY_SMOKE_REPORT')
const auth=await fetch(`${base}/?token=${encodeURIComponent(token)}`,{redirect:'manual'}),cookie=auth.headers.getSetCookie().map(row=>row.split(';')[0]).join('; ')
if(!cookie)throw Error('No authentication cookie')
async function call(method,args){const response=await fetch(`${base}/api/${method}`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base,Cookie:cookie},body:JSON.stringify({type:'client-request',rpcId:randomUUID(),method,payload:{args}})});assert.equal(response.status,200);const result=(await response.json()).result;assert.equal(result.ok,true,JSON.stringify(result.error));return result.value}
const hash=text=>createHash('sha256').update(text).digest('hex')
let report
if(process.argv.includes('--resume')){
 report=JSON.parse(await readFile(reportPath,'utf8'))
 report.dshWorkspaceId=(await call('workspace/create',{request:{path:process.cwd()}})).workspace.id
 for(const sessionId of [report.sessionId,report.secondSessionId])await call('session/create',{request:{sessionId,workspaceId:report.dshWorkspaceId}})
 const state=await call('learny/studySnapshot',{workspaceId:report.workspaceId})
 for(const row of report.attempts){const a=state.attempts.find(a=>a.id===row.id);assert.deepEqual(a.evaluation,row.evaluation);assert.equal(hash(a.prediction+a.evidence+a.explanation),row.submissionHash)}
 const revisions=await call('learny/noteRevisions',{workspaceId:report.workspaceId,noteId:report.noteId})
 for(const row of report.revisions)assert.ok(revisions.some(r=>r.id===row.id&&r.status===row.status&&hash(r.original)===report.originalHash))
 report.restartVerifiedAt=new Date().toISOString()
}else{
 const dshWorkspaceId=(await call('workspace/create',{request:{path:process.cwd()}})).workspace.id
 const sessionId=`session-${randomUUID()}`;await call('session/create',{request:{sessionId,workspaceId:dshWorkspaceId}});await call('session/rename',{request:{sessionId,title:'Learny · 学习工具调用'}})
 const workspace=await call('learny/createWorkspace',{request:{name:'dsh 工具调用学习',goal:'先判断，再追踪工具投影与执行，留下自己的解释。',kind:'topic',materialPath:''}});const workspaceId=workspace.id
 await call('learny/bindWorkspace',{sessionId,workspaceId});let a=await call('learny/startAttempt',{workspaceId,nodeId:'registration'})
 async function act(action,text=''){a=await call('learny/attemptAction',{request:{workspaceId,attemptId:a.id,expectedRevision:a.revision,action,text}})}
 await act('prediction','我认为 execute 函数留在宿主。模型收到工具名称、描述和参数 schema，用它提出调用。')
 await act('reading','schemas');await act('startPractice');await act('hint')
 await act('practice','这是我构造的源码投影追踪，不是实际执行日志。输入工具：name="learny_echo", description="Echo a message", parameters={"type":"object","properties":{"message":{"type":"string"}},"required":["message"]}, execute 为本地回调，timeoutMs=5000，deferLoading=true。沿 tools.schemas(scope) → schemaOf(definition,true)，解构 name,description,parameters,deferLoading，返回 JSON {"name":"learny_echo","description":"Echo a message","parameters":{"type":"object","properties":{"message":{"type":"string"}},"required":["message"]},"deferLoading":true}。返回值没有 execute 和 timeoutMs。')
 await act('explanation','schemaOf 只投影 name、description、parameters 和可选的 deferLoading；execute 回调留在工具定义和宿主注册表，timeoutMs 是宿主的超时配置。模型选择 learny_echo 并生成 JSON 参数，宿主负责找到工具、校验和执行函数。一个可能误判是把参数 schema 当作执行代码；模型只能凭 schema 表达请求，它本身无法调用这个进程内回调。上述输入到输出来自我的源码追踪和假设工具定义，我使用过 Learny 提示，因此这次应算辅助完成。')
 a=await call('learny/submitAttempt',{request:{workspaceId,attemptId:a.id,expectedRevision:a.revision,sessionId,assistance:'helped'}})
 assert.equal(a.modelStatus,'complete',a.error);assert.equal(a.evaluation.outcome,'assisted',JSON.stringify(a.evaluation));console.log('Real model: assisted evaluation validated')
 const attempts=[{id:a.id,evaluation:a.evaluation,submissionHash:hash(a.prediction+a.evidence+a.explanation)}]
 // Deliberately insufficient evidence must produce a finite remedial task.
 a=await call('learny/startAttempt',{workspaceId,nodeId:'registration'});await act('prediction','我猜所有字段都会发给模型，包括 execute 和 timeoutMs。');await act('reading','schemas');await act('startPractice');await act('practice','我看了源码但没有构造输入输出，也没有追踪 schemaOf。');await act('explanation','我目前不清楚哪些字段会被模型看到，也无法解释投影。')
 a=await call('learny/submitAttempt',{request:{workspaceId,attemptId:a.id,expectedRevision:a.revision,sessionId,assistance:'unknown'}});assert.equal(a.modelStatus,'complete',a.error);assert.equal(a.evaluation.outcome,'remedial');assert.ok(a.evaluation.criteria.some(c=>c.status!=='met'&&c.remediation.trim()));console.log('Real model: insufficient evidence produces remediation')
 attempts.push({id:a.id,evaluation:a.evaluation,submissionHash:hash(a.prediction+a.evidence+a.explanation)})
 let note=await call('learny/createNote',{workspaceId,title:'我的工具调用笔记'})
 const original='我的判断\n\n我不确定工具在什么时候真正执行。\n\nschemaOf 把工具的名字、描述和参数投影给模型，执行函数留在宿主。\n\n下一步我要追踪一次调用。'
 note=await call('learny/saveNote',{request:{workspaceId,noteId:note.id,title:note.title,content:original,expectedVersion:note.version}})
 const revisions=[]
 for(const [mode,instruction]of[
  ['format','只把“我的判断”设为标题，保留所有现有句子、标点和顺序，不新增标题词，不加粗斜体。'],
  ['polish','保留“我不确定工具在什么时候真正执行。”这句原文。润色其余表述使其通顺，但不增加事实或示例。'],
  ['supplement','保留我的原文，补充一个基于 schemas 来源的工具 schema 投影示例，标注 AI 示例和来源，并把需要自己验证的事项写清楚。'],
 ]){
  const r=await call('learny/organizeNote',{request:{id:randomUUID(),sessionId,workspaceId,noteId:note.id,expectedVersion:note.version,mode,instruction}})
  assert.equal(r.status,'ready',r.error);assert.equal(r.original,original);if(mode==='supplement'){assert.ok(r.result.startsWith(original));assert.ok(r.sourceIds.length)}
  const applied=await call('learny/applyRevision',{workspaceId,revisionId:r.id,restore:false});assert.equal(applied.status,'applied')
  const restored=await call('learny/applyRevision',{workspaceId,revisionId:r.id,restore:true});assert.equal(restored.status,'restored')
  note=await call('learny/readNote',{workspaceId,noteId:note.id});assert.equal(note.content,original)
  revisions.push({id:r.id,mode,status:'restored'});console.log(`Real model: ${mode} organized, applied and restored`)
 }
 assert.equal((await call('learny/searchNotes',{workspaceId,query:'执行函数'})).length,1)
 const secondSessionId=`session-${randomUUID()}`;await call('session/create',{request:{sessionId:secondSessionId,workspaceId:dshWorkspaceId}});await call('session/rename',{request:{sessionId:secondSessionId,title:'Learny · 继续同一空间'}});await call('learny/bindWorkspace',{sessionId:secondSessionId,workspaceId})
 report={base,sessionId,secondSessionId,dshWorkspaceId,workspaceId,noteId:note.id,originalHash:hash(original),attempts,revisions,pluginVersion,hostVersion,verifiedAt:new Date().toISOString()}
}
for(const sessionId of[report.sessionId,report.secondSessionId])assert.equal((await call('learny/snapshot',{sessionId})).workspaceId,report.workspaceId)
const note=await call('learny/readNote',{workspaceId:report.workspaceId,noteId:report.noteId});assert.equal(hash(note.content),report.originalHash)
await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');console.log(process.argv.includes('--resume')?'M1 Host restart and immutable records verified':'M1 Host real-model smoke passed')
