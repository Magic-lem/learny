import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { StudyService } from '../core/study.ts'
import type { Attempt, AttemptAction, DeepDive, NodeTask, StudyCourse, StudySnapshot, SubmitAttempt, OrganizeNote, NoteRevision, TutorRequest, TutorMessage } from '../core/study-types.ts'
import type { NoteSummary } from '../core/types.ts'
import type { LearningService } from '../core/service.ts'
import type { CaptureNote, CapabilityStatus, CreateWorkspace, UpdateWorkspace, NoteDocument, SaveNote, Snapshot, Workspace } from '../core/types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context { learny: LearnyController }
}

/** Generated Remote API over the same service used by the notebook. */
export class LearnyController extends TypertRemoteService {
  private readonly service: LearningService
  private readonly study: StudyService
  constructor(ctx: Context, runtime: {service: LearningService; study: StudyService}) {
    super(ctx, 'learny', { namespace: 'learny' })
    this.service = runtime.service; this.study = runtime.study
  }

  @Remote('snapshot')
  async snapshot(sessionId: string, signal: AbortSignal): Promise<Snapshot> {
    signal.throwIfAborted()
    return this.service.snapshot(sessionId)
  }

  @Remote('createWorkspace')
  async createWorkspace(request: CreateWorkspace, signal: AbortSignal): Promise<Workspace> {
    signal.throwIfAborted()
    return this.service.createWorkspace(request)
  }

  @Remote('bindWorkspace')
  async bindWorkspace(sessionId: string, workspaceId: string, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    return this.service.bindWorkspace(sessionId, workspaceId)
  }

  @Remote('updateWorkspace')
  async updateWorkspace(request: UpdateWorkspace, signal: AbortSignal): Promise<Workspace> {
    signal.throwIfAborted()
    return this.service.updateWorkspace(request)
  }

  @Remote('createNote')
  async createNote(workspaceId: string, title: string, signal: AbortSignal): Promise<NoteDocument> {
    signal.throwIfAborted()
    return this.service.createNote(workspaceId, title)
  }

  @Remote('captureNote')
  async captureNote(request: CaptureNote, signal: AbortSignal): Promise<NoteDocument> {
    signal.throwIfAborted()
    return this.study.captureNote(request)
  }

  @Remote('captureMessage')
  async captureMessage(sessionId: string, messageId: string, signal: AbortSignal): Promise<NoteDocument> {
    signal.throwIfAborted()
    return this.study.captureMessage(sessionId, messageId)
  }

  @Remote('askAboutNote')
  async askAboutNote(workspaceId: string, noteId: string, sessionId: string, question: string, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    return this.study.askAboutNote(workspaceId, noteId, sessionId, question, signal)
  }

  @Remote('reviewNote')
  async reviewNote(workspaceId: string, noteId: string, expectedVersion: string, outcome: 'remembered' | 'uncertain', signal: AbortSignal): Promise<NoteDocument> {
    signal.throwIfAborted()
    return this.study.reviewNote(workspaceId, noteId, expectedVersion, outcome)
  }

  @Remote('readNote')
  async readNote(workspaceId: string, noteId: string, signal: AbortSignal): Promise<NoteDocument> {
    signal.throwIfAborted()
    return this.service.readNote(workspaceId, noteId)
  }

  @Remote('saveNote')
  async saveNote(request: SaveNote, signal: AbortSignal): Promise<NoteDocument> {
    signal.throwIfAborted()
    return this.service.saveNote(request)
  }

  @Remote('studySnapshot')
  async studySnapshot(workspaceId: string, signal: AbortSignal): Promise<StudySnapshot> { signal.throwIfAborted(); return this.study.snapshot(workspaceId) }
  @Remote('markNodeComplete')
  async markNodeComplete(workspaceId: string, nodeId: string, completed: boolean, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    return this.study.markNodeComplete(workspaceId, nodeId, completed)
  }
  @Remote('capabilityStatus')
  async capabilityStatus(sessionId: string, signal: AbortSignal): Promise<CapabilityStatus> { signal.throwIfAborted(); return this.study.capabilityStatus(sessionId) }
  @Remote('generateCourse')
  async generateCourse(workspaceId: string, sessionId: string, signal: AbortSignal): Promise<StudyCourse> { signal.throwIfAborted(); return this.study.generateCourse(workspaceId, sessionId, signal) }

  @Remote('nodeLesson')
  async nodeLesson(workspaceId: string, nodeId: string, sessionId: string, refresh: boolean, signal: AbortSignal): Promise<string> {
    signal.throwIfAborted()
    return this.study.nodeLesson(workspaceId, nodeId, sessionId, refresh, signal)
  }

  @Remote('deepen')
  async deepen(request: { workspaceId: string; nodeId: string; question: string; sessionId: string; mode?: 'panel' | 'chat' }, signal: AbortSignal): Promise<DeepDive> {
    signal.throwIfAborted()
    return this.study.deepen(request, signal)
  }

  /** Send one node's lesson task into the conversation; the panel keeps the record. */
  @Remote('startNode')
  async startNode(workspaceId: string, nodeId: string, sessionId: string, signal: AbortSignal): Promise<NodeTask> {
    signal.throwIfAborted()
    return this.study.startNode(workspaceId, nodeId, sessionId, signal)
  }
  @Remote('startAttempt')
  async startAttempt(workspaceId: string, nodeId: string, signal: AbortSignal): Promise<Attempt> { signal.throwIfAborted(); return this.study.start(workspaceId,nodeId) }
  @Remote('attemptAction')
  async attemptAction(request: AttemptAction, signal: AbortSignal): Promise<Attempt> { signal.throwIfAborted(); return this.study.act(request) }
  @Remote('submitAttempt')
  async submitAttempt(request: SubmitAttempt, signal: AbortSignal): Promise<Attempt> { return this.study.submit(request,signal) }
  @Remote('retryEvaluation')
  async retryEvaluation(workspaceId: string, attemptId: string, sessionId: string, signal: AbortSignal): Promise<Attempt> { return this.study.evaluate(workspaceId,attemptId,sessionId,signal) }
  @Remote('tutorChat')
  async tutorChat(request: TutorRequest, signal: AbortSignal): Promise<TutorMessage> { return this.study.tutor(request,signal) }
  @Remote('searchNotes')
  async searchNotes(workspaceId: string, query: string, signal: AbortSignal): Promise<NoteSummary[]> { signal.throwIfAborted(); return this.service.searchNotes(workspaceId,query) }
  @Remote('noteRevisions')
  async noteRevisions(workspaceId: string, noteId: string, signal: AbortSignal): Promise<NoteRevision[]> { signal.throwIfAborted(); return this.study.revisions(workspaceId,noteId) }
  @Remote('organizeNote')
  async organizeNote(request: OrganizeNote, signal: AbortSignal): Promise<NoteRevision> { return this.study.organize(request,signal) }
  @Remote('retryOrganization')
  async retryOrganization(workspaceId: string, revisionId: string, signal: AbortSignal): Promise<NoteRevision> { return this.study.retryOrganization(workspaceId,revisionId,signal) }
  @Remote('applyRevision')
  async applyRevision(workspaceId: string, revisionId: string, restore: boolean, signal: AbortSignal): Promise<NoteRevision> { signal.throwIfAborted(); return this.study.applyRevision(workspaceId,revisionId,restore) }
}
