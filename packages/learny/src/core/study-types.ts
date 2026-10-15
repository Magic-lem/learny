/**
 * A source of a course. The page text is deliberately not kept here: a stored
 * course carries the generated teaching, and the text used to write it lives in
 * the research page cache only. `sha256` stays as provenance for a re-read.
 */
export interface Source { id: string; title: string; path: string; url: string; sha256: string; excerpt?: string; origin?: 'project' | 'web' | 'builtin' }
export interface Criterion { id: string; description: string }
/** How a node is practiced, so the record can match the task instead of one free-text box. */
export type PracticeKind = 'command' | 'config' | 'compare' | 'design' | 'mixed'
/** One takeaway from the material, tied to the source it can be checked against. */
export interface NodeKeyPoint { sourceId: string; text: string }
export interface StudyNode {
  id: string; title: string; prerequisite: string | null; prediction: string; retryPrediction: string; practice: string; retryPractice: string; explanation: string; sourceIds: string[]; criteria: Criterion[];
  /** Orientation for this node: what it is about and what to look for. Never the answer. */
  briefing?: string;
  /** The node's teaching text: Chinese Markdown written from the material, so the learner does not have to read the source pages. */
  lesson?: string;
  /** What to take away from the reading; absent on courses planned before this field existed. */
  keyPoints?: NodeKeyPoint[];
  /** Task shape of the practice step; absent means the free-form record. */
  practiceKind?: PracticeKind;
}
export type Stage = 'prediction' | 'reading' | 'practice' | 'explanation' | 'submitted'
export interface Verdict { id: string; status: 'met' | 'not-met' | 'insufficient'; quotes: string[]; sourceIds: string[]; reason: string; remediation: string }
export interface Evaluation { criteria: Verdict[]; summary: string; outcome: 'independent' | 'assisted' | 'remedial' }
export interface Attempt {
  id: string; workspaceId: string; nodeId: string; courseVersion: string; revision: number; stage: Stage; retry: boolean;
  prediction: string; evidence: string; explanation: string; readingIds: string[]; hints: string[];
  assistance: 'independent' | 'helped' | 'unknown'; createdAt: string; submittedAt: string | null;
  modelStatus: 'idle' | 'pending' | 'complete' | 'failed' | 'interrupted'; error: string | null; evaluation: Evaluation | null;
}
export interface StudyCourse { version: string; title: string; intro: string; nodes: StudyNode[]; sources: Source[] }
export interface StudySnapshot {
  course: StudyCourse | null; courseOrigin: 'none' | 'builtin' | 'legacy' | 'workspace'; courseVersion: string;
  nodes: StudyNode[]; attempts: Attempt[]; sources: Source[]; tutorMessages: TutorMessage[];
  /** Material the current node may be read from, available before any reading is recorded. */
  materials?: Source[];
  /** Teaching text written on demand, keyed by node. */
  lessons?: Record<string, string>;
  /** Follow-up explanations asked for in this workspace. */
  deepDives?: DeepDive[];
  /** Node starts already sent to the conversation, newest last. */
  nodeTasks?: NodeTask[];
  /** External-call usage for topic research, so a spent budget is visible. */
  research?: ResearchSummary | null;
}
export interface TutorMessage {
  id: string; workspaceId: string; attemptId: string; sessionId: string;
  role: 'user' | 'assistant'; content: string; createdAt: string;
}
export interface TutorRequest { workspaceId: string; attemptId: string; sessionId: string; message: string }
/** One follow-up explanation written for a node, with the question that asked for it. */
export type FollowUpMode = 'panel' | 'chat'
export interface DeepDive {
  id: string; workspaceId: string; nodeId: string; question: string; answer: string; createdAt: string;
  /** `chat` means the question was admitted into the dsh chat and answered there. */
  mode?: FollowUpMode;
  /** Where a chat-answered question was admitted, so its reply can be read back. */
  sessionId?: string;
  requestId?: string;
}
/** One "start this node in the chat" request: the conversation is where it is answered. */
export interface NodeTask { id: string; workspaceId: string; nodeId: string; sessionId: string; requestId: string; askedAt: string }
export interface AttemptAction { workspaceId: string; attemptId: string; expectedRevision: number; action: 'prediction' | 'skipPrediction' | 'reading' | 'hint' | 'startPractice' | 'practice' | 'explanation'; text: string }
export interface SubmitAttempt { workspaceId: string; attemptId: string; expectedRevision: number; sessionId: string; assistance: 'independent' | 'helped' | 'unknown' }
export type RevisionMode = 'format' | 'polish' | 'supplement'
export interface OrganizeNote { id: string; sessionId: string; workspaceId: string; noteId: string; expectedVersion: string; mode: RevisionMode; instruction: string }
export interface NoteRevision {
  id: string; workspaceId: string; noteId: string; sessionId: string; baseVersion: string; title: string;
  original: string; result: string | null; mode: RevisionMode; instruction: string; sourceIds: string[]; summary: string;
  status: 'pending' | 'ready' | 'failed' | 'interrupted' | 'applying' | 'applied' | 'restoring' | 'restored'; error: string | null;
  createdAt: string; appliedVersion: string | null;
}
export interface ModelRequest { sessionId: string; runId: string; kind: 'course' | 'lesson' | 'followup' | 'evaluation' | 'notes' | 'tutor'; system: string; payload: string }
export interface ModelGateway { generate(request: ModelRequest, signal: AbortSignal): Promise<string>; close(): Promise<void> }

/** The current chat session, as seen by a plugin that wants the learner's question answered there. */
export interface ChatGateway {
  /** Admit one message into the session; resolves to the admitted request id. */
  ask(request: { sessionId: string; text: string }, signal: AbortSignal): Promise<string>
  /** Read the reply that followed an admitted request, once the chat has answered. */
  answer(request: { sessionId: string; requestId: string }): Promise<string | null>
}

export interface CachedPage { identity: string; url: string; title: string; excerpt: string; sha256: string; fetchedAt: string; format?: number }
export type ResearchCallKind = 'search' | 'fetch'
export interface ResearchSummary { used: number; limit: number; lastError: string | null }

/** Durable bookkeeping for the calls a topic route pays for; absent without a host web capability. */
export interface ResearchBookkeeping {
  cachedPage(identity: string): CachedPage | null
  rememberPage(page: CachedPage): Promise<void>
  /** Records the call before it happens and refuses it once the rolling budget is spent. */
  begin(workspaceId: string, kind: ResearchCallKind, target: string): Promise<string>
  finish(callId: string, status: 'ok' | 'failed', error?: string): Promise<void>
  summary(workspaceId: string): ResearchSummary
}

/** dsh's web capability, kept structural so the core stays testable without a host. */
export interface ResearchGateway {
  search(request: { query: string; maxResults?: number }, signal?: AbortSignal): Promise<{ sources: readonly { url: string; title?: string; snippet?: string; publishedAt?: string }[] }>
  fetch(request: { url: string }, signal?: AbortSignal): Promise<{ url: string; statusCode: number; body: { kind: 'html' | 'text'; content: string }; truncated: boolean }>
}
