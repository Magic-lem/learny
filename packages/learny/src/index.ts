import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { createRuntime } from './host/runtime.ts'
import { DshModelGateway } from './host/model.ts'
import { LearnyController } from './host/controller.ts'
export { LearnyController } from './host/controller.ts'
export type * from './core/types.ts'
export type {} from './core/errors.ts'

export const name = 'learny'
export const inject = ['storage', 'llm', 'sessions', 'agentDefaultModel', 'typert', 'sessionProjections', 'web']

export interface Config {
  dataDir: string; journalMode: 'wal' | 'delete' | 'truncate' | 'persist'; timeoutMs: number; maxOutputTokens: number;
  /** External calls (one search plus one read per source) a workspace may make per rolling 24 hours. */
  researchDailyCallBudget: number;
  /** How many days a page Learny already read stays reusable before it is read again. */
  researchPageCacheTtlDays: number;
}
export const Config: Schema<Config> = Schema.object({
  dataDir: Schema.string().required(),
  timeoutMs: Schema.number().min(1000).max(300000).default(60000),
  // Route planning plus the per-node teaching pass: 4096 was tight once a route
  // carried briefings and reading points, and the model answered with max-tokens.
  maxOutputTokens: Schema.number().min(512).max(32768).default(8192),
  journalMode: Schema.union(['wal', 'delete', 'truncate', 'persist']).default('wal'),
  researchDailyCallBudget: Schema.number().min(3).max(10000).default(60),
  researchPageCacheTtlDays: Schema.number().min(0).max(3650).default(30),
})

/** Mount durable local state and release it with the plugin lifetime. */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const runtime = await createRuntime(ctx, config.dataDir, config.journalMode, new DshModelGateway(ctx, config), undefined, {
    researchDailyCallBudget: config.researchDailyCallBudget, researchPageCacheTtlDays: config.researchPageCacheTtlDays,
  })
  ctx.effect(() => runtime.close)
  ctx.plugin(LearnyController, runtime)
}
