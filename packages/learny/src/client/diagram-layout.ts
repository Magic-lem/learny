/**
 * 讲解里的结构图/流程图：布局是纯函数，单独放一个模块，方便单测。
 *
 * 不用现成的图表引擎：宿主不渲染 mermaid，而引一个布局引擎要么带 headless 浏览器、
 * 要么把几百 KB 塞进客户端。这里只支持教学最常用的"节点 + 有向边"，用确定性的分层
 * 布局自己算坐标——框的大小由文字算出来，所以不会出现模型手放坐标压字的问题。
 */
export type DiagramNode = { id: string; label: string; group?: string }
export type DiagramEdge = { from: string; to: string; label?: string }
export type DiagramSpec = {
  block: 'diagram'
  title?: string
  /** TB 自上而下（默认），LR 自左向右。 */
  direction?: 'TB' | 'LR'
  nodes: DiagramNode[]
  edges: DiagramEdge[]
}

const NODE_FS = 13
const GROUP_FS = 11
const NODE_H = 40
const PAD_X = 14
const MIN_W = 96
const MAX_W = 260
const GAP = 18
const LAYER_GAP = 56

/** 中文按一个字宽算，西文按 0.56 字宽估算——够用来定框，不需要真实测量。 */
export function textWidth(text: string, size: number): number {
  let units = 0
  for (const ch of text) units += /[\u2e80-\u9fff\uff00-\uffef\u3000-\u303f]/.test(ch) ? 1 : 0.56
  return units * size
}

function nodeWidth(node: DiagramNode): number {
  const label = textWidth(node.label, NODE_FS) + PAD_X * 2
  const group = node.group ? textWidth(node.group, GROUP_FS) + 28 : 0
  return Math.min(MAX_W, Math.max(MIN_W, label, group))
}

export type Box = { id: string; label: string; group?: string; x: number; y: number; w: number; h: number }
export type EdgePath = { d: string; label?: string; lx: number; ly: number }
export type DiagramLayout = { width: number; height: number; boxes: Box[]; edges: EdgePath[] }

/** 给每个节点算层号：有向无环时取最长路径，有环时退化成 BFS 层。 */
function layersOf(nodes: DiagramNode[], edges: DiagramEdge[]): Map<string, number> {
  const ids = new Set(nodes.map(node => node.id))
  const outgoing = new Map<string, string[]>()
  const incoming = new Map<string, string[]>()
  for (const node of nodes) { outgoing.set(node.id, []); incoming.set(node.id, []) }
  for (const edge of edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) continue
    outgoing.get(edge.from)!.push(edge.to)
    incoming.get(edge.to)!.push(edge.from)
  }
  const layers = new Map<string, number>()
  // Kahn 拓扑序推进最长路径；处理不掉的（有环）留到最后按 BFS 补。
  const remaining = new Map([...incoming].map(([id, from]) => [id, from.filter(candidate => ids.has(candidate)).length]))
  const queue = nodes.filter(node => remaining.get(node.id) === 0).map(node => node.id)
  for (const id of queue) layers.set(id, 0)
  let head = 0
  while (head < queue.length) {
    const id = queue[head++]
    for (const next of outgoing.get(id) ?? []) {
      layers.set(next, Math.max(layers.get(next) ?? 0, (layers.get(id) ?? 0) + 1))
      const left = (remaining.get(next) ?? 0) - 1
      remaining.set(next, left)
      if (left === 0) queue.push(next)
    }
  }
  for (const node of nodes) {
    if (layers.has(node.id)) continue
    // 环里的节点：从已有邻居推一层，推不出来就单独一层。
    const parents = (incoming.get(node.id) ?? []).filter(parent => layers.has(parent))
    layers.set(node.id, parents.length ? Math.max(...parents.map(parent => layers.get(parent)!)) + 1 : 0)
  }
  return layers
}

/**
 * 分层布局：同层并排，层间留固定间距，边用三次贝塞尔连到框的中心轴上。
 * 纯函数，输入相同则输出相同，方便单测。
 */
