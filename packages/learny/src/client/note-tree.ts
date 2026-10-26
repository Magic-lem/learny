import type { NoteContext, NoteLocation, NoteSummary, StudyCourse } from '../core/types.ts'
export const contextOf = (note: NoteSummary): NoteContext => note.context ?? { location: null, source: 'manual', question: false }
export const locationKey = (location: NoteLocation | null | undefined): string => location ? JSON.stringify([location.courseVersion, location.nodeId]) : 'space'
/** Current course chapters and historical locations coexist. Never reassign by title or reused node id. */
export function noteFolders(course: StudyCourse | null, notes: NoteSummary[]) {
  const folders: { key: string; location: NoteLocation | null; historical: boolean }[] = [{ key: 'space', location: null, historical: false }]
  for (const node of course?.nodes ?? []) {
    const location = { nodeId: node.id, courseVersion: course!.version, title: node.title }
    folders.push({ key: locationKey(location), location, historical: false })
  }
  for (const note of notes) {
    const location = contextOf(note).location, key = locationKey(location)
    if (location && !folders.some(folder => folder.key === key)) folders.push({ key, location, historical: true })
  }
  return folders.map(folder => ({ ...folder, notes: notes.filter(note => locationKey(contextOf(note).location) === folder.key) }))
}
