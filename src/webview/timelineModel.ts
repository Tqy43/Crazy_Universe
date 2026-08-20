import type { AutoSnapshot, Event, Task, TaskStatus } from '../types';
import { noteKindLabel } from '../domain/notes';
import { statusLabel } from '../domain/stateMachine';
import { findCommitFeishuRef } from '../feishu/links';
import { fileName } from '../snapshot/paths';

export type TimelineFilter = 'all' | 'status' | 'notes';

export type EventBar = 'created' | 'started' | 'paused' | 'completed' | 'resumed' | 'note' | 'system';

export interface SnapshotCommitRow {
  hash: string;
  subject: string;
  feishuText: string;
  feishuHref?: string;
}

export interface SnapshotDetail {
  label: string;
  value?: string;
  href?: string;
  files?: Array<{ label: string; path: string }>;
  commits?: SnapshotCommitRow[];
}

export interface TimelineEventRow {
  kind: 'event';
  id: string;
  type: Event['type'];
  typeLabel: string;
  sourceLabel: string;
  timeLabel: string;
  dateLabel?: string;
  body?: string;
  bar: EventBar;
  snapshotSummary?: string;
  snapshotDetails: SnapshotDetail[];
  workspacePath: string;
}

export interface TimelineSeparatorRow {
  kind: 'separator';
  id: string;
  folderName: string;
  workspacePath: string;
}

export type TimelineRow = TimelineEventRow | TimelineSeparatorRow;

export interface TimelineViewModel {
  empty: boolean;
  emptyMessage: string;
  task?: {
    id: string;
    title: string;
    status: TaskStatus;
    statusLabel: string;
    projectName: string;
    branch: string;
    workspacePath: string;
    workspaceFolder: string;
    canStart: boolean;
    canPause: boolean;
    canComplete: boolean;
    canResume: boolean;
    canNote: boolean;
  };
  filter: TimelineFilter;
  rows: TimelineRow[];
  snapshotPreview: string;
  currentWorkspacePath: string;
}

export function filterEvents(events: Event[], filter: TimelineFilter): Event[] {
  if (filter === 'status') {
    return events.filter((event) => event.type.startsWith('task.'));
  }
  if (filter === 'notes') {
    return events.filter((event) => event.type === 'note.added');
  }
  return events;
}

