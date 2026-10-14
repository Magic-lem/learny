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
    // Use an ordinary typed context message: third-party non-surface event append
    // cannot set an ignorable envelope in rc.2. This keeps logs resumable and the
    // exact auxiliary request reconstructable without introducing an unknown event.
    session.append('user/message', createUserMessage({source:{kind:'learny',form:'notice',summary:`Learny ${request.kind} request`},
      content:[{type:'text',text:JSON.stringify({runId:request.runId,kind:request.kind,route,system:request.system,messages,maxTokens:this.config.maxOutputTokens})}]}), {surfaceOp:'append'})
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
      session.append('user/message',createUserMessage({source:{kind:'learny',form:'notice',summary:`Learny ${request.kind} model proposal`},
        content:[{type:'text',text:JSON.stringify({runId:request.runId,kind:request.kind,route,output:text})}]}),{surfaceOp:'append'})
      if (!await this.ctx.sessions.flush(session)) throw new Error('Model proposal could not be persisted to the dsh session log.')
      return text
    } catch (error) {
      session.append('user/message',createUserMessage({source:{kind:'learny',form:'notice',summary:'Learny model request interrupted or failed'},
        content:[{type:'text',text:JSON.stringify({runId:request.runId,kind:request.kind,status:options.signal!.aborted?'interrupted':'failed'})}]}),{surfaceOp:'append'})
      await this.ctx.sessions.flush(session); throw error
    }
  }
  async close(): Promise<void> { this.lifetime.abort(); await Promise.allSettled(this.active) }
}
