import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { runtime } from './runtime-helper.mjs'

/** Enough prose that HTML extraction passes its "too little text" guard. */
const article = (text) => `<article><h1>标题</h1><p>${text}</p><p>${'概念、工作机制、常见误区和验证方式都在原文中有对应段落。'.repeat(6)}</p></article>`
const lesson = (name) => `这一节讲清楚 ${name} 要解决的问题、关键概念和工作机制，以及它与本次实践的关系。${'讲解用中文写成，学习者不需要读英文原文。'.repeat(3)}`

function model() {
  return { calls:0, next:null,
    async generate(request) {
      this.calls++
      if (this.next instanceof Error) throw this.next
      if (this.next) return JSON.stringify(this.next)
      const p=JSON.parse(request.payload)
      if(request.kind==='evaluation')return JSON.stringify({criteria:p.task.criteria.map(c=>({id:c.id,status:'met',quotes:[p.submission.evidence.slice(0,20)],sourceIds:p.task.sourceIds.slice(0,1),reason:'Explicit trace and explanation.',remediation:''})),summary:'Criteria evidenced.'})
      if(request.kind==='tutor')return '先回到 schemas 的 schemaOf：对照它解构和返回的字段，写出 timeoutMs 是否存在于投影结果。'
      if(request.kind==='followup')return JSON.stringify({answer:`先回答你的问题：${String(p.question??'').slice(0,40)}。再给一个可以自己验证的小例子，最后说明还需要确认什么。[web-1]`})
      return JSON.stringify({markdown:p.mode==='supplement'?'AI 示例：投影结果包含 name。[source:schemas]':p.mode==='format'?`## ${p.original}`:`${p.original}\n\n自己的观察。`,summary:'Organized per instruction.',sourceIds:p.mode==='supplement'?['schemas']:[]})
    },async close(){}
  }
}
async function setup(t){const dir=await mkdtemp(join(tmpdir(),'learny-study-')),m=model(),host=await runtime(dir,m);const space=await host.service.createWorkspace({name:'Test',goal:'Tools',kind:'topic',materialPath:''});await host.service.bindWorkspace('chat-one',space.id);t.after(async()=>{await host.close();await rm(dir,{recursive:true,force:true})});return{...host,space,m,dir}}
async function action(study,a,kind,text=''){return study.act({workspaceId:a.workspaceId,attemptId:a.id,expectedRevision:a.revision,action:kind,text})}
async function answered(study,id,hint=false){let a=await study.start(id,'registration');a=await action(study,a,'prediction','I predict execute stays local.');a=await action(study,a,'reading','schemas');a=await action(study,a,'startPractice');if(hint)a=await action(study,a,'hint');a=await action(study,a,'practice','My trace: input execute and timeoutMs are excluded. JSON {name:"echo",description:"echo",parameters:{}}.');a=await action(study,a,'explanation','schemaOf projects fields. The host executes functions; the model selects names.');return a}
const submit=(study,a)=>study.submit({workspaceId:a.workspaceId,attemptId:a.id,expectedRevision:a.revision,sessionId:'chat-one',assistance:'independent'},new AbortController().signal)

