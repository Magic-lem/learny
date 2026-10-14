import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
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

  async ask(request: { sessionId: string; text: string }, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    const controller = this.ctx.get('sessionController') as SessionPrompter | undefined
    if (typeof controller?.prompt !== 'function') {
      throw new Error('当前 dsh 宿主没有暴露会话 prompt 接口，无法把问题发进对话；可以改用「就地追问」。')
    }
    await controller.prompt({
      requestId: randomUUID(),
      sessionId: request.sessionId,
      mode: 'queue',
      content: [{ type: 'text', text: request.text }],
    }, signal)
  }
}
