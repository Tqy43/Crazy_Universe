export type TaskStatus = 'not_started' | 'in_progress' | 'paused' | 'completed';

export type EventType =
  | 'task.created'
  | 'task.started'
  | 'task.paused'
  | 'task.resumed'
  | 'task.completed'
  | 'note.added'
  | 'snapshot.auto';

export type EventSource = 'user' | 'system';

export type NoteKind =
  | 'change'
  | 'action'
  | 'test'
  | 'commit'
  | 'issue'
  | 'next'
  | 'other';

export interface WorkContext {
  workspacePath: string;
  projectName: string;
  gitRoot?: string;
  headHash?: string;
  branch?: string;
  isDetached?: boolean;
  recordedAt: string;
}

export interface GitStatusSummary {
  available: boolean;
  dirty: boolean;
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
  shortText: string;
  changedPaths?: string[];
}

export interface AutoSnapshot {
  context: WorkContext;
  openFiles: string[];
  activeFile?: string;
  gitStatusSummary: GitStatusSummary;
  recentCommits: Array<{
    hash: string;
    subject: string;
    authorTime: string;
  }>;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  lastContext?: WorkContext;
}

export interface Event {
  id: string;
  taskId: string;
  type: EventType;
  source: EventSource;
  createdAt: string;
  noteKind?: NoteKind;
  body?: string;
  snapshot?: AutoSnapshot;
  worklogId?: string;
}