test('a node is started in the chat and the panel keeps only its record',async t=>{
 const asked=[]
 const chat={async ask(request){asked.push(request);return `req-${asked.length}`},async answer(){return null}}
 const dir=await mkdtemp(join(tmpdir(),'learny-start-node-'));const project=join(dir,'project');await mkdir(project);await writeFile(join(project,'README.md'),'# P\n\nEntry and flow.')
 const host=await runtime(dir,model(),undefined,{chat});t.after(async()=>{await host.close();await rm(dir,{recursive:true,force:true})})
 const space=await host.service.createWorkspace({name:'Kubernetes 基础学习',goal:'理解架构',kind:'project',materialPath:project})
 const course=await host.study.generateCourse(space.id)
 const nodeId=course.nodes[0].id

 const task=await host.study.startNode(space.id,nodeId,'chat-one')
 assert.equal(asked.length,1)
 // 发进原生对话的教学任务带上目标、后续章节边界和可选练习，不生成第二份对话。
 assert.match(asked[0].text,/开始一节/)
 const teaching = JSON.parse(asked[0].text.split('教学任务（目标用于组织讲解，练习是讲授后的可选项，不要求用户先回答）：\n')[1].split('\n\n')[0])
 assert.deepEqual(teaching.outcomes,course.nodes[0].criteria.map(item=>item.description))
 assert.equal(teaching.chapter,1)
 assert.equal(teaching.prerequisite,null)
 assert.equal(teaching.next.title,course.nodes[1].title)
 assert.equal(teaching.optionalPractice,course.nodes[0].practice)
 assert.match(asked[0].text,new RegExp(course.nodes[0].title))
 assert.equal(task.nodeId,nodeId);assert.equal(task.sessionId,'chat-one')

 const again=await host.study.startNode(space.id,nodeId,'chat-one')
 const state=await host.study.snapshot(space.id)
 assert.equal(asked.length,2)
 assert.deepEqual(state.nodeTasks.map(item=>item.requestId),['req-1','req-2'])
 assert.equal(state.nodeTasks.at(-1).id,again.id)
})

test('a chat-answered follow-up still opens after a restart',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'learny-dive-restart-'));const project=join(dir,'project');await mkdir(project);await writeFile(join(project,'README.md'),'# P\n\nEntry and flow.')
 const chat={async ask(){return 'req-restart'},async answer(){return null}}
 let host=await runtime(dir,model(),undefined,{chat})
 const space=await host.service.createWorkspace({name:'P',goal:'g',kind:'project',materialPath:project})
 const course=await host.study.generateCourse(space.id)
 await host.study.deepen({workspaceId:space.id,nodeId:course.nodes[0].id,question:'为什么？',sessionId:'chat-one',mode:'chat'})
 await host.close()
 // 重开同一个数据目录：领域 schema 必须接受刚写入的记录，否则整个插件无法激活。
 host=await runtime(dir,model(),undefined,{chat});t.after(async()=>{await host.close();await rm(dir,{recursive:true,force:true})})
 const state=await host.study.snapshot(space.id)
 assert.equal(state.deepDives.length,1);assert.equal(state.deepDives[0].mode,'chat');assert.equal(state.deepDives[0].answer,'')
})

test('the explanation comes first and a prediction can be written afterwards',async t=>{
 const {study,space}=await setup(t);let a=await study.start(space.id,'registration')
 a=await action(study,a,'skipPrediction','')
 assert.equal(a.stage,'reading')
 a=await action(study,a,'prediction','读完之后补的猜想')
 assert.equal(a.stage,'reading')          // 写猜想不再改变阶段
 assert.equal(a.prediction,'读完之后补的猜想')
})

