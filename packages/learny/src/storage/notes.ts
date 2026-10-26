import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, open, rename, unlink, lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { invalid, notFound } from '../core/errors.ts'
import { noteContextSchema } from '../core/note-context.ts'
import type { NoteContext, NoteDocument, NoteSummary, SaveNote } from '../core/types.ts'

interface Metadata {
  id: string
  workspaceId: string
  title: string
  createdAt: string
  updatedAt: string
  context?: NoteContext
}

/** Filename ids never come from note titles or arbitrary filesystem paths. */
function id(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) invalid('id')
  return value
}

function hash(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}

/** Write a complete file, sync its bytes, then atomically replace the destination. */
async function atomicWrite(path: string, content: string): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`
  const file = await open(temporary, 'wx', 0o600)
  try {
    try {
      await file.writeFile(content, 'utf8')
      await file.sync()
    } finally {
      await file.close()
    }
    await rename(temporary, path)
  } finally {
    await unlink(temporary).catch(error => { if (!isCode(error, 'ENOENT')) throw error })
  }
}

function encode(meta: Metadata, body: string): string {
  return `---\nlearny: ${JSON.stringify(meta)}\n---\n\n${body}`
}

/** Readable JSON in YAML frontmatter keeps ids stable while the body is edited externally. */
function decode(raw: string, path: string, workspaceId: string, noteId: string): NoteDocument {
  const match = /^---\r?\nlearny: (.+)\r?\n---\r?\n\r?\n/.exec(raw)
  if (!match?.[1]) invalid('note frontmatter')
  const meta: unknown = JSON.parse(match[1])
  if (!meta || typeof meta !== 'object'
    || !('id' in meta) || meta.id !== noteId
    || !('workspaceId' in meta) || meta.workspaceId !== workspaceId
    || !('title' in meta) || typeof meta.title !== 'string'
    || !('createdAt' in meta) || typeof meta.createdAt !== 'string'
    || !('updatedAt' in meta) || typeof meta.updatedAt !== 'string') invalid('note frontmatter')
  return {
    id: noteId, workspaceId, title: meta.title, createdAt: meta.createdAt, updatedAt: meta.updatedAt,
    context: 'context' in meta && meta.context !== undefined ? noteContextSchema.parse(meta.context) : undefined,
    version: hash(raw), path, content: raw.slice(match[0].length),
  }
}

/** Local Markdown bodies and revision snapshots, serialized per note. */
export class NotesFiles {
  private readonly queues = new Map<string, Promise<void>>()

  constructor(private readonly root: string) {}

  private directory(workspaceId: string): string { return join(this.root, 'notes', id(workspaceId)) }
  private path(workspaceId: string, noteId: string): string { return join(this.directory(workspaceId), `${id(noteId)}.md`) }

  async list(workspaceId: string): Promise<NoteSummary[]> {
    const directory = this.directory(workspaceId)
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const entries = await readdir(directory)
    const notes = await Promise.all(entries.filter(name => /^[0-9a-f-]{36}\.md$/i.test(name))
      .map(name => this.read(workspaceId, name.slice(0, -3))))
    return notes.map(({ content, path: _path, ...summary }) => ({ ...summary, excerpt: content.slice(0, 240) }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async read(workspaceId: string, noteId: string): Promise<NoteDocument> {
    const path = this.path(workspaceId, noteId)
    try {
      const info = await lstat(path)
      if (!info.isFile()) invalid('note file')
      return decode(await readFile(path, 'utf8'), path, workspaceId, noteId)
    } catch (error) {
      if (isCode(error, 'ENOENT')) notFound(noteId)
      throw error
    }
  }

  async create(workspaceId: string, title: string, content = '', context?: NoteContext, noteId: string = randomUUID()): Promise<NoteDocument> {
    id(noteId)
    const now = new Date().toISOString()
    await mkdir(this.directory(workspaceId), { recursive: true, mode: 0o700 })
    await atomicWrite(this.path(workspaceId, noteId), encode({ id: noteId, workspaceId, title, createdAt: now, updatedAt: now, context }, content))
    return this.read(workspaceId, noteId)
  }

  async save(request: SaveNote): Promise<NoteDocument> {
    const key = `${request.workspaceId}/${request.noteId}`
    const previous = this.queues.get(key) ?? Promise.resolve()
    const operation = previous.then(async () => {
      const current = await this.read(request.workspaceId, request.noteId)
      if (current.version !== request.expectedVersion) {
        throw new RemoteError('learny/conflict', 'Note changed; reload or keep your draft before merging', { noteId: request.noteId })
      }
      const revisions = join(this.root, 'revisions', id(request.workspaceId), id(request.noteId))
      await mkdir(revisions, { recursive: true, mode: 0o700 })
      const old = await readFile(current.path, 'utf8')
      // An external editor may have written between the initial read and snapshot.
      if (hash(old) !== request.expectedVersion) {
        throw new RemoteError('learny/conflict', 'Note changed during save', { noteId: request.noteId })
      }
      await atomicWrite(join(revisions, `${current.version}.md`), old)
      await atomicWrite(current.path, encode({
        id: current.id, workspaceId: current.workspaceId, title: request.title,
        createdAt: current.createdAt, updatedAt: new Date().toISOString(), context: request.context ?? (current.context && request.content !== current.content ? { ...current.context, organized: false } : current.context),
      }, request.content))
      return this.read(request.workspaceId, request.noteId)
    })
    // A rejected save must reach its caller, while subsequent saves can still proceed.
    const tail = operation.then(() => {}, () => {})
    this.queues.set(key, tail)
    void tail.then(() => { if (this.queues.get(key) === tail) this.queues.delete(key) })
    return operation
  }

  async drain(): Promise<void> { await Promise.all(this.queues.values()) }
}
