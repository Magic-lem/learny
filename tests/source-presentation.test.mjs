import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSourcesBlock, sourceHref } from '../packages/learny/lib/client-types/client/source-block.js'
import { writeLesson, answerFollowUp, fencesIn } from '../packages/learny/lib/types/core/lesson.js'

test('source blocks retain provenance and real locations; malformed payloads remain unrendered', () => {
  const block = { block: 'sources', items: [
    { sourceId: 'project-1', title: 'src/create.go', url: 'file:///repo/src/create.go', note: '创建函数' },
    { sourceId: 'web-1', title: 'Kubernetes 文档', url: 'https://kubernetes.io/docs/' },
  ] }
  assert.deepEqual(parseSourcesBlock(block), block)
  for (const value of [null, {}, { block: 'sources', items: [] }, { block: 'sources', items: [null] },
    { block: 'sources', items: [{ title: ' ' }] }, { block: 'sources', items: [{ title: 'Doc', url: {} }] },
    { block: 'sources', items: [{ title: 'Doc', note: 123 }] }]) assert.equal(parseSourcesBlock(value), null)
  assert.equal(fencesIn('```learny\n' + JSON.stringify(block) + '\n```')[0].kind, 'sources')
})

test('source links allow public web protocols and keep local or unsafe addresses inert', () => {
  assert.equal(sourceHref('https://kubernetes.io/docs/#concepts'), 'https://kubernetes.io/docs/#concepts')
  assert.equal(sourceHref('http://localhost:8080/doc'), 'http://localhost:8080/doc')
  for (const url of [undefined, '', 'file:///repo/create.go', 'javascript:alert(1)', 'data:text/html,x',
    '//example.com', 'https://user:secret@example.com', 'java\nscript:alert(1)', 'not a URL']) {
    assert.equal(sourceHref(url), undefined, String(url))
  }
})

test('chapter and follow-up generation receive original source addresses without changing source IDs', async () => {
  const seen = []
  const content = '## 创建入口\n\n' + '在 `src/create.go` 中，`Create()` 接收请求并校验参数。'.repeat(5)
  const material = [{ id: 'project-1', title: 'src/create.go', url: 'file:///repo/src/create.go', text: 'func Create() {}' }]
  const model = { async generate(request) {
    seen.push(request)
    return JSON.stringify(request.kind === 'lesson' ? { lesson: content } : { answer: content })
  } }
  const node = { id: 'n1', title: '创建入口', criteria: [] }
  const signal = new AbortController().signal
  assert.equal(await writeLesson('P', '理解请求', node, material, model, 's1', signal), content)
  assert.equal(await answerFollowUp('P', '理解请求', node, content, material, '参数如何校验？', model, 's1', signal), content)
  for (const request of seen) assert.deepEqual(JSON.parse(request.payload).material, material)
})
