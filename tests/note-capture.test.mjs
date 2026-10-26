import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { runtime } from './runtime-helper.mjs'
import { noteFolders, locationKey } from '../packages/learny/lib/client-types/client/note-tree.js'

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'learny-capture-'))
  const project = join(dir, 'project')
  await mkdir(project)
  await writeFile(join(project, 'README.md'), '# Example\n\nA local example with an entry and a verification flow.')
  const calls = [], prompts = []
  const chat = {
    async ask(request) { prompts.push(request); return `request-${prompts.length}` },
    async answer() { return null },
    async message({ messageId }) {
      return messageId === 'no-message' ? null : { content: '这是第一节的回答。它不是当前正在学习的第二节。', requestIds: ['request-1'] }
    },
  }
  const model = { async generate(request) {
    calls.push(request)
    const payload = JSON.parse(request.payload)
    return JSON.stringify({ markdown: `## ${payload.original}`, summary: '只整理标题。', sourceIds: [] })
  }, async close() {} }
  let host = await runtime(dir, model, undefined, { chat })
  const space = await host.service.createWorkspace({ name: '本地示例', goal: '', kind: 'project', materialPath: project })
  await host.service.bindWorkspace('learning-chat', space.id)
  const course = await host.study.generateCourse(space.id)
  t.after(async () => { await host.close(); await rm(dir, { recursive: true, force: true }) })
  return { get host() { return host }, dir, space, course, calls, prompts, async restart() {
    await host.close(); host = await runtime(dir, model, undefined, { chat }); return host
  } }
}

test('quick capture is atomic, retry-safe, chapter-owned, and persists with review flags across a restart', async t => {
  const f = await fixture(t)
  const { space, course } = f
  await f.host.study.startNode(space.id, course.nodes[0].id, 'learning-chat')
  const request = { id: randomUUID(), workspaceId: space.id, sessionId: 'learning-chat', content: '只写一句自己的理解。\n先不考虑排版。' }
  const [a, b] = await Promise.all([f.host.study.captureNote(request), f.host.study.captureNote(request)])
  assert.equal(a.id, b.id)
  assert.equal(a.context.location.nodeId, course.nodes[0].id)
  assert.equal(a.context.location.courseVersion, course.version)
  assert.equal(a.title, '只写一句自己的理解。')
  assert.equal((await f.host.service.snapshot('learning-chat')).notes.length, 1)
  assert.equal(f.calls.length, 0, 'capture must never call a model')
  await assert.rejects(f.host.study.captureNote({ ...request, content: '不能复用同一个 id 写不同的正文' }))
  await assert.rejects(f.host.study.captureNote({ ...request, id: randomUUID(), content: '  ' }))
  await assert.rejects(f.host.study.captureNote({ ...request, id: randomUUID(), sessionId: 'unbound-chat' }))
  await assert.rejects(f.host.study.captureNote({ ...request, id: randomUUID(), location: { nodeId: course.nodes[0].id, courseVersion: 'old', title: 'wrong' } }))
  const spaceNote = await f.host.study.captureNote({ ...request, id: randomUUID(), location: null })
  assert.equal(spaceNote.context.location, null)
  const reviewed = await f.host.study.reviewNote(space.id, a.id, a.version, 'uncertain')
  assert.equal(reviewed.content, request.content)
  assert.equal(reviewed.context.question, true)
  await assert.rejects(f.host.study.reviewNote(space.id, a.id, a.version, 'remembered'), error => error.code === 'learny/conflict')
  await f.restart()
  const persisted = await f.host.service.readNote(space.id, a.id)
  assert.equal(persisted.context.review.outcome, 'uncertain')
  assert.equal(persisted.context.location.courseVersion, course.version)
  assert.match(await readFile(persisted.path, 'utf8'), /只写一句自己的理解/)
})

