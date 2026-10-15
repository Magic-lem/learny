/**
 * 宿主在 window.__ModuleLoader__ 的 staticModules 里提供了 react-dom / react-dom/client，
 * 客户端打包也把这两个标成 external（见 scripts/build.mjs），所以运行时一定拿得到。
 * 仓库没有安装 react-dom 的类型包，这里只声明我们用到的这一小块，
 * 避免为了把 React 挂到外部 DOM 节点上而多引一份完整依赖。
 */
declare module 'react-dom/client' {
  import type { ReactNode } from 'react'
  export interface Root {
    render(children: ReactNode): void
    unmount(): void
  }
  export function createRoot(container: Element | DocumentFragment): Root
}
