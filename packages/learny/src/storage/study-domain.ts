import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'

// Additive domain: opening M1 never rewrites the existing M0 workspace domain.
// Each aggregate is a single authoritative record (submission, evaluation, or tutor turn).
export const studyDomain = defineDomain({ name: 'learny_study', version: 1, tables: {
  records: domainTable(z.object({ id: z.uuid(), workspaceId: z.uuid(), kind: z.enum(['attempt', 'revision', 'tutor', 'course']), payload: z.string().max(3_000_000) })),
  // Page material Learny already paid to read, keyed by source identity so a
  // re-search reuses it instead of fetching the same text again.
  pages: domainTable(z.object({
    identity: z.string().min(1).max(2000), url: z.string().min(1).max(4000), title: z.string().max(500),
    excerpt: z.string().min(1).max(20_000), sha256: z.string().length(64), fetchedAt: z.iso.datetime(),
    // Absent on rows written before the body format was known; such rows are
    // treated as expired so a changed extraction re-reads the page once.
    format: z.number().int().optional(),
  })),
  // One row per external call (search or page read), written before the call so
  // an interrupted run still counts against the rolling budget.
  calls: domainTable(z.object({
    id: z.uuid(), workspaceId: z.uuid(), kind: z.enum(['search', 'fetch']), target: z.string().max(4000),
    status: z.enum(['pending', 'ok', 'failed']), error: z.string().max(2000).nullable(),
    at: z.iso.datetime(), finishedAt: z.iso.datetime().nullable(),
  })),
  // Written teaching text per node. Kept beside the course rather than inside it
  // so a route stays small and a lesson can be written or rewritten on demand.
  lessons: domainTable(z.object({
    workspaceId: z.uuid(), nodeId: z.string().min(1).max(64), materialKey: z.string().min(1).max(200),
    lesson: z.string().min(1).max(8000), createdAt: z.iso.datetime(),
  })),
  // Follow-up explanations the learner asked for, newest last.
  deep_dives: domainTable(z.object({
    id: z.uuid(), workspaceId: z.uuid(), nodeId: z.string().min(1).max(64),
    question: z.string().min(1).max(2000), answer: z.string().min(1).max(12_000), createdAt: z.iso.datetime(),
  })),
} })
