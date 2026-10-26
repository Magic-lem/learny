import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import remote from 'dsh-plugin-learny/remote'
import { MessageCapture } from './message-capture.tsx'
import type { MessageId } from '@deepseek-ai/dsh-llm/brand'
import { LearnyBody } from './notebook.tsx'
import { installFenceRenderer } from './fence.tsx'
import { zh, en } from './locales.ts'
import styles from './style.css'

// Public dsh 0.2.0-rc.2 chat slot contract (owner: AssistantActionOwnerProps).
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'conversation.chat.assistant-actions': { kind: 'list'; scope: 'session'; owner: { messageId: MessageId } }
  }
}

export const name = 'learny-client'
export const inject = ['remote', 'locale', 'slots', 'sidebarRightTabs']

/** Mount the generated API before registering a body that consumes it. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.remote.$mount(remote))
  ctx.effect(() => ctx.locale.register('learny', { zh, en }))
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = 'dsh-plugin-learny'
    style.textContent = styles
    document.head.append(style)
    return () => style.remove()
  })
  // 讲解里的围栏块（自测、要点）要在对话正文里就地渲染：宿主没有围栏扩展点，
  // 只能挂一个 DOM 通道。它独立于右侧面板，装在就生效。
  ctx.effect(() => {
    const stop = installFenceRenderer()
    return () => stop()
  })
  ctx.inject(['remote.learny', 'uiWorkspace', 'sidebarRight'], ctx => {
    const t = ctx.locale.bind('learny')
    ctx.effect(() => ctx.sidebarRightTabs.register({
      id: 'dsh-plugin-learny', kind: 'learny', title: () => t('title'),
      guide: [{ id: 'learny', order: 5, title: () => t('title'), description: () => t('description') }],
    }))
    const Capture = (props: PropsRuntime<'conversation.chat.assistant-actions'> & PropsLocale<'learny'>) =>
      <MessageCapture sessionId={props.sessionId} messageId={props.messageId} api={ctx.remote.learny} t={props.t} />
    ctx.effect(() => ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register(
      { name: 'conversation.chat.assistant-actions', id: 'learny-capture', locale: 'learny' }, Capture,
    )))
    const subscribeReset = (listener: () => void) => ctx.on('connection/reset', listener)
    // Public host services; structural typing avoids bundling a second UI package.
    const navigation = ctx as unknown as {
      uiWorkspace: { openSession: (id: string) => void }
      sidebarRight: { isExpanded: () => boolean; toggleExpanded: () => void }
    }
    const onOpenChat = (id: string) => {
      navigation.uiWorkspace.openSession(id)
      if (navigation.sidebarRight.isExpanded()) navigation.sidebarRight.toggleExpanded()
    }
    const Body = (props: PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<'learny'>) =>
      <LearnyBody {...props} api={ctx.remote.learny} subscribeReset={subscribeReset} onOpenChat={onOpenChat} />
    ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
      { name: 'sidebar.right.pane.tab', key: 'dsh-plugin-learny', locale: 'learny' }, Body,
    )))
  })
}
