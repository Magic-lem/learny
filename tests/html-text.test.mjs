import test from 'node:test'
import assert from 'node:assert/strict'
import { htmlToText } from '../packages/learny/lib/types/core/html-text.js'
import { normalizeLessonCitations } from '../packages/learny/lib/types/core/lesson.js'

test('lesson citations keep one form', () => {
  assert.equal(normalizeLessonCitations('Pod 是最小单元 [sourceId:web-1]，也共享网络 [web-2]。'), 'Pod 是最小单元 [web-1]，也共享网络 [web-2]。')
  assert.equal(normalizeLessonCitations('[sourceId: web-3]'), '[web-3]')
})

test('a fetched HTML page becomes readable prose without its markup', () => {
  const html = `<!doctype html><html lang="en"><head><title>Kubernetes</title>
    <style>.nav{color:red}</style><script>window.analytics=1</script></head>
    <body><nav><a href="/">Home</a><a href="/docs/">Docs</a></nav>
    <article><h1>Working with objects</h1>
    <p>Kubernetes objects are <strong>persistent entities</strong>&nbsp;in the cluster.</p>
    <ul><li>spec &amp; status</li><li>namespace scoping</li></ul>
    <p>See <a href="/docs/tasks">tasks</a> for the commands.</p>
    <script>console.log('noise')</script></article>
    <footer>&copy; 2026 The Kubernetes Authors</footer></body></html>`
  const text = htmlToText(html)
  assert.ok(!text.includes('<'), text.slice(0, 120))
  assert.ok(!text.includes('window.analytics'))
  assert.ok(!text.includes('console.log'))
  assert.ok(!text.includes('color:red'))
  assert.match(text, /Working with objects/)
  assert.match(text, /persistent entities in the cluster/)
  assert.match(text, /- spec & status/)
  assert.match(text, /tasks/)          // the article region wins over nav and footer
  assert.ok(text.length < html.length)
})

test('a page without an article region falls back to its body, and limits apply', () => {
  const text = htmlToText('<html><body><div><p>第一段</p><p>第二段</p></div><p>&#36825;&#26159;&#23454;&#20307;</p></body></html>')
  assert.equal(text, '第一段\n\n第二段\n\n这是实体')
  assert.equal(htmlToText('<p>abcdef</p>', 4), 'abcd')
})
