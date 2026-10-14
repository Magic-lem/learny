import { randomUUID } from 'node:crypto'
import { runtime } from './runtime-helper.mjs'
let space, note
const host=await runtime(process.argv[2],{
  generate(request){process.send({kind:request.kind,id:request.runId,workspaceId:space.id,noteId:note?.id});return new Promise(()=>{})},async close(){}
})
space=await host.service.createWorkspace({name:'Interrupted',goal:'Keep original',kind:'topic',materialPath:''})
await host.service.bindWorkspace('chat-one',space.id)
let a=await host.study.start(space.id,'registration')
async function act(action,text=''){a=await host.study.act({workspaceId:space.id,attemptId:a.id,expectedRevision:a.revision,action,text})}
await act('prediction','execute stays local');await act('reading','schemas');await act('startPractice');await act('practice','My trace: schemaOf returns name, description, parameters.');await act('explanation','The host executes the registered function.')
void host.study.submit({workspaceId:space.id,attemptId:a.id,expectedRevision:a.revision,sessionId:'chat-one',assistance:'independent'},new AbortController().signal)
process.on('message',async()=>{
 note=await host.service.createNote(space.id,'Interrupted notes');note=await host.service.saveNote({workspaceId:space.id,noteId:note.id,title:note.title,content:'自己的原文',expectedVersion:note.version})
 void host.study.organize({id:randomUUID(),sessionId:'chat-one',workspaceId:space.id,noteId:note.id,expectedVersion:note.version,mode:'format',instruction:'只调整段落排版'},new AbortController().signal)
})
