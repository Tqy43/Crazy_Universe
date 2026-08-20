import { t } from '../i18n';
import type { EventType, TaskStatus } from '../types';

export type LifecycleAction = 'start' | 'pause' | 'resume' | 'complete';

const ALLOWED: Record<LifecycleAction, readonly TaskStatus[]> = {
  start: ['not_started', 'paused'],
  pause: ['in_progress'],
  resume: ['completed'],
  complete: ['in_progress', 'paused'],
};

export class IllegalTransitionError extends Error {
  constructor(
    public readonly from: TaskStatus,
    public readonly action: LifecycleAction,
  ) {
    super(t('error.illegalTransition', { status: statusLabel(from), action: actionLabel(action) }));
    this.name = 'IllegalTransitionError';
  }
}

export function canTransition(status: TaskStatus, action: LifecycleAction): boolean {
  return ALLOWED[action].includes(status);
}

export function assertCanTransition(status: TaskStatus, action: LifecycleAction): void {
  if (!canTransition(status, action)) {
    throw new IllegalTransitionError(status, action);
  }
}

export function nextStatus(action: LifecycleAction): TaskStatus {
  switch (action) {
    case 'start':
      return 'in_progress';
    case 'pause':
    case 'resume':
      return 'paused';
    case 'complete':
      return 'completed';
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

export function eventTypeFor(action: LifecycleAction): EventType {
  switch (action) {
    case 'start':
      return 'task.started';
    case 'pause':
      return 'task.paused';
    case 'resume':
      return 'task.resumed';
    case 'complete':
      return 'task.completed';
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

export function statusLabel(status: TaskStatus): string {
  switch (status) {
    case 'not_started':
      return t('status.not_started');
    case 'in_progress':
      return t('status.in_progress');
    case 'paused':
      return t('status.paused');
    case 'completed':
      return t('status.completed');
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

function actionLabel(action: LifecycleAction): string {
  switch (action) {
    case 'start':
      return t('action.start');
    case 'pause':
      return t('action.pause');
    case 'resume':
      return t('action.resume');
    case 'complete':
      return t('action.complete');
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
