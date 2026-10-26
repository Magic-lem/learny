import test from 'node:test'
import assert from 'node:assert/strict'
import { teachingBrief } from '../packages/learny/lib/types/core/teaching.js'
import { writeLesson } from '../packages/learny/lib/types/core/lesson.js'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runtime } from './runtime-helper.mjs'

test('teaching follows declared prerequisites in a branching route, without requiring new stored fields', () => {
  const a = { id: 'a', title: '基础', briefing: '先备概念' }
  const b = { id: 'b', title: '另一分支' }
  const c = { id: 'c', title: '本章', prerequisite: 'a', criteria: [{ description: '解释边界' }], practice: '对照示意' }
  const course = { nodes: [a, b, c] }
  assert.deepEqual(teachingBrief(c, course), {
    chapter: 3, prerequisite: { title: '基础', briefing: '先备概念' }, next: null,
    outcomes: ['解释边界'], optionalPractice: '对照示意',
  })
  assert.deepEqual(teachingBrief({ id: 'legacy' }), { chapter: null, prerequisite: null, next: null, outcomes: [], optionalPractice: '' })
})

test('a complete chapter over the former 8000-character limit survives generation, persistence and reload', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'learny-teaching-'))
  const project = join(dir, 'project')
  await mkdir(project)
  await writeFile(join(project, 'README.md'), '# P\n\nEntry and flow.')
  const chapter = '## 请求如何经过各层\n\n' + '这是完整解释、示范与证据说明。\n\n'.repeat(520)
  assert.ok(chapter.length > 8000 && chapter.length < 24000)
  const requests = []
  const model = { async generate(request) { requests.push(request); return JSON.stringify({ lesson: chapter }) }, async close() {} }
  let host = await runtime(dir, model)
  t.after(async () => { await host.close(); await rm(dir, { recursive: true, force: true }) })
  const workspace = await host.service.createWorkspace({ name: 'P', goal: '理解请求', kind: 'project', materialPath: project })
  const course = await host.study.generateCourse(workspace.id)
  const lesson = await host.study.nodeLesson(workspace.id, course.nodes[0].id, 'chat-one')
  assert.equal(lesson, chapter)
  const payload = JSON.parse(requests[0].payload)
  assert.deepEqual(payload.teaching.outcomes, course.nodes[0].criteria.map(item => item.description))
  await host.close()
  host = await runtime(dir, model)
  assert.equal(await host.study.nodeLesson(workspace.id, course.nodes[0].id, 'chat-one'), chapter)
  assert.equal(requests.length, 1)
})

test('malformed lesson JSON is retried without losing teaching context', async () => {
  const seen = []
  const chapter = '## 创建请求的边界\n\n' + '逐步解释具体例子与机制。'.repeat(10)
  const model = { async generate(request) { seen.push(request); return seen.length === 1 ? 'invalid' : JSON.stringify({ lesson: chapter }) }, async close() {} }
  const node = { id: 'n1', title: '边界', criteria: [{ description: '解释请求归属' }] }
  assert.equal(await writeLesson('P', '学习目标', node, [], model, 'session', new AbortController().signal), chapter)
  assert.equal(seen.length, 2)
  assert.equal(seen[0].payload, seen[1].payload)
  assert.deepEqual(JSON.parse(seen[1].payload).teaching.outcomes, ['解释请求归属'])
})
