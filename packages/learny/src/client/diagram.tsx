/**
 * 图块的渲染：坐标全部来自 diagram-layout 的纯函数，这里只负责画成 SVG。
 */
import { layoutDiagram, type DiagramSpec } from './diagram-layout.ts'

export function DiagramView({ spec }: { spec: DiagramSpec }) {
  const layout = layoutDiagram(spec)
  const width = Math.ceil(layout.width) + 2
  const height = Math.ceil(layout.height) + 2
  return <figure className="learny-diagram">
    {spec.title && <figcaption>{spec.title}</figcaption>}
    <div className="learny-diagram-canvas">
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={spec.title ?? '结构图'}>
        <defs>
          <marker id="learny-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0.6 L7.4,4 L0,7.4 z" className="learny-diagram-arrow" />
          </marker>
        </defs>
        {layout.edges.map((edge, index) => <g key={index}>
          <path d={edge.d} className="learny-diagram-edge" markerEnd="url(#learny-arrow)" />
          {edge.label && <text x={edge.lx} y={edge.ly} className="learny-diagram-edge-label">{edge.label}</text>}
        </g>)}
        {layout.boxes.map(box => <g key={box.id}>
          <rect x={box.x} y={box.y} width={box.w} height={box.h} rx="8" className="learny-diagram-box" />
          <text x={box.x + box.w / 2} y={box.y + box.h / 2 + (box.group ? -1 : 4)} className="learny-diagram-label">{box.label}</text>
          {box.group && <text x={box.x + box.w / 2} y={box.y + box.h / 2 + 13} className="learny-diagram-group">{box.group}</text>}
        </g>)}
      </svg>
    </div>
  </figure>
}
