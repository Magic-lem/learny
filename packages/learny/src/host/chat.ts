import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { Session } from '@deepseek-ai/dsh-session'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ChatGateway } from '../core/study-types.ts'

/** The host service the web app itself uses to admit a prompt into a session. */
interface SessionPrompter {
  prompt(request: { requestId: string; sessionId: string; mode: 'queue' | 'steer'; content: readonly { type: 'text'; text: string }[] }, signal: AbortSignal): Promise<unknown>
}

/**
 * Admit a learner's question into the dsh chat, so the answer appears in the
 * conversation the learner already reads — instead of only inside Learny's panel.
 * The chat's own agent answers with the session's context and tools; the caller
 * carries whatever instruction constrains the answer.
 */
export class DshChatGateway implements ChatGateway {
  constructor(private ctx: Context) {}

  async message(request: { sessionId: string; messageId: string }): Promise<{ content: string; requestIds: string[] } | null> {
    const session = await this.ctx.typert.lookups.get('session')?.resolve(SessionId(request.sessionId))
    if (!(session instanceof Session)) return null
    const requestIds: string[] = []
    for (const event of session.snapshotEvents()) {
      if (event.type === 'user/message') {
        const rpcId = (event.data as { source?: { rpcId?: string } }).source?.rpcId
        if (rpcId) requestIds.unshift(rpcId)
      }
      if (event.type !== 'assistant/message') continue
      const message = (event.data as { message?: { id?: string; content?: readonly { type?: string; text?: string }[] } }).message
      if (message?.id === request.messageId) return { content: (message.content ?? []).filter(part => part.type === 'text' && typeof part.text === 'string').map(part => part.text!).join(''), requestIds }
    }
    return null
  }

  async ask(request: { sessionId: string; text: string }, signal: AbortSignal): Promise<string> {
    signal.throwIfAborted()
    const controller = this.ctx.get('sessionController') as SessionPrompter | undefined
    if (typeof controller?.prompt !== 'function') {
      throw new Error('当前 dsh 宿主没有暴露会话 prompt 接口，无法把问题发进对话；可以改用「就地追问」。')
    }
    const requestId = randomUUID()
    await controller.prompt({
      // The admitted user message keeps this id in its source, which is how the
      // reply is matched back to the question.
      requestId,
      sessionId: request.sessionId,
      mode: 'queue',
      content: [{ type: 'text', text: request.text }],
    }, signal)
    return requestId
  }

  /**
   * The chat's answer to one admitted request: every assistant message in that
   * turn, joined. A turn can emit more than one assistant message (a preamble,
   * then the body after a tool call), and the lesson's fences live in the body —
   * returning only the first message silently loses them. The turn ends at the
   * next `user/message` or `turn/end`, whichever the log reaches first.
   */
  async answer(request: { sessionId: string; requestId: string }): Promise<string | null> {
    const session = await this.ctx.typert.lookups.get('session')?.resolve(SessionId(request.sessionId))
    if (!(session instanceof Session)) return null
    const events = session.snapshotEvents()
    let asked = false
    const parts: string[] = []
    for (const event of events) {
      if (event.type === 'user/message') {
        const source = (event.data as { source?: { rpcId?: string } }).source
        if (source?.rpcId === request.requestId) asked = true
        else if (asked) break
        continue
      }
      if (!asked) continue
      if (event.type === 'turn/end') { if (parts.length) break; continue }
      if (event.type !== 'assistant/message') continue
      const content = (event.data as { message?: { content?: readonly { type?: string; text?: string }[] } }).message?.content ?? []
      const text = content.filter(part => part.type === 'text' && typeof part.text === 'string').map(part => part.text!).join('')
      if (text.trim()) parts.push(text)
    }
    return parts.length ? parts.join('\n\n') : null
  }
}
