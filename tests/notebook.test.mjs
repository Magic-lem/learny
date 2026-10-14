import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { runtime } from './runtime-helper.mjs'

test('Markdown and chat bindings survive a real process restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'learny-restart-'))
  const instance = await runtime(directory)
  try {
    const space = await instance.service.createWorkspace({ name: '我的学习', goal: '追踪工具调用', kind: 'topic', materialPath: '' })
    await instance.service.bindWorkspace('chat-1', space.id)
    await instance.service.bindWorkspace('chat-2', space.id)
    const first = await instance.service.createNote(space.id, '我的理解')
    const saved = await instance.service.saveNote({ workspaceId: space.id, noteId: first.id, title: '调用链路', content: '# 我的理解\n\n工具的结果进入后续推理。\n\n```ts\nconst answer = 42\n```\n', expectedVersion: first.version })
    assert.match(await readFile(saved.path, 'utf8'), /# 我的理解/)
    assert.equal((await instance.service.snapshot('chat-1')).notes[0].title, '调用链路')
    assert.equal((await readdir(join(directory, 'revisions', space.id, first.id))).length, 1)
    await instance.close()
    const child = execFileSync(process.execPath, [fileURLToPath(new URL('./restart-worker.mjs', import.meta.url)), directory], { encoding: 'utf8' })
    const result = JSON.parse(child)
    assert.equal(result.snapshot.workspaceId, space.id)
    assert.equal(result.note.content, saved.content)
    assert.equal(result.note.version, saved.version)
  } finally { await instance.close(); await rm(directory, { recursive: true, force: true }) }
})

test('stale saves preserve external changes and simultaneous saves cannot silently overwrite each other', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'learny-conflict-'))
  const instance = await runtime(directory)
  try {
    const space = await instance.service.createWorkspace({ name: '笔记', goal: '', kind: 'topic', materialPath: '' })
    const first = await instance.service.createNote(space.id, '疑问')
    const external = (await readFile(first.path, 'utf8')) + '外部编辑器的新内容'
    await writeFile(first.path, external)
    await assert.rejects(instance.service.saveNote({ workspaceId: space.id, noteId: first.id, title: '旧草稿', content: '过期内容', expectedVersion: first.version }), error => error.code === 'learny/conflict')
    assert.equal(await readFile(first.path, 'utf8'), external)
    const fresh = await instance.service.readNote(space.id, first.id)
    const request = { workspaceId: space.id, noteId: first.id, title: '合并后', expectedVersion: fresh.version }
    const outcomes = await Promise.allSettled([
      instance.service.saveNote({ ...request, content: '第一份编辑' }),
      instance.service.saveNote({ ...request, content: '第二份编辑' }),
    ])
    assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1)
    assert.equal(outcomes.find(outcome => outcome.status === 'rejected').reason.code, 'learny/conflict')
    assert.equal((await instance.service.readNote(space.id, first.id)).content, '第一份编辑')
  } finally { await instance.close(); await rm(directory, { recursive: true, force: true }) }
})

test('workspace ownership and filename validation prevent reading notes across spaces or using relative paths', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'learny-scope-'))
  const instance = await runtime(directory)
  try {
    const a = await instance.service.createWorkspace({ name: 'A', goal: '', kind: 'topic', materialPath: '' })
    const b = await instance.service.createWorkspace({ name: 'B', goal: '', kind: 'topic', materialPath: '' })
    const note = await instance.service.createNote(a.id, '只属于 A')
    await assert.rejects(instance.service.readNote(b.id, note.id), error => error.code === 'learny/not-found')
    await assert.rejects(instance.service.readNote(a.id, '../../escape'), error => error.code === 'learny/invalid-input')
    await assert.rejects(instance.service.createWorkspace({ name: '无效项目', goal: '', kind: 'project', materialPath: '.' }), error => error.code === 'learny/invalid-input')
  } finally { await instance.close(); await rm(directory, { recursive: true, force: true }) }
})
