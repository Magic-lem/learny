import type { StudyNode } from '../core/study-types.ts'

export interface RouteBox { id: string; x: number; y: number; w: number; h: number }
export interface RouteLink { from: string; to: string; path: string }

/** Exact course dependencies only. Missing parents are not invented from list order. */
export function routeLayout(nodes: StudyNode[], availableWidth: number, fontSize = 13) {
  const width = Math.max(200, availableWidth)
  const byId = new Map(nodes.map(node => [node.id, node]))
  const levels = new Map<string, number>()
  const cyclic = new Set<string>()
  function level(id: string, ancestors: string[] = []): number {
    if (levels.has(id)) return levels.get(id)!
    if (ancestors.includes(id)) {
      ancestors.slice(ancestors.indexOf(id)).forEach(item => cyclic.add(item))
      return 0
    }
    const parent = byId.get(id)?.prerequisite
    const value = parent && byId.has(parent) ? level(parent, [...ancestors, id]) + 1 : 0
    levels.set(id, value)
    return value
  }
  nodes.forEach(node => level(node.id))
  const sorted = [...nodes].sort((a, b) => levels.get(a.id)! - levels.get(b.id)!)
  const compact = width < 560
  const boxes: RouteBox[] = []
  let y = 12
  for (const depth of [...new Set(sorted.map(node => levels.get(node.id)!))]) {
    const row = sorted.filter(node => levels.get(node.id) === depth)
    const perRow = compact ? 1 : Math.max(1, Math.floor((width - 16) / 240))
    for (let start = 0; start < row.length; start += perRow) {
      const part = row.slice(start, start + perRow)
      const w = compact ? Math.min(280, width - 64) : Math.min(264, (width - 24 - (part.length - 1) * 28) / part.length)
      const heights = part.map(node => {
        // Conservative estimate retains readable type for long CJK titles.
        const units = [...node.title].reduce((n, c) => n + (/[^\u0000-\u00ff]/.test(c) ? 1 : .56), 0)
        return Math.max(80, 24 + fontSize * 1.8 + Math.ceil(units / Math.max(1, (w - 24) / fontSize)) * fontSize * 1.65)
      })
      part.forEach((node, index) => boxes.push({
        id: node.id, x: (width - part.length * w - (part.length - 1) * 28) / 2 + index * (w + 28),
        y, w, h: heights[index],
      }))
      y += Math.max(...heights) + 36
    }
  }
  const links: RouteLink[] = []
  for (const node of nodes) {
    if (!node.prerequisite || cyclic.has(node.id) || cyclic.has(node.prerequisite)) continue
    const parent = boxes.find(box => box.id === node.prerequisite), child = boxes.find(box => box.id === node.id)
    if (!parent || !child) continue
    const sx = parent.x + parent.w / 2, sy = parent.y + parent.h, tx = child.x + child.w / 2, ty = child.y
    // Skipped vertical siblings get their own left-side lane.
    const lane = 10 + (links.length % 3) * 6
    const path = compact && ty - sy > 48
      ? `M ${parent.x} ${parent.y + parent.h / 2} H ${lane} V ${child.y + child.h / 2} H ${child.x}`
      : `M ${sx} ${sy} C ${sx} ${(sy + ty) / 2}, ${tx} ${(sy + ty) / 2}, ${tx} ${ty}`
    links.push({ from: parent.id, to: child.id, path })
  }
  return { width, height: Math.max(80, y - 16), boxes, links, cyclic: [...cyclic] }
}
