import { z } from 'zod'

export const noteContextSchema = z.object({
  location: z.object({ nodeId: z.string().min(1).max(64), courseVersion: z.string().min(1).max(300), title: z.string().min(1).max(500) }).strict().nullable(),
  source: z.enum(['manual', 'chat']),
  sessionId: z.string().min(1).max(200).optional(),
  messageId: z.string().min(1).max(200).optional(),
  question: z.boolean(),
  organized: z.boolean().optional(),
  review: z.object({ outcome: z.enum(['remembered', 'uncertain']), at: z.iso.datetime() }).strict().optional(),
}).strict()
