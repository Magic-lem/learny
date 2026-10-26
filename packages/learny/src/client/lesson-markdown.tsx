import { Children, isValidElement, type ReactNode } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { FenceView, parseFence } from './fence.tsx'

/** The legacy teaching surfaces use the same inline blocks as native chat. */
export function LessonMarkdown({ children }: { children: string }) {
  return <Markdown remarkPlugins={[remarkGfm]} components={{
    pre({ children, node: _node, ...props }) {
      const code = Children.toArray(children)[0]
      if (isValidElement<{ className?: string; children?: ReactNode }>(code)
        && code.props.className === 'language-learny' && typeof code.props.children === 'string') {
        const payload = parseFence(code.props.children)
        if (payload) return <FenceView payload={payload} />
      }
      return <pre {...props}>{children}</pre>
    },
  }}>{children}</Markdown>
}
