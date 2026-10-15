import type { Context } from '@deepseek-ai/cordis'
import { BlockAssembler, createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { ContextFormed, GenerateOptions } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { Session } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-typert-registry'
import type {} from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-api-session-controller/types'
import type { ModelGateway, ModelRequest } from '../core/study-types.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap { learny: { kind: 'learny' } & ContextFormed }
}
export interface ModelConfig { timeoutMs: number; maxOutputTokens: number }

/**
 * Append one short line to the session log, but only when the session already has its
 * protected first surface message. Appending before that makes the notice the session
 * first surface event and corrupts the log (resume then fails with "system/message
 * requires a protected first surface head"), so a session where the learner has not
 * spoken yet simply carries no notice.
 */
function notice(session: Session, summary: string, text: string): void {
  if (!session.snapshotEvents().some(event => event.type === 'system/message')) return
  session.append('user/message', createUserMessage({ source: { kind: 'learny', form: 'notice', summary }, content: [{ type: 'text', text }] }), { surfaceOp: 'append' })
}

/** What each auxiliary request is doing, in the words the learner reads in the chat. */
const REQUEST_ACTIONS: Record<ModelRequest['kind'], string> = {
  course: '规划学习路线', lesson: '编写本节讲解', followup: '回答追问',
  evaluation: '评价本次提交', notes: '整理笔记', tutor: '回答导师对话',
}

/** Learny consumes the Host model capability; no credentials or provider HTTP here. */
export class DshModelGateway implements ModelGateway {
  private lifetime = new AbortController()
  private active = new Set<Promise<string>>()
  constructor(private ctx: Context, private config: ModelConfig) {}
  generate(request: ModelRequest, signal: AbortSignal): Promise<string> {
    const call = this.call(request, signal); this.active.add(call)
    void call.then(() => this.active.delete(call), () => this.active.delete(call))
    return call
  }
  private async call(request: ModelRequest, signal: AbortSignal): Promise<string> {
    const session = await this.ctx.typert.lookups.get('session')?.resolve(SessionId(request.sessionId))
    if (!(session instanceof Session)) throw new Error('Open a saved dsh chat before requesting model evaluation.')
    const selection = this.ctx.sessionProjections.stateOf(session, 'modelSelection')
    const selected = selection?.pending ?? selection?.lastUsed
    const route = selected ? { provider:selected.provider, model:selected.model, ...(selected.reasoningEffort===undefined?{}:{reasoningEffort:ReasoningEffortId(selected.reasoningEffort)}) } : this.ctx.agentDefaultModel.currentSelection()
    const messages: GenerateOptions['messages'] = [{role:'user',content:[{type:'text',text:request.payload}]}]
    const options: GenerateOptions = { ...route, system:request.system, messages, maxTokens:this.config.maxOutputTokens,
      sessionId:session.id, signal:AbortSignal.any([signal,this.lifetime.signal,AbortSignal.timeout(this.config.timeoutMs)]) }
    // Mark the turn in the session log, but only with one short line: the learner
    // reads this transcript, and a JSON dump of the whole auxiliary request would
    // both drown it and travel into every later turn as context.
    notice(session, `Learny ${request.kind} 请求`, `Learny 正在${REQUEST_ACTIONS[request.kind]}（${request.runId}）…`)
    if (!await this.ctx.sessions.flush(session)) throw new Error('Model request could not be persisted to the dsh session log.')
    const assembler = new BlockAssembler()
    try {
      for await (const chunk of this.ctx.llm.stream(options)) { options.signal!.throwIfAborted(); assembler.push(chunk) }
      options.signal!.throwIfAborted()
      if (assembler.finish?.kind !== 'stop') throw new Error(`Model request ended: ${assembler.finish?.kind ?? 'missing finish'}`)
      const blocks = assembler.blocks()
      if (blocks.some(block => block.type==='tool-call')) throw new Error('Learny evaluation must not execute tools')
      const text = blocks.filter(block => block.type==='text').map(block => block.text).join('')
      if (!text.trim()) throw new Error('The configured model returned no text')
      notice(session, `Learny ${request.kind} 结果`, `Learny 完成${REQUEST_ACTIONS[request.kind]}（${request.runId}，${text.length} 字）。结果保存在 Learny，不在对话里。`)
      if (!await this.ctx.sessions.flush(session)) throw new Error('Model proposal could not be persisted to the dsh session log.')
      return text
    } catch (error) {
      notice(session, `Learny ${request.kind} 未完成`, `Learny ${REQUEST_ACTIONS[request.kind]}没有完成（${request.runId}），可以重试。`)
      await this.ctx.sessions.flush(session); throw error
    }
  }
  async close(): Promise<void> { this.lifetime.abort(); await Promise.allSettled(this.active) }
}
