/** Client-safe records shared by the generated API and the notebook. */
export interface Workspace {
  id: string
  name: string
  goal: string
  kind: 'project' | 'topic'
  materialPath: string
  createdAt: string
}

export interface CreateWorkspace {
  name: string
  goal: string
  kind: 'project' | 'topic'
  materialPath: string
}

export interface NoteSummary {
  id: string
  workspaceId: string
  title: string
  createdAt: string
  updatedAt: string
  version: string
}

export interface NoteDocument extends NoteSummary {
  content: string
  path: string
}

export interface SaveNote {
  workspaceId: string
  noteId: string
  title: string
  content: string
  expectedVersion: string
}

export interface Snapshot {
  workspaces: Workspace[]
  workspaceId: string | null
  notes: NoteSummary[]
}

/** Read-only host capabilities shown before the learner starts their first task. */
export interface CapabilityStatus {
  model: 'ready' | 'needs-session'
  webSearch: 'mounted' | 'not-mounted'
  webFetch: 'mounted' | 'not-mounted'
}

export type * from './study-types.ts'