test('prediction can be skipped and a follow-up can be answered in the chat',async t=>{
 const asked=[]
 const chat={async ask(request){asked.push(request);return 'req-1'},async answer({requestId}){return requestId==='req-1'?'对话里的回答：注意 CRI 与运行时分工。':null}}
 const dir=await mkdtemp(join(tmpdir(),'learny-chat-'));const project=join(dir,'project');await mkdir(project);await writeFile(join(project,'README.md'),'# My project\n\nEntry and data flow.')
 const host=await runtime(dir,model(),undefined,{chat});t.after(async()=>{await host.close();await rm(dir,{recursive:true,force:true})})
 const space=await host.service.createWorkspace({name:'My project',goal:'Understand the entry and data flow',kind:'project',materialPath:project})
 const course=await host.study.generateCourse(space.id)
 const nodeId=course.nodes[0].id

 // 预测是可选的：不想猜可以直接看讲解。
 let attempt=await host.study.start(space.id,nodeId)
 attempt=await host.study.act({workspaceId:space.id,attemptId:attempt.id,expectedRevision:attempt.revision,action:'skipPrediction',text:''})
 assert.equal(attempt.stage,'reading');assert.equal(attempt.prediction,'')

 // 追问默认发到对话里，导师约束随问题一起过去；面板里只记下提问。
 const dive=await host.study.deepen({workspaceId:space.id,nodeId,question:'为什么工具要留在宿主？',sessionId:'chat-one',mode:'chat'})
 assert.equal(dive.mode,'chat');assert.equal(dive.answer,'');assert.equal(asked.length,1)
 assert.match(asked[0].text,/不要代写实践答案/);assert.match(asked[0].text,/只使用上面给出的资料/);assert.match(asked[0].text,/为什么工具要留在宿主？/)
 const first=(await host.study.snapshot(space.id)).deepDives[0]
 assert.equal(first.mode,'chat')
 // 面板刷新时把对话里的回答读回来，节点不再停在"已在对话页提问"。
 assert.match(first.answer,/对话里的回答/)

 // 就地追问仍然走 Learny 自己的受约束导师。
 const local=await host.study.deepen({workspaceId:space.id,nodeId,question:'再解释一次',sessionId:'chat-one',mode:'panel'})
 assert.equal(local.mode,'panel');assert.ok(local.answer.length>0);assert.equal(asked.length,1)
})

test('a node is read through its explanation: opening every source link is not a gate',async t=>{
 const {study,space}=await setup(t);let a=await study.start(space.id,'registration')
 a=await action(study,a,'prediction','A guess')
 // 讲解就是本节材料，来源列表只是可选核对，因此没有记录任何来源也能进入实践。
 a=await action(study,a,'startPractice')
 assert.equal(a.stage,'practice')
})

test('prediction gate, provenance, stale revisions, assistance and immutable submission',async t=>{
 const {study,space,m}=await setup(t);let a=await study.start(space.id,'registration')
 assert.equal((await study.snapshot(space.id)).sources.length,0)
 await assert.rejects(action(study,a,'reading','schemas'))
 await assert.rejects(action(study,a,'hint'))
 const old=a;a=await action(study,a,'prediction','A guess');await assert.rejects(action(study,old,'prediction','stale'))
 a=await action(study,a,'reading','schemas');assert.equal((await study.snapshot(space.id)).sources[0].id,'schemas')
 a=await action(study,a,'startPractice');a=await action(study,a,'hint');a=await action(study,a,'practice','My trace: schemaOf returns name, description, parameters, optional deferLoading.');a=await action(study,a,'explanation','execute stays in host.');a=await submit(study,a)
 assert.equal(a.evaluation.outcome,'assisted');assert.equal(a.hints.length,1)
 await assert.rejects(action(study,a,'explanation','rewritten'))
 const [again,duplicate]=await Promise.all([submit(study,a),submit(study,a)]);assert.equal(again.id,duplicate.id);assert.equal(m.calls,1)
 const retry=await study.start(space.id,'registration');assert.equal(retry.retry,true);assert.equal(retry.hints.length,0)
 assert.equal((await study.snapshot(space.id)).attempts.length,2)
 // Prerequisites advise rather than lock exploration.
 assert.equal((await study.start(space.id,'result')).nodeId,'result')
})

test('tutor keeps a context-aware conversation for the current attempt',async t=>{
 const {study,space,m}=await setup(t);let a=await study.start(space.id,'registration')
 a=await action(study,a,'prediction','I think execute is sent to the model.')
 const reply=await study.tutor({workspaceId:space.id,attemptId:a.id,sessionId:'chat-one',message:'我不确定 timeoutMs 是否属于模型 schema。'},new AbortController().signal)
 assert.equal(reply.role,'assistant');assert.match(reply.content,/schemaOf/);assert.equal(m.calls,1)
 const state=await study.snapshot(space.id);assert.equal(state.tutorMessages.length,2);assert.equal(state.tutorMessages[0].role,'user');assert.equal(state.tutorMessages[0].attemptId,a.id)
 await assert.rejects(study.tutor({workspaceId:space.id,attemptId:a.id,sessionId:'other-chat',message:'越过绑定'},new AbortController().signal))
})

