import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runtime } from './runtime-helper.mjs'
import { routeLayout } from '../packages/learny/lib/client-types/client/learning-map.js'

const nodes = [
  { id: 'a', title: '概念与基础', prerequisite: null },
  { id: 'b', title: '一个非常长的章节标题，用于检查窄面板中内容换行后是否仍有足够的节点高度', prerequisite: 'a' },
  { id: 'c', title: '并列章节', prerequisite: 'a' },
  { id: 'd', title: '实践验证', prerequisite: 'b' },
]

test('route layout retains actual branching dependencies and bounded readable boxes at narrow and wide sizes', () => {
  for (const fontSize of [13, 18, 26]) for (const width of [240, 280, 320, 390, 559, 560, 620, 840]) {
    const result = routeLayout(nodes, width, fontSize)
    assert.equal(result.boxes.length, nodes.length)
    assert.equal(result.links.length, 3)
    assert.deepEqual(result.links.map(link => [link.from, link.to]), [['a', 'b'], ['a', 'c'], ['b', 'd']])
    for (const box of result.boxes) {
      assert.ok(box.x >= 0 && box.x + box.w <= result.width)
      assert.ok(box.y + box.h <= result.height)
    }
    for (let i = 0; i < result.boxes.length; i++) for (let j = i + 1; j < result.boxes.length; j++) {
      const a = result.boxes[i], b = result.boxes[j]
      assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y)
    }
  }
})

test('missing and cyclic prerequisites never invent links or recurse indefinitely', () => {
  assert.equal(routeLayout([{ ...nodes[0], prerequisite: 'missing' }], 320).links.length, 0)
  const cycle = routeLayout([{ ...nodes[0], prerequisite: 'b' }, { ...nodes[1], prerequisite: 'a' }], 320)
  assert.equal(cycle.boxes.length, 2)
  assert.deepEqual(new Set(cycle.cyclic), new Set(['a', 'b']))
  assert.equal(cycle.links.length, 0)
})

test('self-reported learning survives a restart, remains workspace-owned and never changes assessment', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'learny-progress-'))
  const model = { async generate() { throw new Error('Marking progress must not call the model') }, async close() {} }
  let host = await runtime(dir, model)
  t.after(async () => { await host.close(); await rm(dir, { recursive: true, force: true }) })
  const space = await host.service.createWorkspace({ name: 'dsh 工具调用学习', goal: 'g', kind: 'topic', materialPath: '' })
  const other = await host.service.createWorkspace({ name: 'dsh 工具调用学习', goal: 'g', kind: 'topic', materialPath: '' })
  const attempt = await host.study.start(space.id, 'registration')
  await host.study.markNodeComplete(space.id, 'registration', true)
  let snapshot = await host.study.snapshot(space.id)
  assert.equal(snapshot.progress.find(row => row.nodeId === 'registration')?.completed, true)
  assert.deepEqual(snapshot.attempts.find(row => row.id === attempt.id), attempt)
  assert.deepEqual((await host.study.snapshot(other.id)).progress, [])
  await assert.rejects(host.study.markNodeComplete(space.id, 'missing-node', true))
  await host.close()
  host = await runtime(dir, model)
  snapshot = await host.study.snapshot(space.id)
  assert.equal(snapshot.progress[0].completed, true)
  assert.equal(snapshot.attempts[0].evaluation, null)
  await host.study.markNodeComplete(space.id, 'registration', false)
  assert.equal((await host.study.snapshot(space.id)).progress[0].completed, false)
})
