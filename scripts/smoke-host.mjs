import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

const base = process.env.LEARNY_SMOKE_URL
const token = process.env.LEARNY_SMOKE_TOKEN
const reportPath = process.env.LEARNY_SMOKE_REPORT
if (!base || !token || !reportPath) throw Error('Set LEARNY_SMOKE_URL, LEARNY_SMOKE_TOKEN and LEARNY_SMOKE_REPORT')
const auth = await fetch(`${base}/?token=${encodeURIComponent(token)}`, { redirect: 'manual' })
const cookie = auth.headers.getSetCookie().map(row => row.split(';')[0]).join('; ')
if (!cookie) throw Error('Host did not issue an authentication cookie')
async function result(method, args) {
  const response = await fetch(`${base}/api/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, Cookie: cookie },
    body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method, payload: { args } }),
  })
  assert.equal(response.status, 200)
  return (await response.json()).result
}
async function call(method, args) {
  const response = await result(method, args)
  assert.equal(response.ok, true, JSON.stringify(response.error))
  return response.value
}
let report
if (process.argv.includes('--resume')) {
  report = JSON.parse(await readFile(reportPath, 'utf8'))
} else {
  const sessionId = process.env.LEARNY_SMOKE_SESSION ?? `session-${randomUUID()}`
  await call('session/create', { request: { sessionId, cwd: process.env.LEARNY_SMOKE_CWD ?? process.cwd() } })
  await call('session/rename', { request: { sessionId, title: 'Learny M0 验证' } })
  const snapshot = await call('learny/snapshot', { sessionId })
  let workspace = snapshot.workspaces.find(row => row.id === snapshot.workspaceId)
  if (!workspace) workspace = await call('learny/createWorkspace', { request: {
    name: '理解 dsh 的工具调用', goal: '追踪一次工具调用，写下自己的判断与疑问。', kind: 'topic', materialPath: '',
  } })
  await call('learny/bindWorkspace', { sessionId, workspaceId: workspace.id })
  const existing = snapshot.notes[0]
  let note
  if (existing) note = await call('learny/readNote', { workspaceId: workspace.id, noteId: existing.id })
  else {
    note = await call('learny/createNote', { workspaceId: workspace.id, title: '我的判断：工具如何返回结果' })
    note = await call('learny/saveNote', { request: { workspaceId: workspace.id, noteId: note.id,
      title: note.title, content: '# 我的判断\n\n工具返回值成为下一轮推理的输入。\n\n## 待验证\n\n- [ ] 找到注册入口\n- [ ] 追踪执行与日志\n', expectedVersion: note.version } })
  }
  const secondSessionId = `session-${randomUUID()}`
  await call('session/create', { request: { sessionId: secondSessionId, cwd: process.cwd() } })
  await call('session/rename', { request: { sessionId: secondSessionId, title: 'Learny 跨聊天验证' } })
  await call('learny/bindWorkspace', { sessionId: secondSessionId, workspaceId: workspace.id })
  report = { base, sessionId, secondSessionId, workspaceId: workspace.id, noteId: note.id, content: note.content, version: note.version }
  const bad = await result('learny/snapshot', { sessionId, unexpected: true })
  assert.equal(bad.ok, false)
  assert.equal(bad.error.code, 'gateway/arguments-invalid')
}
for (const sessionId of [report.sessionId, report.secondSessionId]) {
  const snapshot = await call('learny/snapshot', { sessionId })
  assert.equal(snapshot.workspaceId, report.workspaceId)
  assert.ok(snapshot.notes.some(note => note.id === report.noteId))
}
const note = await call('learny/readNote', { workspaceId: report.workspaceId, noteId: report.noteId })
assert.equal(note.content, report.content)
assert.equal(note.version, report.version)
report[process.argv.includes('--resume') ? 'restartVerifiedAt' : 'verifiedAt'] = new Date().toISOString()
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n')
console.log(`${process.argv.includes('--resume') ? 'Restart recovery' : 'Host API roundtrip, strict arguments and two-chat binding'} passed: ${base}`)