test('model failure preserves submission, retry is single-flight, independent outcome is derived',async t=>{
 const {study,space,m}=await setup(t);let a=await answered(study,space.id);m.next=new Error('provider unavailable');a=await submit(study,a)
 assert.equal(a.modelStatus,'failed');assert.match(a.evidence,/My trace/);assert.equal(a.stage,'submitted')
 m.next=null;const rows=await Promise.all([study.evaluate(space.id,a.id,'chat-one',new AbortController().signal),study.evaluate(space.id,a.id,'chat-one',new AbortController().signal)])
 assert.equal(m.calls,2);assert.equal(rows[0].evaluation.outcome,'independent');assert.equal(rows[1].id,a.id)
})

test('unsupported citations, fabricated quotes and incomplete rubric cannot award a pass; unmet forms remediation',async t=>{
 const {study,space,m}=await setup(t);const a=await answered(study,space.id)
 m.next={criteria:[{id:'projection',status:'met',quotes:['invented'],sourceIds:['missing'],reason:'Unsupported',remediation:''}],summary:'Pass'}
 let result=await submit(study,a);assert.equal(result.modelStatus,'failed');assert.equal(result.evaluation,null)
 m.next={criteria:[{id:'projection',status:'met',quotes:['invented'],sourceIds:['schemas'],reason:'Unsupported',remediation:''},{id:'trace',status:'met',quotes:[a.evidence],sourceIds:['schemas'],reason:'Trace',remediation:''}],summary:'Pass'}
 result=await study.evaluate(space.id,a.id,'chat-one',new AbortController().signal);assert.equal(result.evaluation,null)
 m.next={criteria:['projection','trace'].map(id=>({id,status:'insufficient',quotes:[],sourceIds:['schemas'],reason:'Need observable evidence',remediation:'Write one input and projected JSON, compare execute and timeoutMs.'})),summary:'Finite remediation'}
 result=await study.evaluate(space.id,a.id,'chat-one',new AbortController().signal);assert.equal(result.evaluation.outcome,'remedial');assert.ok(result.evaluation.criteria[0].remediation)
})

test('note organization snapshots, idempotency, apply/restore, conflicts, and full-text search',async t=>{
 const {study,service,space,m}=await setup(t);let note=await service.createNote(space.id,'Notes');note=await service.saveNote({workspaceId:space.id,noteId:note.id,title:note.title,content:'我的理解：执行函数留在宿主。',expectedVersion:note.version})
 const request={id:randomUUID(),sessionId:'chat-one',workspaceId:space.id,noteId:note.id,expectedVersion:note.version,mode:'format',instruction:'把原有内容作为标题，不增删内容'}
 let r=await study.organize(request,new AbortController().signal);assert.equal(r.status,'ready');assert.equal(r.original,note.content)
 await study.organize(request,new AbortController().signal);assert.equal(m.calls,1)
 r=await study.applyRevision(space.id,r.id,false);assert.equal(r.status,'applied');assert.equal((await service.readNote(space.id,note.id)).content,r.result)
 r=await study.applyRevision(space.id,r.id,true);assert.equal(r.status,'restored');assert.equal((await service.readNote(space.id,note.id)).content,note.content)
 assert.equal((await service.searchNotes(space.id,'执行函数')).length,1)
 note=await service.readNote(space.id,note.id);const second=await study.organize({...request,id:randomUUID(),expectedVersion:note.version},new AbortController().signal)
 await service.saveNote({workspaceId:space.id,noteId:note.id,title:note.title,content:'外部的新想法',expectedVersion:note.version})
 await assert.rejects(study.applyRevision(space.id,second.id,false));assert.equal((await service.readNote(space.id,note.id)).content,'外部的新想法');assert.equal((await study.revisions(space.id,note.id)).find(item=>item.id===second.id).result,second.result)
})