export function sortNewestFirst(events: Event[]): Event[] {
  return events.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function folderName(workspacePath: string): string {
  const trimmed = workspacePath.replace(/[\\/]+$/, '');
  const parts = trimmed.split(/[/\\]/).filter(Boolean);
  return parts.at(-1) ?? '';
}

export function formatHm(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function snapshotSummaryLine(snapshot?: AutoSnapshot): string | undefined {
  if (!snapshot) {
    return undefined;
  }
  const parts: string[] = [];
  if (snapshot.context.branch) {
    parts.push(snapshot.context.isDetached ? `detached ${snapshot.context.branch}` : snapshot.context.branch);
  }
  if (snapshot.gitStatusSummary.available && snapshot.gitStatusSummary.shortText) {
    parts.push(snapshot.gitStatusSummary.shortText);
  } else if (!snapshot.gitStatusSummary.available && snapshot.context.workspacePath) {
    parts.push('未检测到 Git');
  }
  const commit = snapshot.recentCommits[0];
  if (commit) {
    parts.push(commit.hash);
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

export function snapshotDetails(
  snapshot: AutoSnapshot | undefined,
  _options: { includeOpenFiles: boolean; includeChangedPaths: boolean },
  eventType?: Event['type'],
): SnapshotDetail[] {
  if (!snapshot) {
    return [];
  }
  const details: SnapshotDetail[] = [];
  if (snapshot.activeFile) {
    details.push({
      label: '当时正在看的文件',
      files: [
        {
          label: fileName(snapshot.activeFile),
          path: snapshot.activeFile,
        },
      ],
    });
  }
  if (snapshot.recentCommits.length > 0) {
    details.push({
      label: `本任务期间的提交（${snapshot.recentCommits.length}）`,
      commits: snapshot.recentCommits.map((item) => {
        const feishu = findCommitFeishuRef(item.subject);
        return {
          hash: item.hash,
          subject: item.subject,
          feishuText: feishu.text,
          feishuHref: feishu.href,
        };
      }),
    });
  } else if (eventType && eventType !== 'task.created' && eventType !== 'task.started') {
    details.push({
      label: '本任务期间的提交（0）',
      value: '本次开始后还没有新的提交',
    });
  }
  return details;
}

export function eventTypeLabel(event: Event): string {
  switch (event.type) {
    case 'task.created':
      return '创建';
    case 'task.started':
      return '开始';
    case 'task.paused':
      return '暂停';
    case 'task.resumed':
      return '恢复';
    case 'task.completed':
      return '完成';
    case 'note.added':
      return `标记 · ${noteKindLabel(event.noteKind)}`;
    case 'snapshot.auto':
      return '系统快照';
    default:
      return event.type;
  }
}

export function eventBar(event: Event): EventBar {
  switch (event.type) {
    case 'note.added':
      return 'note';
    case 'task.started':
      return 'started';
    case 'task.paused':
      return 'paused';
    case 'task.completed':
      return 'completed';
    case 'task.resumed':
      return 'resumed';
    case 'task.created':
      return 'created';
    default:
      return 'system';
  }
}

export function buildTimelineRows(
  eventsNewestFirst: Event[],
  options: { includeOpenFiles: boolean; includeChangedPaths: boolean; taskTitle?: string },
): TimelineRow[] {
  const rows: TimelineRow[] = [];
  let previousPath: string | undefined;
  let previousDay: string | undefined;

  for (const event of eventsNewestFirst) {
    const path = event.snapshot?.context.workspacePath ?? '';
    if (previousPath !== undefined && path !== previousPath && (path || previousPath)) {
      rows.push({
        kind: 'separator',
        id: `sep:${event.id}`,
        folderName: folderName(path) || '工作区',
        workspacePath: path,
      });
    }

    const day = formatDay(event.createdAt);
    rows.push({
      kind: 'event',
      id: event.id,
      type: event.type,
      typeLabel: eventTypeLabel(event),
      sourceLabel: event.source === 'system' || event.type === 'snapshot.auto' ? '系统' : '用户',
      timeLabel: formatHm(event.createdAt),
      dateLabel: previousDay === undefined || day !== previousDay ? day : undefined,
      body: event.body,
      bar: eventBar(event),
      snapshotSummary: snapshotSummaryLine(event.snapshot),
      snapshotDetails: snapshotDetails(event.snapshot, options, event.type),
      workspacePath: event.snapshot?.context.gitRoot || event.snapshot?.context.workspacePath || '',
    });

    previousPath = path;
    previousDay = day;
  }

  return rows;
}

export function buildTimelineViewModel(input: {
  task?: Task;
  events: Event[];
  filter: TimelineFilter;
  includeOpenFiles: boolean;
  includeChangedPaths: boolean;
  snapshotPreview: string;
  currentWorkspacePath?: string;
}): TimelineViewModel {
  if (!input.task) {
    return {
      empty: true,
      emptyMessage: '选择一个任务以查看时间线',
      filter: input.filter,
      rows: [],
      snapshotPreview: input.snapshotPreview,
      currentWorkspacePath: input.currentWorkspacePath ?? '',
    };
  }

  const filtered = filterEvents(sortNewestFirst(input.events), input.filter);
  const context = input.task.lastContext;
  return {
    empty: false,
    emptyMessage: '',
    task: {
      id: input.task.id,
      title: input.task.title,
      status: input.task.status,
      statusLabel: statusLabel(input.task.status),
      projectName: context?.projectName ?? '',
      branch: context?.branch ?? '',
      workspacePath: context?.workspacePath ?? '',
      workspaceFolder: folderName(context?.workspacePath ?? ''),
      canStart: input.task.status === 'not_started' || input.task.status === 'paused',
      canPause: input.task.status === 'in_progress',
      canComplete: input.task.status === 'in_progress' || input.task.status === 'paused',
      canResume: input.task.status === 'completed',
      canNote: input.task.status !== 'completed',
    },
    filter: input.filter,
    rows: buildTimelineRows(filtered, {
      includeOpenFiles: input.includeOpenFiles,
      includeChangedPaths: input.includeChangedPaths,
      taskTitle: input.task.title,
    }),
    snapshotPreview: input.snapshotPreview,
    currentWorkspacePath: input.currentWorkspacePath ?? '',
  };
}
