import { t } from '../i18n';
import type { Event, Task } from '../types';

export const SCHEMA_VERSION = 1;

export interface StoreFile {
  schemaVersion: number;
  tasks: Task[];
  events: Event[];
}

export interface MetaFile {
  schemaVersion: number;
  lastOpenedAt: string;
}

export function emptyStore(): StoreFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    tasks: [],
    events: [],
  };
}

export function assertInvariants(data: StoreFile): void {
  const inProgress = data.tasks.filter((task) => task.status === 'in_progress');
  if (inProgress.length > 1) {
    throw new Error(t('error.oneInProgress'));
  }
}

export interface TaskStoreLike {
  getTasks(): Task[];
  getTask(id: string): Task | undefined;
  getEvents(taskId?: string): Event[];
  commit(mutate: (draft: StoreFile) => void): Promise<void>;
}