test('format cannot add facts/change code, polish preserves uncertainty, supplement keeps original with sources',async t=>{
 const {study,service,space,m}=await setup(t);let note=await service.createNote(space.id,'Uncertainty');note=await service.saveNote({workspaceId:space.id,noteId:note.id,title:note.title,content:'我不确定工具是否并行。\n\n```js\nconst x = "a b";\n```',expectedVersion:note.version})
 const request={id:randomUUID(),sessionId:'chat-one',workspaceId:space.id,noteId:note.id,expectedVersion:note.version,mode:'format',instruction:'仅排版'}
 m.next={markdown:note.content.replace('a b','ab'),summary:'format',sourceIds:[]};let r=await study.organize(request,new AbortController().signal);assert.equal(r.status,'failed')
 m.next={markdown:note.content+'\n新事实：所有工具始终并行。',summary:'format',sourceIds:[]};r=await study.retryOrganization(space.id,r.id,new AbortController().signal);assert.equal(r.status,'failed')
 m.next={markdown:'所有工具都会并行。',summary:'polish',sourceIds:[]};r=await study.organize({...request,id:randomUUID(),mode:'polish'},new AbortController().signal);assert.equal(r.status,'failed')
 m.next=null;r=await study.organize({...request,id:randomUUID(),mode:'supplement',instruction:'补充一个有来源的示例'},new AbortController().signal);assert.equal(r.status,'ready');assert.ok(r.result.startsWith(note.content));assert.match(r.result,/AI 示例/);assert.match(r.result,/补充来源/);assert.deepEqual(r.sourceIds,['schemas'])
})

test('attempts, revisions and bindings survive reopening without rewriting submitted explanation',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'learny-reopen-'));let host=await runtime(dir,model())
 try {
 const space=await host.service.createWorkspace({name:'Durable',goal:'Trace',kind:'topic',materialPath:''});await host.service.bindWorkspace('chat-one',space.id);await host.service.bindWorkspace('chat-two',space.id)
 let a=await answered(host.study,space.id);a=await submit(host.study,a);const note=await host.service.createNote(space.id,'Trace');const saved=await host.service.saveNote({workspaceId:space.id,noteId:note.id,title:note.title,content:'自己的记录',expectedVersion:note.version});const r=await host.study.organize({id:randomUUID(),sessionId:'chat-one',workspaceId:space.id,noteId:note.id,expectedVersion:saved.version,mode:'format',instruction:'只排版'},new AbortController().signal)
 await host.close();host=await runtime(dir,model())
 assert.equal((await host.service.snapshot('chat-two')).workspaceId,space.id);const state=await host.study.snapshot(space.id);assert.equal(state.attempts[0].explanation,a.explanation);assert.deepEqual(state.attempts[0].evaluation,a.evaluation);assert.equal((await host.study.revisions(space.id,note.id))[0].original,r.original)
 } finally {await host.close();await rm(dir,{recursive:true,force:true})}
})

test('abrupt process termination marks model work interrupted and recovers unchanged submissions and originals',async t=>{
 const { fork }=await import('node:child_process');const { once }=await import('node:events');const dir=await mkdtemp(join(tmpdir(),'learny-kill-'))
 const worker=fork(new URL('./interruption-worker.mjs',import.meta.url),[dir],{stdio:['ignore','ignore','pipe','ipc']})
 let host
 t.after(async()=>{worker.kill('SIGKILL');if(host)await host.close();await rm(dir,{recursive:true,force:true})})
 const [pending]=await once(worker,'message');assert.equal(pending.kind,'evaluation');worker.send('notes')
 const [notes]=await once(worker,'message');assert.equal(notes.kind,'notes');const exited=once(worker,'exit');worker.kill('SIGKILL');await exited
 host=await runtime(dir,model());const a=(await host.study.snapshot(pending.workspaceId)).attempts[0];assert.equal(a.modelStatus,'interrupted');assert.match(a.explanation,/host executes/)
 const r=(await host.study.revisions(notes.workspaceId,notes.noteId))[0];assert.equal(r.status,'interrupted');assert.equal(r.original,'自己的原文')
 const retry=await host.study.evaluate(pending.workspaceId,a.id,'chat-one',new AbortController().signal);assert.equal(retry.evaluation.outcome,'independent');assert.equal((await host.study.retryOrganization(notes.workspaceId,r.id,new AbortController().signal)).status,'ready')
})


