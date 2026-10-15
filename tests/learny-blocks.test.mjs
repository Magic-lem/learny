import test from 'node:test'
import assert from 'node:assert/strict'
import { textWidth, layoutDiagram } from '../packages/learny/lib/client-types/client/diagram-layout.js'
import { fencesIn } from '../packages/learny/lib/types/core/lesson.js'

const spec = (over = {}) => ({
  block: 'diagram',
  nodes: [
    { id: 'a', label: 'API Server', group: '控制平面' },
    { id: 'b', label: 'kubelet', group: '工作节点' },
    { id: 'c', label: '容器运行时' },
  ],
  edges: [{ from: 'a', to: 'b', label: '下发规格' }, { from: 'b', to: 'c' }],
  ...over,
})

test('a diagram lays out in layers that follow the edges, and the layout is deterministic', () => {
  const layout = layoutDiagram(spec())
  const box = (id) => layout.boxes.find(item => item.id === id)
  assert.ok(box('a').y < box('b').y && box('b').y < box('c').y, '每一层比它的上游低一层')
  assert.deepEqual(layout, layoutDiagram(spec()), '同样的输入给出同样的坐标')
  assert.equal(layout.edges.length, 2)
})

test('boxes never overlap, whatever the labels are', () => {
  const layout = layoutDiagram(spec({ nodes: [
    { id: 'a', label: '一个非常非常长的中文节点名字用来撑开这个框' },
    { id: 'b', label: 'b' },
    { id: 'c', label: 'c' },
    { id: 'd', label: 'd' },
  ], edges: [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }, { from: 'a', to: 'd' }] }))
  const boxes = layout.boxes
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const left = boxes[i], right = boxes[j]
      const apart = left.x + left.w <= right.x || right.x + right.w <= left.x
        || left.y + left.h <= right.y || right.y + right.h <= left.y
      assert.ok(apart, `${left.id} 与 ${right.id} 不该叠在一起`)
    }
  }
})

test('a cycle still gets a drawable layout instead of throwing', () => {
  const layout = layoutDiagram(spec({ nodes: [
    { id: 'a', label: 'a' }, { id: 'b', label: 'b' },
  ], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }] }))
  assert.equal(layout.boxes.length, 2)
  assert.ok(layout.width > 0 && layout.height > 0)
})

test('edges pointing at unknown nodes are dropped rather than drawn to nowhere', () => {
  const layout = layoutDiagram(spec({ edges: [{ from: 'a', to: 'missing' }, { from: 'a', to: 'b' }] }))
  assert.equal(layout.edges.length, 1)
})

test('CJK labels measure wider than latin ones of the same length', () => {
  assert.ok(textWidth('控制平面', 13) > textWidth('abcd', 13))
})

test('only parsable learny fences are recovered from a lesson', () => {
  const lesson = [
    '先看这一节的结构。',
    '```learny',
    '{"block":"diagram","nodes":[{"id":"a","label":"API Server"}],"edges":[]}',
    '```',
    '然后是自测：',
    '```learny',
    '{"block":"quiz","questions":[{"q":"问题","options":["A","B"],"answer":0}]}',
    '```',
    '写坏的那种不该被回收：',
    '```learny',
    '{"block":',
    '```',
    '别的语言也不管：',
    '```js',
    'console.log("nope")',
    '```',
  ].join('\n')
  const found = fencesIn(lesson)
  assert.deepEqual(found.map(item => item.kind), ['diagram', 'quiz'])
})

test('a fence without a block field is left alone', () => {
  assert.deepEqual(fencesIn('```learny\n{"title":"没有 block"}\n```'), [])
})
