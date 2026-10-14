import { randomUUID } from 'node:crypto'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import type { studyDomain } from '../storage/study-domain.ts'
import type { CachedPage, ResearchBookkeeping, ResearchCallKind, ResearchSummary } from './study-types.ts'

/**
 * Stable token the client matches on to explain a spent budget instead of
 * showing a provider failure. Kept in the message because RPC errors cross the
 * host boundary as text.
 */
export const RESEARCH_BUDGET_MARKER = 'LEARNY_RESEARCH_BUDGET'

const WINDOW_MS = 24 * 3600 * 1000
/**
 * Shape of the stored page body. Bump it when extraction changes so cached rows
 * written by the previous shape are re-read once instead of being trusted.
 */
export const PAGE_CACHE_FORMAT = 2

/** A call Learny pays for that the budget refuses is not a provider failure. */
export class ResearchBudgetError extends Error {
  constructor(readonly used: number, readonly limit: number) {
    super(`${RESEARCH_BUDGET_MARKER}: 最近 24 小时的外部资料调用已达上限（${used}/${limit}）。已读过的资料仍会复用，请稍后再试或调高插件配置的每日上限。`)
    this.name = 'ResearchBudgetError'
  }
}

export interface ResearchLedgerLimits {
  /** External calls (search + page reads) allowed per rolling 24 hours. */
  dailyCallBudget: number
  /** How long a read page stays reusable before it is read again. */
  pageCacheTtlMs: number
}

/**
 * Durable bookkeeping for the calls a topic route pays for: a page that was
 * already read is reused instead of fetched again, every attempted call is
 * recorded before it happens, and the rolling budget stops the run before the
 * day's allowance is spent. Reading the cache never costs anything.
 */
export class ResearchLedger implements ResearchBookkeeping {
  constructor(private domain: Domain<typeof studyDomain>, private limits: ResearchLedgerLimits, private now: () => number = Date.now) {}

  cachedPage(identity: string): CachedPage | null {
    const page = this.domain.table('pages').get(identity)
    if (!page) return null
    if (page.format !== PAGE_CACHE_FORMAT) return null
    const age = this.now() - Date.parse(page.fetchedAt)
    if (!Number.isFinite(age) || age > this.limits.pageCacheTtlMs) return null
    return page
  }

  async rememberPage(page: CachedPage): Promise<void> {
    await this.domain.table('pages').put(page.identity, page)
  }

  /** Record the call first, then check the budget: a crash mid-call still counts. */
  async begin(workspaceId: string, kind: ResearchCallKind, target: string): Promise<string> {
    const used = this.used(workspaceId)
    if (used >= this.limits.dailyCallBudget) throw new ResearchBudgetError(used, this.limits.dailyCallBudget)
    const id = randomUUID()
    await this.domain.table('calls').put(id, { id, workspaceId, kind, target: target.slice(0, 4000),
      status: 'pending', error: null, at: new Date(this.now()).toISOString(), finishedAt: null })
    return id
  }

  async finish(callId: string, status: 'ok' | 'failed', error?: string): Promise<void> {
    const call = this.domain.table('calls').get(callId)
    if (!call) return
    await this.domain.table('calls').put(callId, { ...call, status, error: error ? error.slice(0, 2000) : null,
      finishedAt: new Date(this.now()).toISOString() })
  }

  summary(workspaceId: string): ResearchSummary {
    const calls = this.calls(workspaceId)
    return { used: calls.length, limit: this.limits.dailyCallBudget,
      lastError: [...calls].reverse().find(call => call.status === 'failed')?.error ?? null }
  }

  private calls(workspaceId: string) {
    const since = this.now() - WINDOW_MS
    return [...this.domain.table('calls').entries()].map(([, call]) => call)
      .filter(call => call.workspaceId === workspaceId && Date.parse(call.at) >= since)
      .sort((a, b) => a.at.localeCompare(b.at))
  }

  /** Every recorded attempt counts, including one whose outcome is unknown. */
  private used(workspaceId: string): number {
    return this.calls(workspaceId).length
  }
}