test('new workspaces do not inherit the dsh course and topic routes require research evidence', async t => {
 const dir=await mkdtemp(join(tmpdir(),'learny-course-'));const project=join(dir,'project');await mkdir(project);await writeFile(join(project,'README.md'),'# My project\n\nEntry and data flow.');
 const host=await runtime(dir,model());t.after(async()=>{await host.close();await rm(dir,{recursive:true,force:true})});
 const space=await host.service.createWorkspace({name:'My project',goal:'Understand the entry and data flow',kind:'project',materialPath:project});await host.service.bindWorkspace('chat-one',space.id);
 let state=await host.study.snapshot(space.id);assert.equal(state.course,null);assert.deepEqual(state.nodes,[]);
 const course=await host.study.generateCourse(space.id);assert.equal(course.title,'My project');assert.equal(course.nodes.length,3);assert.equal(course.sources[0].title,'README.md');
 state=await host.study.snapshot(space.id);assert.equal(state.course?.version,course.version);assert.equal(state.nodes[0].title,'项目结构与入口');
 const second=await host.service.createWorkspace({name:'Another topic',goal:'Learn',kind:'topic',materialPath:''});assert.equal((await host.study.snapshot(second.id)).course,null);
 const legacy=await host.service.createWorkspace({name:'Legacy topic',goal:'Migrate',kind:'topic',materialPath:''});await host.study.start(legacy.id,'registration');assert.equal((await host.study.snapshot(legacy.id)).courseOrigin,'legacy');await assert.rejects(host.study.generateCourse(legacy.id),'web search is required');assert.equal((await host.study.snapshot(legacy.id)).courseOrigin,'legacy');
})

