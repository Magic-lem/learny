import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'

/** Authoritative workspace and chat binding records; note bodies remain files. */
export const learnyDomain = defineDomain({
  name: 'learny',
  version: 1,
  tables: {
    workspaces: domainTable(z.object({
      id: z.uuid(), name: z.string().min(1).max(120), goal: z.string().max(5000),
      kind: z.enum(['project', 'topic']), materialPath: z.string(), createdAt: z.iso.datetime(),
    })),
    bindings: domainTable(z.object({ sessionId: z.string().min(1).max(200), workspaceId: z.uuid() })),
  },
})