export function layoutDiagram(spec: DiagramSpec): DiagramLayout {
  const direction = spec.direction ?? 'TB'
  const nodes = spec.nodes.filter(node => node.id)
  const byId = new Map(nodes.map(node => [node.id, node]))
  const edges = spec.edges.filter(edge => byId.has(edge.from) && byId.has(edge.to) && edge.from !== edge.to)
  const layers = layersOf(nodes, edges)
  const maxLayer = Math.max(0, ...nodes.map(node => layers.get(node.id) ?? 0))
  const buckets: DiagramNode[][] = Array.from({ length: maxLayer + 1 }, () => [])
  for (const node of nodes) buckets[layers.get(node.id) ?? 0].push(node)

  // 一层内的顺序：先按父节点的平均位置排一遍，减少交叉；没有父节点的保持原始顺序。
  const position = new Map<string, number>()
  buckets.forEach((bucket, index) => {
    if (index > 0) {
      const score = (node: DiagramNode) => {
        const parents = edges.filter(edge => edge.to === node.id).map(edge => position.get(edge.from)).filter((value): value is number => value !== undefined)
        return parents.length ? parents.reduce((total, value) => total + value, 0) / parents.length : Number.MAX_SAFE_INTEGER / 2
      }
      bucket.sort((left, right) => score(left) - score(right))
    }
    bucket.forEach((node, at) => position.set(node.id, at))
  })

  const sizes = new Map(nodes.map(node => [node.id, nodeWidth(node)]))
  const layerSizes = buckets.map(bucket => bucket.reduce((total, node) => total + (sizes.get(node.id) ?? MIN_W), 0) + GAP * Math.max(0, bucket.length - 1))
  const crossMax = Math.max(0, ...layerSizes)
  const mainLength = buckets.length * NODE_H + LAYER_GAP * Math.max(0, buckets.length - 1)
  const boxes: Box[] = []
  buckets.forEach((bucket, index) => {
    let cross = (crossMax - (layerSizes[index] ?? 0)) / 2
    for (const node of bucket) {
      const w = sizes.get(node.id) ?? MIN_W
      const x = direction === 'TB' ? cross : index * (NODE_H + LAYER_GAP)
      const y = direction === 'TB' ? index * (NODE_H + LAYER_GAP) : cross
      boxes.push({
        id: node.id, label: node.label, group: node.group,
        x, y, w: direction === 'TB' ? w : NODE_H, h: direction === 'TB' ? NODE_H : w,
      })
      cross += w + GAP
    }
  })

  const boxById = new Map(boxes.map(box => [box.id, box]))
  const edgePaths: EdgePath[] = []
  for (const edge of edges) {
    const from = boxById.get(edge.from)!
    const to = boxById.get(edge.to)!
    const start = direction === 'TB'
      ? { x: from.x + from.w / 2, y: from.y + from.h }
      : { x: from.x + from.w, y: from.y + from.h / 2 }
    const end = direction === 'TB'
      ? { x: to.x + to.w / 2, y: to.y }
      : { x: to.x, y: to.y + to.h / 2 }
    const d = direction === 'TB'
      ? `M${start.x},${start.y} C${start.x},${start.y + LAYER_GAP / 2} ${end.x},${end.y - LAYER_GAP / 2} ${end.x},${end.y}`
      : `M${start.x},${start.y} C${start.x + LAYER_GAP / 2},${start.y} ${end.x - LAYER_GAP / 2},${end.y} ${end.x},${end.y}`
    edgePaths.push({
      d, label: edge.label,
      lx: (start.x + end.x) / 2, ly: (start.y + end.y) / 2 - 6,
    })
  }
  const width = direction === 'TB' ? crossMax : mainLength
  const height = direction === 'TB' ? mainLength : Math.max(0, ...boxes.map(box => box.y + box.h))
  return { width, height, boxes, edges: edgePaths }
}
