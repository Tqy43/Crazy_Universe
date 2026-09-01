import { t } from '../i18n';
import type { AutoSnapshot, Event, EventType, NoteKind, Task, WorkContext } from '../types';
import type { StoreFile, TaskStoreLike } from '../store/schema';
import { MAX_COMMITS, filterCommitsInPeriod } from '../snapshot/gitParse';
import type { GitReadOptions } from '../snapshot/GitReader';
import { assertCanTransition, nextStatus, type LifecycleAction } from './stateMachine';

export type CaptureFn = (
  options?: GitReadOptions,
) => WorkContext | AutoSnapshot | Promise<WorkContext | AutoSnapshot>;

export class TaskService {
  constructor(
    private readonly store: TaskStoreLike,
    private readonly capture: CaptureFn = defaultContext,
  ) {}

  async createTask(title: string): Promise<Task> {
    const trimmed = title.trim();
    if (!trimmed) {
      throw new Error(t('error.titleEmpty'));
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const snapshot = await this.snapshot();
    const task: Task = {
      id,
      title: trimmed,
      status: 'not_started',
      createdAt: now,
      updatedAt: now,
      lastContext: snapshot.context,
    };

    await this.store.commit((draft) => {
      draft.tasks.push(task);
      draft.events.push(makeEvent(id, 'task.created', now, scopedSnapshot(snapshot, draft, id, now)));
    });

    return this.requireTask(id, t('error.readBack'));
  }

  async start(taskId: string): Promise<{ pausedTitle?: string }> {
    const current = this.store.getTasks().find((item) => item.status === 'in_progress' && item.id !== taskId);
    const pauseSnapshot = current ? await this.snapshot(current.id) : undefined;
    const startSnapshot = await this.snapshot();
    const now = new Date().toISOString();
    let pausedTitle: string | undefined;

    await this.store.commit((draft) => {
      const task = requireTaskInDraft(draft, taskId);
      assertCanTransition(task.status, 'start');

      if (current && pauseSnapshot) {
        const live = requireTaskInDraft(draft, current.id);
        pausedTitle = live.title;
        applyStatus(live, 'pause', now, pauseSnapshot.context);
        draft.events.push(
          makeEvent(
            live.id,
            'task.paused',
            now,
            scopedSnapshot(pauseSnapshot, draft, live.id, now),
            t('event.pausedFor', { title: task.title }),
          ),
        );
      }

      applyStatus(task, 'start', now, startSnapshot.context);
      draft.events.push(makeEvent(task.id, 'task.started', now, scopedSnapshot(startSnapshot, draft, task.id, now)));
    });

    return { pausedTitle };
  }

  async resume(taskId: string): Promise<void> {
    const snapshot = await this.snapshot();
    const now = new Date().toISOString();

    await this.store.commit((draft) => {
      const task = requireTaskInDraft(draft, taskId);
      assertCanTransition(task.status, 'resume');
      applyStatus(task, 'resume', now, snapshot.context);
      task.completedAt = undefined;
      draft.events.push(makeEvent(task.id, 'task.resumed', now, scopedSnapshot(snapshot, draft, task.id, now)));
    });
  }

  async pause(taskId: string, nextPlan?: string): Promise<void> {
    const snapshot = await this.snapshot(taskId);
    const now = new Date().toISOString();
    const body = normalizeOptionalText(nextPlan);

    await this.store.commit((draft) => {
      const task = requireTaskInDraft(draft, taskId);
      assertCanTransition(task.status, 'pause');
      applyStatus(task, 'pause', now, snapshot.context);
      draft.events.push(
        makeEvent(task.id, 'task.paused', now, scopedSnapshot(snapshot, draft, task.id, now), body, body ? 'next' : undefined),
      );
    });
  }

  async complete(taskId: string, comment?: string): Promise<void> {
    const snapshot = await this.snapshot(taskId);
    const now = new Date().toISOString();
    const body = normalizeOptionalText(comment);

    await this.store.commit((draft) => {
      const task = requireTaskInDraft(draft, taskId);
      assertCanTransition(task.status, 'complete');
      applyStatus(task, 'complete', now, snapshot.context);
      task.completedAt = now;
      draft.events.push(makeEvent(task.id, 'task.completed', now, scopedSnapshot(snapshot, draft, task.id, now), body));
    });
  }

  async addNote(taskId: string, kind: NoteKind, body: string): Promise<void> {
    const trimmed = body.trim();
    if (!trimmed) {
      throw new Error(t('error.noteBody'));
    }
    const snapshot = await this.snapshot(taskId);
    const now = new Date().toISOString();

    await this.store.commit((draft) => {
      const task = requireTaskInDraft(draft, taskId);
      if (task.status === 'completed') {
        throw new Error(t('warn.noteNeedActive'));
      }
      task.updatedAt = now;
      task.lastContext = snapshot.context;
      draft.events.push(
        makeEvent(task.id, 'note.added', now, scopedSnapshot(snapshot, draft, task.id, now), trimmed, kind),
      );
    });
  }

  async rename(taskId: string, title: string): Promise<void> {
    const trimmed = title.trim();
    if (!trimmed) {
      throw new Error(t('error.titleEmpty'));
    }

    await this.store.commit((draft) => {
      const task = requireTaskInDraft(draft, taskId);
      task.title = trimmed;
      task.updatedAt = new Date().toISOString();
    });
  }

  async delete(taskId: string): Promise<void> {
    await this.store.commit((draft) => {
      const index = draft.tasks.findIndex((item) => item.id === taskId);
      if (index < 0) {
        throw new Error(t('warn.missingTask'));
      }
      draft.tasks.splice(index, 1);
      draft.events = draft.events.filter((event) => event.taskId !== taskId);
    });
  }

  private async snapshot(taskId?: string): Promise<AutoSnapshot> {
    const value = await this.capture(taskId ? this.periodOptions(taskId) : undefined);
    return isAutoSnapshot(value) ? value : emptySnapshot(value);
  }

  private periodOptions(taskId: string): GitReadOptions {
    const started = this.store
      .getEvents(taskId)
      .filter((event) => event.type === 'task.started')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .at(-1);
    return {
      since: started?.createdAt,
      afterHash: started?.snapshot?.context.headHash,
      startGitRoot: started?.snapshot?.context.gitRoot,
    };
  }

  private requireTask(id: string, message: string): Task {
    const task = this.store.getTask(id);
    if (!task) {
      throw new Error(message);
    }
    return task;
  }
}

function applyStatus(
  task: Task,
  action: LifecycleAction,
  now: string,
  context: WorkContext,
): void {
  task.status = nextStatus(action);
  task.updatedAt = now;
  task.lastContext = context;
}

function requireTaskInDraft(draft: StoreFile, taskId: string): Task {
  const task = draft.tasks.find((item) => item.id === taskId);
  if (!task) {
    throw new Error(t('warn.missingTask'));
  }
  return task;
}

function scopedSnapshot(
  snapshot: AutoSnapshot,
  draft: StoreFile,
  taskId: string,
  now: string,
): AutoSnapshot {
  const lastStart = draft.events
    .filter((event) => event.taskId === taskId && event.type === 'task.started')
    .map((event) => event.createdAt)
    .sort()
    .at(-1);
  if (!lastStart) {
    return { ...snapshot, recentCommits: [] };
  }
  const filtered = filterCommitsInPeriod(snapshot.recentCommits, lastStart, now);
  return {
    ...snapshot,
    recentCommits:
      filtered.length > 0 ? filtered : snapshot.recentCommits.slice(0, MAX_COMMITS),
  };
}

function makeEvent(
  taskId: string,
  type: EventType,
  createdAt: string,
  snapshot: AutoSnapshot,
  body?: string,
  noteKind?: NoteKind,
): Event {
  return {
    id: crypto.randomUUID(),
    taskId,
    type,
    source: type === 'snapshot.auto' ? 'system' : 'user',
    createdAt,
    noteKind,
    body,
    snapshot,
  };
}

function isAutoSnapshot(value: WorkContext | AutoSnapshot): value is AutoSnapshot {
  return 'gitStatusSummary' in value && 'context' in value;
}

function emptySnapshot(context: WorkContext): AutoSnapshot {
  return {
    context,
    openFiles: [],
    gitStatusSummary: {
      available: false,
      dirty: false,
      stagedCount: 0,
      unstagedCount: 0,
      untrackedCount: 0,
      shortText: '',
    },
    recentCommits: [],
  };
}

function normalizeOptionalText(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function defaultContext(): WorkContext {
  return {
    workspacePath: '',
    projectName: '',
    recordedAt: new Date().toISOString(),
  };
}
