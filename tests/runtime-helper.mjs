import { createRequire } from 'node:module'
import { createRuntime } from '../packages/learny/lib/types/host/runtime.js'

const require = createRequire(new URL('../packages/learny/package.json', import.meta.url))
const { Context } = await import(require.resolve('@deepseek-ai/cordis'))
const { default: Storage } = await import(require.resolve('@deepseek-ai/dsh-storage'))

/** Start only the storage capability; no model provider or network request is involved. */
export async function runtime(directory, model, research, options) {
  const ctx = new Context()
  await ctx.plugin(Storage)
  const result = await createRuntime(ctx, directory, 'wal', model, research, options)
  return { ...result, ctx }
}
