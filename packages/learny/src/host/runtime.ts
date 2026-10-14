import { resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { SqliteStorageBackend } from '@deepseek-ai/dsh-storage-sqlite'
import type { JournalMode } from '@deepseek-ai/dsh-storage-sqlite'
import { StudyService } from '../core/study.ts'
import type { StudyServiceOptions } from '../core/study.ts'
import { DshChatGateway } from './chat.ts'
import { studyDomain } from '../storage/study-domain.ts'
import type { ModelGateway } from '../core/study-types.ts'
import type { ResearchGateway } from '../core/study-types.ts'
import { learnyDomain } from '../storage/domain.ts'
import { NotesFiles } from '../storage/notes.ts'
import { LearningService } from '../core/service.ts'

/** Own a dedicated backend without replacing the host's default storage routes. */
export async function createRuntime(ctx: Context, dataDir: string, journalMode: JournalMode, model: ModelGateway = { generate: async () => { throw new Error('dsh model is not configured') }, close: async () => {} }, research?: ResearchGateway, options: StudyServiceOptions = {}): Promise<{ service: LearningService; study: StudyService; close: () => Promise<void> }> {
  const backend = new SqliteStorageBackend({ path: resolve(dataDir, 'learny.sqlite'), journalMode })
  const unregister = ctx.storage.backend.register('learny-sqlite', backend)
  try {
    const facility = new DomainFacility(ctx, { backend: 'learny-sqlite' })
    const domain = await facility.open(learnyDomain)
    const service = new LearningService(domain, new NotesFiles(resolve(dataDir)))
    const study = new StudyService(await facility.open(studyDomain), service, model, research ?? (ctx as Context & { web?: ResearchGateway }).web,
      { chat: new DshChatGateway(ctx), ...options })
    await study.initialize()
    let closing: Promise<void> | undefined
    return { service, study, close: () => closing ??= (async () => { await study.close(); await service.close(); unregister(); await backend.close() })() }
  } catch (error) {
    unregister()
    await backend.close()
    throw error
  }
}
