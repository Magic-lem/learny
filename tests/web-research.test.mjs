import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runtime } from './runtime-helper.mjs'

const node = (id, prerequisite, sourceId) => ({ id, title: `节点 ${id}`, prerequisite, briefing: '这一节先读材料，再动手验证。',
  lesson: `这一节讲清楚 ${id} 要解决的问题、关键概念和工作机制，并说明它与本次实践的关系。${'讲解用中文写成，学习者不需要读英文原文。'.repeat(3)}`,
  keyPoints: [{ sourceId, text: '材料里的一条要点。' }], practiceKind: 'command', prediction: '先预测', retryPrediction: '换个条件预测',
  practice: '动手实践', retryPractice: '换个条件实践', explanation: '解释一遍', sourceIds: [sourceId], criteria: [{ id: 'c1', description: '标准' }] })

/** Enough prose that HTML extraction passes its "too little text" guard. */
const article = (text) => `<article><h1>标题</h1><p>${text}</p><p>${'概念、工作机制、常见误区和验证方式都在原文中有对应段落。'.repeat(6)}</p></article>`

/** A model that plans a three-node route over however many sources research returned. */
function planner() {
  return { async generate(request) {
    const payload = JSON.parse(request.payload)
    if (request.kind === 'lesson') return JSON.stringify({ lessons: payload.nodes.map(node => ({ nodeId: node.nodeId, lesson: `这一节讲清楚 ${node.title} 的关键概念、工作方式和容易混淆的地方。${'讲解用中文写成，学习者不需要读英文原文。'.repeat(3)}` })) })
    const count = payload.sources.length
    return JSON.stringify({ title: 'Kubernetes 学习路线', intro: '从资料出发的路线。', nodes: [
      node('n1', null, 'web-1'),
      node('n2', 'n1', `web-${Math.min(2, count)}`),
      node('n3', 'n2', `web-${count}`),
    ] })
  }, async close() {} }
}

async function host(t, research, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'learny-research-'))
  const created = await runtime(dir, planner(), research, options)
  t.after(async () => { await created.close(); await rm(dir, { recursive: true, force: true }) })
  return created
}

test('one page under several tracking tags becomes one source and one read', async t => {
  const searches = [], fetches = []
  const research = {
    async search(request) {
      searches.push(request)
      return { sources: [
        { url: 'https://Example.com/docs/guide?utm_source=x&ws_call_id=call_01#frag', title: 'Guide' },
        { url: 'https://example.com/docs/guide?ref=share', title: 'Guide again' },
        { url: 'https://example.com/docs/other', title: 'Other' },
        { url: 'https://www.example.com/docs/other#top', title: 'Other mirror' },
      ] }
    },
    async fetch(request) { fetches.push(request.url); return { url: request.url, statusCode: 200, body: { kind: 'html', content: article(`正文 ${request.url}`) }, truncated: false } },
  }
  const { study, service } = await host(t, research)
  const space = await service.createWorkspace({ name: 'Kubernetes 基础学习', goal: '概念、架构与动手验证', kind: 'topic', materialPath: '' })
  const course = await study.generateCourse(space.id, 'chat-one', new AbortController().signal)
  assert.equal(searches.length, 1)
  assert.deepEqual(fetches, ['https://Example.com/docs/guide?utm_source=x&ws_call_id=call_01#frag', 'https://example.com/docs/other'])
  assert.deepEqual(course.sources.map(source => source.id), ['web-1', 'web-2'])
  assert.deepEqual(course.sources.map(source => source.url), ['https://Example.com/docs/guide?utm_source=x&ws_call_id=call_01#frag', 'https://example.com/docs/other'])
  assert.deepEqual((await study.snapshot(space.id)).research, { used: 3, limit: 60, lastError: null })
})

test('identical text under two addresses grounds one source, not two', async t => {
  const fetches = []
  const research = {
    async search() { return { sources: [{ url: 'https://example.com/a', title: 'A' }, { url: 'https://example.com/b', title: 'B' }] } },
    async fetch(request) { fetches.push(request.url); return { url: request.url, statusCode: 200, body: { kind: 'html', content: article('同一篇正文') }, truncated: false } },
  }
  const { study, service } = await host(t, research)
  const space = await service.createWorkspace({ name: 'Kubernetes 基础学习', goal: '理解对象', kind: 'topic', materialPath: '' })
  const course = await study.generateCourse(space.id, 'chat-one', new AbortController().signal)
  assert.equal(fetches.length, 2)
  assert.equal(course.sources.length, 1)
  // The stored course keeps provenance, not the page text.
  assert.equal(course.sources[0].excerpt, undefined)
  assert.equal(course.sources[0].sha256.length, 64)
})

test('a page read once is reused on the next route instead of read again', async t => {
  const fetches = []
  const research = {
    async search() { return { sources: [{ url: 'https://kubernetes.io/docs/concepts/', title: 'Concepts' }] } },
    async fetch(request) { fetches.push(request.url); return { url: request.url, statusCode: 200, body: { kind: 'html', content: article('Kubernetes 概念正文') }, truncated: false } },
  }
  const { study, service } = await host(t, research)
  const space = await service.createWorkspace({ name: 'Kubernetes 基础学习', goal: '理解对象', kind: 'topic', materialPath: '' })
  await study.generateCourse(space.id, 'chat-one', new AbortController().signal)
  assert.deepEqual((await study.snapshot(space.id)).research, { used: 2, limit: 60, lastError: null })
  const second = await study.generateCourse(space.id, 'chat-one', new AbortController().signal)
  assert.equal(fetches.length, 1)
  assert.equal(second.sources[0].excerpt, undefined)
  assert.deepEqual((await study.snapshot(space.id)).research, { used: 3, limit: 60, lastError: null })
  assert.equal((await study.snapshot(space.id)).courseVersion, second.version)
})

