import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import type { learnyDomain } from '../storage/domain.ts'
import { NotesFiles } from '../storage/notes.ts'
import { invalid, notFound } from './errors.ts'
import type { CreateWorkspace, NoteDocument, SaveNote, Snapshot, Workspace } from './types.ts'

function text(value: string, field: string, maximum: number, nonempty = false): string {
  if (value.length > maximum || (nonempty && !value.trim())) invalid(field)
  return value
}

/** API and future agent tools share these durable business actions. */
export class LearningService {
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

  async bindWorkspace(sessionId: string, workspaceId: string): Promise<void> {
    text(sessionId, 'sessionId', 200, true)
    this.workspace(workspaceId)
    await this.domain.table('bindings').put(sessionId, { sessionId, workspaceId })
  }

  async createNote(workspaceId: string, title: string): Promise<NoteDocument> {
    this.workspace(workspaceId)
    return this.notes.create(workspaceId, text(title.trim(), 'title', 120, true))
  }

  async readNote(workspaceId: string, noteId: string): Promise<NoteDocument> {
    this.workspace(workspaceId)
    return this.notes.read(workspaceId, noteId)
  }

  async saveNote(request: SaveNote): Promise<NoteDocument> {
    this.workspace(request.workspaceId)
    text(request.title, 'title', 120, true)
    text(request.content, 'content', 1_000_000)
    return this.notes.save({ ...request, title: request.title.trim() })
  }

  async searchNotes(workspaceId: string, query: string): Promise<import('./types.ts').NoteSummary[]> {
    this.workspace(workspaceId)
    text(query, 'query', 1000)
    const rows = await this.notes.list(workspaceId)
    const documents = await Promise.all(rows.map(row => this.notes.read(workspaceId, row.id)))
    const needle = query.toLocaleLowerCase()
    return documents.filter(note => `${note.title}\n${note.content}`.toLocaleLowerCase().includes(needle)).map(({content: _content, path: _path, ...summary}) => summary)
  }

  async close(): Promise<void> { await this.notes.drain(); await this.domain.close() }
}