test('topic course generation searches, fetches, and asks the model to cite sources', async t => {
 const calls=[]
 const research={
   async search(request){ calls.push(['search',request]); return {sources:[{url:'https://kubernetes.io/docs/concepts/overview/',title:'Kubernetes overview',snippet:'Kubernetes automates deployment and scaling.'},{url:'https://kubernetes.io/docs/concepts/architecture/',title:'Kubernetes architecture',snippet:'The control plane manages cluster state.'},{url:'https://kubernetes.io/docs/tutorials/',title:'Kubernetes tutorials',snippet:'Hands-on tutorials.'}]} },
   async fetch(request){ calls.push(['fetch',request]); return {url:request.url,statusCode:200,body:{kind:'html',content:article(`${request.url} authoritative material`)},truncated:false} },
 }
 const m={calls:0,async generate(request){const payload=JSON.parse(request.payload);if(request.kind==='lesson')return JSON.stringify({lessons:payload.nodes.map(n=>({nodeId:n.nodeId,lesson:lesson(n.title)}))});this.calls++;assert.equal(request.kind,'course');assert.equal(payload.sources.length,3);return JSON.stringify({title:'Kubernetes 学习路线',intro:'从对象模型到控制面，再完成一次部署验证。',nodes:[
   {id:'object-model',title:'对象模型与声明式配置',prerequisite:null,lesson:lesson('对象模型'),briefing:'这一节先认识对象与期望状态，再看它们如何被控制器收敛。',keyPoints:[{sourceId:'web-1',text:'对象用期望状态描述工作负载。'}],practiceKind:'config',prediction:'你认为 Deployment 和 Pod 的关系是什么？',retryPrediction:'换一个工作负载重新判断对象关系。',practice:'阅读 overview 资料，写出一个 Deployment 到 Pod 的对象链。',retryPractice:'为一个 Job 写出相同的对象关系。',explanation:'用自己的话解释 Kubernetes 如何通过对象描述期望状态。',sourceIds:['web-1'],criteria:[{id:'objects',description:'能用资料中的对象解释关系。'}]},
   {id:'control-plane',title:'控制面如何让状态收敛',prerequisite:'object-model',lesson:lesson('控制面'),briefing:'上一节的对象要有人把它变成实际状态，这一节看是谁在做。',keyPoints:[{sourceId:'web-2',text:'控制面组件各自负责一类收敛工作。'}],practiceKind:'compare',prediction:'控制器会在什么时候改变集群状态？',retryPrediction:'从一次副本数变化重新推断。',practice:'根据 architecture 资料画出 API server、scheduler 和 controller 的协作。',retryPractice:'指出一个组件不可用时的影响。',explanation:'解释声明式配置如何经过控制面变成实际状态。',sourceIds:['web-2'],criteria:[{id:'control',description:'能说明控制面组件的职责和状态流转。'}]},
   {id:'deploy-verify',title:'部署一个工作负载并验证',prerequisite:'control-plane',lesson:lesson('部署与验证'),briefing:'把前面两步落到一次真实部署，并想清用什么结果判断成功。',keyPoints:[{sourceId:'web-3',text:'一次部署的验证依赖命令输出与集群状态。'}],practiceKind:'command',prediction:'你会用什么观察结果判断部署成功？',retryPrediction:'选择一个失败部署并说明先看哪里。',practice:'完成 tutorials 中的最小部署，记录命令、状态和观察结果。',retryPractice:'设计一个副本数变化实验并记录差异。',explanation:'把对象、控制面和验证结果连起来说明。',sourceIds:['web-3'],criteria:[{id:'verify',description:'可复查的部署验证证据。'}]}
 ]})},async close(){}}
 const dir=await mkdtemp(join(tmpdir(),'learny-topic-'));const host=await runtime(dir,m,research);const space=await host.service.createWorkspace({name:'Kubernetes 基础学习',goal:'理解对象、控制面和部署验证',kind:'topic',materialPath:''});await host.service.bindWorkspace('chat-one',space.id);t.after(async()=>{await host.close();await rm(dir,{recursive:true,force:true})});
 const course=await host.study.generateCourse(space.id,'chat-one',new AbortController().signal);assert.equal(course.title,'Kubernetes 学习路线');assert.deepEqual(course.sources.map(s=>s.origin),['web','web','web']);assert.deepEqual(course.nodes.map(n=>n.title),['对象模型与声明式配置','控制面如何让状态收敛','部署一个工作负载并验证']);assert.equal(calls.filter(([kind])=>kind==='search').length,1);assert.equal(calls.filter(([kind])=>kind==='fetch').length,3)
})


test('an unusable plan is repaired once and uncheckable reading points are dropped', async t => {
 const research={async search(){return {sources:[{url:'https://example.com/a',title:'A',snippet:'材料 A'}]}},async fetch(request){return {url:request.url,statusCode:200,body:{kind:'html',content:article('正文 A')},truncated:false}}}
 const node=(id,prerequisite)=>({id,title:`节点 ${id}`,prerequisite,lesson:lesson(id),briefing:'先读材料再动手，留意它讲了什么。',keyPoints:[{sourceId:'web-1',text:'来自资料的一条要点。'},{sourceId:'web-9',text:'引用了不存在的来源。'}],practiceKind:'not-a-kind',prediction:'先预测',retryPrediction:'迁移预测',practice:'动手实践',retryPractice:'换个条件实践',explanation:'解释一遍',sourceIds:['web-1'],criteria:[{id:'c1',description:'标准'}]})
 let calls=0
 const m={async generate(request){if(request.kind==='lesson')return JSON.stringify({lessons:JSON.parse(request.payload).nodes.map(n=>({nodeId:n.nodeId,lesson:lesson(n.title)}))});calls++;if(calls===1)return '这次不是 JSON';return JSON.stringify({title:'Kubernetes 学习路线',intro:'修好之后的路线。',nodes:[node('n1',null),node('n2','n1'),node('n3','n2')]})},async close(){}}
 const dir=await mkdtemp(join(tmpdir(),'learny-repair-'));const host=await runtime(dir,m,research);const space=await host.service.createWorkspace({name:'Kubernetes 基础学习',goal:'理解对象',kind:'topic',materialPath:''});t.after(async()=>{await host.close();await rm(dir,{recursive:true,force:true})})
 const course=await host.study.generateCourse(space.id,'chat-one',new AbortController().signal)
 assert.equal(calls,2)
 assert.equal(course.nodes[0].practiceKind,'mixed')
 assert.deepEqual(course.nodes[0].keyPoints.map(point=>point.sourceId),['web-1'])
 assert.equal(course.title,'Kubernetes 学习路线')
})

