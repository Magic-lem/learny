import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    'learny/not-found': { id: string }
    'learny/conflict': { noteId: string }
    'learny/workspace-conflict': { workspaceId: string }
    'learny/invalid-input': { field: string }
  }
}

/** Refuse invalid input before touching durable state. */
export function invalid(field: string): never {
  throw new RemoteError('learny/invalid-input', `Invalid ${field}`, { field })
}

export function notFound(id: string): never {
  throw new RemoteError('learny/not-found', 'Record no longer exists', { id })
}
