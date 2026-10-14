import { runtime } from './runtime-helper.mjs'
const instance = await runtime(process.argv[2])
try {
  const snapshot = await instance.service.snapshot('chat-2')
  const note = await instance.service.readNote(snapshot.workspaceId, snapshot.notes[0].id)
  console.log(JSON.stringify({ snapshot, note }))
} finally { await instance.close() }
