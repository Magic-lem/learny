import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { WebError } from '@deepseek-ai/dsh-web'
import { OneApiSearchProvider } from './provider.ts'
import type { SearchApi, SearchOptions } from './provider.ts'
export { OneApiSearchProvider, mapOneApiResponse, searchEndpoint } from './provider.ts'
export type { SearchApi, SearchOptions } from './provider.ts'

export const name = 'web-search-oneapi'
export const inject = ['web']
export interface Config {
  api: Volatile<SearchApi>
  baseURL: Volatile<string | undefined>
  model: Volatile<string | undefined>
  apiKey: Volatile<string | undefined>
  apiKeyEnv: Volatile<string>
  headersJson: Volatile<string | undefined>
  requestBodyJson: Volatile<string | undefined>
  timeoutMs: Volatile<number>
  maxTokens: Volatile<number>
}
export const Config = Schema.object({
  api: Schema.union(['responses', 'anthropic-messages', 'chat-completions']).default('responses').volatile(),
  baseURL: Schema.string().volatile(),
  model: Schema.string().volatile(),
  apiKey: Schema.string().role('secret').volatile(),
  apiKeyEnv: Schema.string().role('credential-ref').default('ONEAPI_API_KEY').volatile(),
  headersJson: Schema.string().role('secret').volatile(),
  requestBodyJson: Schema.string().volatile(),
  timeoutMs: Schema.number().step(1).min(1000).max(300000).default(60000).volatile(),
  maxTokens: Schema.number().step(1).min(128).max(32768).default(4096).volatile(),
})

function jsonObject(raw: string | undefined, field: string): Record<string, unknown> {
  if (!raw) return {}
  try {
    const value: unknown = JSON.parse(raw)
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  } catch { /* Report configuration without echoing secrets. */ }
  throw new WebError(`${field} must be a JSON object`, 'WEB_PROVIDER_CONFIG_ERROR')
}

export function apply(ctx: Context, config: Config): void {
  ctx.web.registerSearchProvider(new OneApiSearchProvider((): SearchOptions => {
    const environment = launchEnvironmentOf(ctx)
    const ref = credentialRef(config.apiKeyEnv.get())
    const literal = config.apiKey.get()
    const headers = jsonObject(config.headersJson.get(), 'headersJson')
    if (Object.values(headers).some(value => typeof value !== 'string')) {
      throw new WebError('headersJson values must be strings', 'WEB_PROVIDER_CONFIG_ERROR')
    }
    return {
      api: config.api.get(), baseURL: config.baseURL.get() || environment.get('ONEAPI_SEARCH_BASE_URL')?.value || '',
      model: config.model.get() || environment.get('ONEAPI_SEARCH_MODEL')?.value || '',
      apiKey: literal, apiKeyEnv: ref,
      resolveApiKey: async () => {
        const credentials = ctx.get('credentials')
        if (credentials) return (await credentials.resolve(ref))?.value
        return environment.get(ref)?.value
      },
      headers: headers as Record<string, string>, requestBody: jsonObject(config.requestBodyJson.get(), 'requestBodyJson'),
      timeoutMs: config.timeoutMs.get(), maxTokens: config.maxTokens.get(),
    }
  }))
}
