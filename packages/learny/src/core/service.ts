import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import type { learnyDomain } from '../storage/domain.ts'
import { NotesFiles } from '../storage/notes.ts'
import { invalid, notFound } from './errors.ts'
import { z } from 'zod'
import { noteContextSchema } from './note-context.ts'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { NoteContext } from './types.ts'
import type { CreateWorkspace, UpdateWorkspace, NoteDocument, SaveNote, Snapshot, Workspace } from './types.ts'

function text(value: string, field: string, maximum: number, nonempty = false): string {
  if (value.length > maximum || (nonempty && !value.trim())) invalid(field)
  return value
}

/** API and future agent tools share these durable business actions. */
export class LearningService {
  private captures = new Map<string, Promise<NoteDocument>>()
  private workspaceUpdates = new Map<string, Promise<void>>()
  constructor(private readonly domain: Domain<typeof learnyDomain>, private readonly notes: NotesFiles) {}

  workspace(id: string): Workspace {
    return this.domain.table('workspaces').get(id) ?? notFound(id)
  }

  async snapshot(sessionId: string): Promise<Snapshot> {
    text(sessionId, 'sessionId', 200, true)
    const workspaceId = this.domain.table('bindings').get(sessionId)?.workspaceId ?? null
    return {
      workspaces: [...this.domain.table('workspaces').entries()].map(([, row]) => row),
      workspaceId,
      notes: workspaceId === null ? [] : await this.notes.list(this.workspace(workspaceId).id),
    }
  }

  async createWorkspace(request: CreateWorkspace): Promise<Workspace> {
    text(request.name, 'name', 120, true)
    text(request.goal, 'goal', 5000)
    text(request.materialPath, 'materialPath', 4096)
    if (request.kind !== 'project' && request.kind !== 'topic') invalid('kind')
    if (request.kind === 'project') {
      if (!isAbsolute(request.materialPath) || !(await stat(request.materialPath)).isDirectory()) invalid('materialPath')
    }
    const record: Workspace = { ...request, name: request.name.trim(), id: randomUUID(), createdAt: new Date().toISOString() }
    await this.domain.table('workspaces').put(record.id, record)
    return record
  }

  async updateWorkspace(request: UpdateWorkspace): Promise<Workspace> {
    const name = text(request.name, 'name', 120, true).trim()
    const goal = text(request.goal, 'goal', 5000)
    const previous = this.workspaceUpdates.get(request.workspaceId) ?? Promise.resolve()
    const operation = previous.then(async () => {
      const current = this.workspace(request.workspaceId)
      if (current.name !== request.expected.name || current.goal !== request.expected.goal) {
        throw new RemoteError('learny/workspace-conflict', 'Space settings changed; reload before saving', { workspaceId: current.id })
      }
      const next: Workspace = { ...current, name, goal }
      await this.domain.table('workspaces').put(next.id, next)
      return next
    })
    const tail = operation.then(() => {}, () => {})
    this.workspaceUpdates.set(request.workspaceId, tail)
    void tail.then(() => { if (this.workspaceUpdates.get(request.workspaceId) === tail) this.workspaceUpdates.delete(request.workspaceId) })
    return operation
  }

  async bindWorkspace(sessionId: string, workspaceId: string): Promise<void> {
    text(sessionId, 'sessionId', 200, true)
    this.workspace(workspaceId)
    await this.domain.table('bindings').put(sessionId, { sessionId, workspaceId })
  }

  async createNote(workspaceId: string, title: string): Promise<NoteDocument> {
    this.workspace(workspaceId)
    return this.notes.create(workspaceId, text(title.trim(), 'title', 120, true))
  }

  /** Stable caller id makes retrying a timed-out capture safe; conflicts never overwrite an existing file. */
  async captureNote(workspaceId: string, captureId: string, content: string, context: NoteContext, suggestedTitle?: string): Promise<NoteDocument> {
    this.workspace(workspaceId)
    if (!z.uuid().safeParse(captureId).success) invalid('capture id')
    text(content, 'content', 1_000_000, true)
    const parsed = noteContextSchema.parse(context)
    const key = `${workspaceId}/${captureId}`
    const active = this.captures.get(key)
    if (active) {
      await active
      return this.captureNote(workspaceId, captureId, content, parsed)
    }
    const operation = (async () => {
      try {
        const old = await this.notes.read(workspaceId, captureId)
        if (old.content !== content || JSON.stringify(old.context) !== JSON.stringify(parsed)) invalid('capture id reuse')
        return old
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'learny/not-found')) throw error
      }
      const title = [...(suggestedTitle ?? content.trim().split(/\r?\n/)[0]!.replace(/^\s*#+\s*/, ''))].slice(0, 60).join('')
      return this.notes.create(workspaceId, title || '随手记', content, parsed, captureId)
    })()
    this.captures.set(key, operation)
    try { return await operation } finally { this.captures.delete(key) }
  }

  async readNote(workspaceId: string, noteId: string): Promise<NoteDocument> {
    this.workspace(workspaceId)
    return this.notes.read(workspaceId, noteId)
  }

  async saveNote(request: SaveNote): Promise<NoteDocument> {
    this.workspace(request.workspaceId)
    text(request.title, 'title', 120, true)
    text(request.content, 'content', 1_000_000)
    if (request.context) noteContextSchema.parse(request.context)
    return this.notes.save({ ...request, title: request.title.trim() })
  }

  async searchNotes(workspaceId: string, query: string): Promise<import('./types.ts').NoteSummary[]> {
    this.workspace(workspaceId)
    text(query, 'query', 1000)
    const rows = await this.notes.list(workspaceId)
    const documents = await Promise.all(rows.map(row => this.notes.read(workspaceId, row.id)))
    const needle = query.toLocaleLowerCase()
    return documents.filter(note => `${note.title}\n${note.content}`.toLocaleLowerCase().includes(needle)).map(({content, path: _path, ...summary}) => ({ ...summary, excerpt: content.slice(0, 240) }))
  }

  async close(): Promise<void> { await Promise.allSettled([...this.captures.values(), ...this.workspaceUpdates.values()]); await this.notes.drain(); await this.domain.close() }
}
