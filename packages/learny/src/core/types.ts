declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    'learny/workspace-conflict': { workspaceId: string }
  }
}

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

/** Only descriptive fields are mutable; source identity and existing course records stay intact. */
export interface UpdateWorkspace {
  workspaceId: string
  name: string
  goal: string
  expected: { name: string; goal: string }
}

export interface NoteLocation { nodeId: string; courseVersion: string; title: string }
export interface NoteContext {
  location: NoteLocation | null
  source: 'manual' | 'chat'
  sessionId?: string
  messageId?: string
  question: boolean
  organized?: boolean
  review?: { outcome: 'remembered' | 'uncertain'; at: string }
}
export interface CaptureNote {
  id: string
  workspaceId: string
  sessionId: string
  content: string
  /** Omitted infers the current chapter; null explicitly selects space notes. */
  location?: NoteLocation | null
}
export interface NoteSummary {
  id: string
  workspaceId: string
  title: string
  createdAt: string
  updatedAt: string
  version: string
  context?: NoteContext
  excerpt?: string
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
  context?: NoteContext
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