test('chat capture reads host text, resolves the chapter of the actual message, deduplicates and preserves provenance', async t => {
  const f = await fixture(t), { space, course } = f
  await f.host.study.startNode(space.id, course.nodes[0].id, 'learning-chat')
  await f.host.study.startNode(space.id, course.nodes[1].id, 'learning-chat')
  const [a, b] = await Promise.all([f.host.study.captureMessage('learning-chat', 'answer-one'), f.host.study.captureMessage('learning-chat', 'answer-one')])
  assert.equal(a.id, b.id)
  assert.equal(a.context.source, 'chat')
  assert.equal(a.title, `${course.nodes[0].title}：讲解摘录`)
  assert.equal(a.context.messageId, 'answer-one')
  assert.equal(a.context.location.nodeId, course.nodes[0].id, 'a past answer must not be filed under the most recent chapter')
  assert.equal(a.context.sessionId, 'learning-chat')
  assert.equal((await f.host.service.snapshot('learning-chat')).notes.length, 1)
  await assert.rejects(f.host.study.captureMessage('learning-chat', 'no-message'))
  await assert.rejects(f.host.study.captureMessage('unbound-chat', 'answer-one'))
  const edited = await f.host.service.saveNote({ workspaceId: space.id, noteId: a.id, title: a.title, content: a.content + '\n\n自己的补充。', expectedVersion: a.version })
  assert.equal((await f.host.study.captureMessage('learning-chat', 'answer-one')).content, edited.content)
  await f.host.study.askAboutNote(space.id, a.id, 'learning-chat', '能举个例子吗？', new AbortController().signal)
  assert.match(f.prompts.at(-1).text, /自己的补充/)
  assert.match(f.prompts.at(-1).text, /能举个例子/)
  assert.equal(f.calls.length, 0)
})

test('metadata-only changes do not prevent original restoration; edits and stale saves remain protected', async t => {
  const f = await fixture(t), { space } = f
  const note = await f.host.study.captureNote({ id: randomUUID(), workspaceId: space.id, sessionId: 'learning-chat', content: '自己的记录，可能还不准确。', location: null })
  const revision = await f.host.study.organize({ id: randomUUID(), workspaceId: space.id, noteId: note.id, sessionId: 'learning-chat', expectedVersion: note.version, mode: 'format', instruction: '只改标题' }, new AbortController().signal)
  assert.equal(revision.status, 'ready')
  await f.host.study.applyRevision(space.id, revision.id, false)
  let current = await f.host.service.readNote(space.id, note.id)
  assert.equal(current.context.organized, true)
  current = await f.host.study.reviewNote(space.id, current.id, current.version, 'uncertain')
  await f.host.study.applyRevision(space.id, revision.id, true)
  current = await f.host.service.readNote(space.id, note.id)
  assert.equal(current.content, note.content)
  assert.equal(current.context.question, true)
  assert.equal(current.context.review.outcome, 'uncertain')
  assert.equal(current.context.organized, false)
  await assert.rejects(f.host.service.saveNote({ workspaceId: space.id, noteId: note.id, title: note.title, content: '过期草稿', expectedVersion: note.version }), error => error.code === 'learny/conflict')
  const legacy = await f.host.service.createNote(space.id, '旧格式笔记')
  assert.equal(legacy.context, undefined)
  const legacyFolder = noteFolders(f.course, [legacy]).find(folder => folder.key === 'space')
  assert.equal(legacyFolder.notes[0].id, legacy.id)
})

test('chapter directory preserves old course locations even when a new course reuses chapter ids', () => {
  const old = { nodeId: 'a', courseVersion: 'old-course', title: '旧章节' }
  const current = { version: 'new-course', title: '新课程', intro: '', sources: [], nodes: [{ id: 'a', title: '新章节' }] }
  const notes = [{ id: '1', context: { location: old } }, { id: '2' }]
  const folders = noteFolders(current, notes)
  assert.equal(folders.find(folder => folder.key === locationKey(old)).historical, true)
  assert.equal(folders.find(folder => folder.key === locationKey(old)).notes.length, 1)
  assert.equal(folders.find(folder => folder.location?.courseVersion === 'new-course').notes.length, 0)
  assert.equal(folders.find(folder => folder.key === 'space').notes[0].id, '2')
})