test('a spent budget keeps what was already read and reports itself', async t => {
  const research = {
    async search() { return { sources: Array.from({ length: 5 }, (_, index) => ({ url: `https://example.com/page-${index}`, title: `Page ${index}` })) } },
    async fetch(request) { return { url: request.url, statusCode: 200, body: { kind: 'html', content: article(`正文 ${request.url}`) }, truncated: false } },
  }
  const { study, service } = await host(t, research, { researchDailyCallBudget: 3 })
  const space = await service.createWorkspace({ name: 'Kubernetes 基础学习', goal: '理解对象', kind: 'topic', materialPath: '' })
  const course = await study.generateCourse(space.id, 'chat-one', new AbortController().signal)
  assert.equal(course.sources.length, 2)
  assert.deepEqual((await study.snapshot(space.id)).research, { used: 3, limit: 3, lastError: null })

  const tight = await host(t, research, { researchDailyCallBudget: 1 })
  const tightSpace = await tight.service.createWorkspace({ name: '预算用尽', goal: '理解对象', kind: 'topic', materialPath: '' })
  await assert.rejects(tight.study.generateCourse(tightSpace.id, 'chat-one', new AbortController().signal), error => /LEARNY_RESEARCH_BUDGET/.test(error.message))
  assert.equal((await tight.study.snapshot(tightSpace.id)).research.used, 1)
})

test('teaching text is written when a node is opened, reused, and open to follow-ups', async t => {
  const fetches = []
  const research = {
    async search() { return { sources: [{ url: 'https://example.com/a', title: 'A' }] } },
    async fetch(request) { fetches.push(request.url); return { url: request.url, statusCode: 200, body: { kind: 'html', content: article('正文 A') }, truncated: false } },
  }
  const seen = []
  const skeleton = (id, prerequisite) => ({ id, title: `节点 ${id}`, prerequisite, briefing: '这一节先读讲解，再动手。',
    keyPoints: [{ sourceId: 'web-1', text: '材料里的一条要点。' }], practiceKind: 'command', prediction: '先预测', retryPrediction: '迁移预测',
    practice: '动手实践', retryPractice: '换个条件实践', explanation: '解释一遍', sourceIds: ['web-1'], criteria: [{ id: 'c1', description: '标准' }] })
  const m = { async generate(request) {
    seen.push(request.kind)
    if (request.kind === 'lesson') return JSON.stringify({ lesson: `这一节讲清楚要解决的问题、关键概念和工作机制。${'讲解用中文写成，学习者不需要读英文原文。'.repeat(4)}` })
    if (request.kind === 'followup') return JSON.stringify({ answer: `更细的解释在这里，并给出一个可验证的小例子。${'只根据给出的资料回答。'.repeat(4)}` })
    return JSON.stringify({ title: 'Kubernetes 学习路线', intro: '简介', nodes: [skeleton('n1', null), skeleton('n2', 'n1'), skeleton('n3', 'n2')] })
  }, async close() {} }
  const dir = await mkdtemp(join(tmpdir(), 'learny-lesson-'))
  const host = await runtime(dir, m, research)
  t.after(async () => { await host.close(); await rm(dir, { recursive: true, force: true }) })
  const space = await host.service.createWorkspace({ name: 'Kubernetes 基础学习', goal: '理解对象', kind: 'topic', materialPath: '' })
  const signal = new AbortController().signal
  const course = await host.study.generateCourse(space.id, 'chat-one', signal)
  assert.deepEqual(seen, ['course'])                       // the route is planned without teaching text
  assert.equal(course.sources[0].excerpt, undefined)
  const first = await host.study.nodeLesson(space.id, 'n1', 'chat-one')
  assert.match(first, /这一节讲清楚/)
  assert.equal(await host.study.nodeLesson(space.id, 'n1', 'chat-one'), first)
  assert.deepEqual(seen, ['course', 'lesson'])              // reused, not rewritten
  assert.equal(fetches.length, 1)                           // read from the research cache, not re-fetched
  const dive = await host.study.deepen({ workspaceId: space.id, nodeId: 'n1', question: '为什么要先有 Pod？', sessionId: 'chat-one' })
  assert.match(dive.answer, /更细的解释/)
  const state = await host.study.snapshot(space.id)
  assert.equal(state.lessons.n1, first)
  assert.deepEqual(state.deepDives.map(item => item.question), ['为什么要先有 Pod？'])
  assert.deepEqual(state.materials.map(source => source.excerpt), [undefined])
})

test('a page that cannot be read is recorded as a failed call', async t => {
  const research = {
    async search() { return { sources: [{ url: 'https://example.com/blocked', title: 'Blocked' }, { url: 'https://example.com/open', title: 'Open', snippet: '摘要正文' }] } },
    async fetch(request) { if (request.url.endsWith('blocked')) throw new Error('blocked by provider'); return { url: request.url, statusCode: 200, body: { kind: 'html', content: article('正文') }, truncated: false } },
  }
  const { study, service } = await host(t, research)
  const space = await service.createWorkspace({ name: 'Kubernetes 基础学习', goal: '理解对象', kind: 'topic', materialPath: '' })
  const course = await study.generateCourse(space.id, 'chat-one', new AbortController().signal)
  assert.deepEqual(course.sources.map(source => source.url), ['https://example.com/open'])
  const researchState = (await study.snapshot(space.id)).research
  assert.equal(researchState.used, 3)
  assert.match(researchState.lastError, /blocked by provider/)
})
