import type { AutoSnapshot, Event, Task, TaskStatus } from '../types';
import { noteKindLabel } from '../domain/notes';
import { statusLabel } from '../domain/stateMachine';
import { displayGitShort, t } from '../i18n';
import { findCommitFeishuRef, findFeishuRef } from '../feishu/links';
import {
  buildWorkSegments,
  formatDuration,
  localDayKey,
  type WorkSegment,
} from '../domain/workSegments';
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
  worklogMode: boolean;
  taskWorkItem: { text: string; href?: string };
  rows: TimelineRow[];
  segments: TimelineSegmentRow[];
  snapshotPreview: string;
  currentWorkspacePath: string;
}

export interface TimelineSegmentRow {
  id: string;
  closed: boolean;
  selectable: boolean;
  rangeLabel: string;
  durationLabel: string;
  minutes: number;
  startedAt: string;
  endedAt?: string;
  dateLabel: string;
  workspaceLabel: string;
  workspacePath: string;
  workspaceChanged: boolean;
  crossedDays: boolean;
  openLabel?: string;
  submitted: boolean;
  notes: WorkSegment['notes'];
  commits: WorkSegment['commits'];
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
    parts.push(displayGitShort(snapshot.gitStatusSummary.shortText));
  } else if (!snapshot.gitStatusSummary.available && snapshot.context.workspacePath) {
    parts.push(t('git.missing'));
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
      label: t('timeline.activeFile'),
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
      label: t('timeline.commits', { count: snapshot.recentCommits.length }),
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
      label: t('timeline.commits', { count: 0 }),
      value: t('timeline.commitsEmpty'),
    });
  }
  return details;
}

export function eventTypeLabel(event: Event): string {
  switch (event.type) {
    case 'task.created':
      return t('event.created');
    case 'task.started':
      return t('event.started');
    case 'task.paused':
      return t('event.paused');
    case 'task.resumed':
      return t('event.resumed');
    case 'task.completed':
      return t('event.completed');
    case 'note.added':
      return t('event.noteKind', { kind: noteKindLabel(event.noteKind) });
    case 'snapshot.auto':
      return t('event.snapshot');
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
        folderName: folderName(path) || t('timeline.workspace'),
        workspacePath: path,
      });
    }

    const day = formatDay(event.createdAt);
    rows.push({
      kind: 'event',
      id: event.id,
      type: event.type,
      typeLabel: eventTypeLabel(event),
      sourceLabel: event.source === 'system' || event.type === 'snapshot.auto' ? t('event.system') : t('event.user'),
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
  worklogMode?: boolean;
}): TimelineViewModel {
  if (!input.task) {
    return {
      empty: true,
      emptyMessage: t('timeline.empty'),
      filter: input.filter,
      worklogMode: !!input.worklogMode,
      taskWorkItem: { text: '' },
      rows: [],
      segments: [],
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
    worklogMode: !!input.worklogMode,
    taskWorkItem: workItemFromTitle(input.task.title),
    rows: buildTimelineRows(filtered, {
      includeOpenFiles: input.includeOpenFiles,
      includeChangedPaths: input.includeChangedPaths,
      taskTitle: input.task.title,
    }),
    segments: buildSegmentRows(input.events),
    snapshotPreview: input.snapshotPreview,
    currentWorkspacePath: input.currentWorkspacePath ?? '',
  };
}

export function buildSegmentRows(events: Event[], nowIso?: string): TimelineSegmentRow[] {
  const now = nowIso ?? new Date().toISOString();
  const byId = new Map(events.map((event) => [event.id, event]));
  return buildWorkSegments(events, now)
    .slice()
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map((segment) => {
      const workspaceLabel = [segment.workspaceFolder, segment.branch].filter(Boolean).join(' · ');
      const endForDisplay = segment.endedAt ?? now;
      const crossedDays = localDayKey(segment.startedAt) !== localDayKey(endForDisplay);
      return {
        id: segment.id,
        closed: segment.closed,
        selectable: segment.closed,
        rangeLabel: formatRange(segment.startedAt, segment.closed ? segment.endedAt : undefined),
        durationLabel: formatDuration(segment.closed ? segment.minutes : segment.elapsedMinutes),
        minutes: segment.minutes,
        startedAt: segment.startedAt,
        endedAt: segment.endedAt,
        dateLabel: formatDay(segment.startedAt),
        workspaceLabel,
        workspacePath: segment.workspacePath,
        workspaceChanged: segment.workspaceChanged,
        crossedDays,
        openLabel: segment.closed ? undefined : t('worklog.openHint', { duration: formatDuration(segment.elapsedMinutes) }),
        submitted: Boolean(segment.endEventId && byId.get(segment.endEventId)?.worklogId),
        notes: segment.notes,
        commits: segment.commits,
      };
    });
}

function formatRange(startIso: string, endIso?: string): string {
  const startTime = formatHm(startIso);
  if (!endIso) {
    return `${startTime}–`;
  }
  return `${startTime}–${formatHm(endIso)}`;
}

function workItemFromTitle(title?: string): { text: string; href?: string } {
  const ref = findFeishuRef(title);
  if (ref.text === '#none' || ref.text === '#link') {
    return { text: '' };
  }
  return { text: ref.text, href: ref.href };
}