test('sloppy prerequisites become node ids or null instead of voiding a researched route', async t => {
 const research={
   async search(){return {sources:[{url:'https://kubernetes.io/docs/concepts/overview/',title:'overview',snippet:'Kubernetes objects.'},{url:'https://kubernetes.io/docs/concepts/architecture/',title:'architecture',snippet:'Control plane.'},{url:'https://kubernetes.io/docs/tutorials/',title:'tutorials',snippet:'Hands-on.'}]}},
   async fetch(request){return {url:request.url,statusCode:200,body:{kind:'html',content:article(`${request.url} material`)},truncated:false}},
 }
 const node=(id,title,prerequisite,sourceId)=>({id,title,prerequisite,lesson:lesson(title),briefing:'这一节先看清材料再动手。',keyPoints:[{sourceId,text:'材料里的一条要点。'}],practiceKind:'command',prediction:'先预测',retryPrediction:'迁移预测',practice:'动手实践',retryPractice:'换个条件实践',explanation:'解释一遍',sourceIds:[sourceId],criteria:[{id:'c1',description:'标准'}]})
 const m={async generate(request){if(request.kind==='lesson')return JSON.stringify({lessons:JSON.parse(request.payload).nodes.map(n=>({nodeId:n.nodeId,lesson:lesson(n.title)}))});return JSON.stringify({title:'Kubernetes 学习路线',intro:'从概念到动手验证。',nodes:[
   node('concepts','核心概念','无','web-1'),
   node('architecture','架构组件','核心概念','web-2'),
   node('hands-on','动手验证','architecture','web-3'),
 ]})},async close(){}}
 const dir=await mkdtemp(join(tmpdir(),'learny-prereq-'));const host=await runtime(dir,m,research);const space=await host.service.createWorkspace({name:'Kubernetes 基础学习',goal:'理解概念、架构和动手验证',kind:'topic',materialPath:''});await host.service.bindWorkspace('chat-one',space.id);t.after(async()=>{await host.close();await rm(dir,{recursive:true,force:true})});
 const course=await host.study.generateCourse(space.id,'chat-one',new AbortController().signal)
 assert.deepEqual(course.nodes.map(n=>n.prerequisite),[null,'concepts','architecture'])
})

test('a bare retrieved URL without readable page content cannot ground a course', async t => {
 const dir=await mkdtemp(join(tmpdir(),'learny-unreadable-'));let planned=false
 const research={async search(){return {sources:[{url:'https://example.com/docs/'}]}},async fetch(){throw new Error('blocked')}}
 const host=await runtime(dir,{async generate(){planned=true;throw new Error('should not plan')},async close(){}},research)
 t.after(async()=>{await host.close();await rm(dir,{recursive:true,force:true})})
 const space=await host.service.createWorkspace({name:'Knowledge',goal:'Learn from sources',kind:'topic',materialPath:''})
 await assert.rejects(host.study.generateCourse(space.id,'chat-one',new AbortController().signal),/no readable source material/)
 assert.equal(planned,false);assert.equal((await host.study.snapshot(space.id)).course,null)
})
