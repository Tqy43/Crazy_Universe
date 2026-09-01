import { findCommitFeishuRef, findFeishuRef } from '../feishu/links';
import { getLocale, t } from '../i18n';
import type { Event, NoteKind } from '../types';
import { noteKindLabel } from './notes';

export interface WorkSegmentNote {
  eventId: string;
  createdAt: string;
  noteKind?: NoteKind;
  body: string;
  workspacePath: string;
  workspaceFolder: string;
}

export interface WorkSegmentCommit {
  hash: string;
  subject: string;
  authorTime: string;
  feishuText: string;
  feishuHref?: string;
}

export interface WorkSegment {
  id: string;
  startEventId: string;
  endEventId?: string;
  startedAt: string;
  endedAt?: string;
  closed: boolean;
  minutes: number;
  elapsedMinutes: number;
  workspacePath: string;
  workspaceFolder: string;
  projectName: string;
  branch: string;
  workspaceChanged: boolean;
  eventIds: string[];
  notes: WorkSegmentNote[];
  commits: WorkSegmentCommit[];
}

export interface WorklogDayDraft {
  dayKey: string;
  dayLabel: string;
  startedAt: string;
  minutes: number;
  description: string;
  details: string[];
  segmentIds: string[];
  segmentCount: number;
  workItemText: string;
  workItemHref?: string;
  fromCrossDay?: boolean;
}

export interface WorklogDraft {
  workItemText: string;
  workItemHref?: string;
  startedAt: string;
  minutes: number;
  description: string;
  details: string[];
  selectedCount: number;
  days: WorklogDayDraft[];
}

export function folderName(workspacePath: string): string {
  const trimmed = workspacePath.replace(/[\\/]+$/, '');
  const parts = trimmed.split(/[/\\]/).filter(Boolean);
  return parts.at(-1) ?? '';
}

export function formatDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  if (safe < 60) {
    return `${safe}m`;
  }
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  return rest === 0 ? `${hours}h` : `${hours}h${rest}m`;
}

export function localDayKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatLocalDayTitle(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  if (getLocale() === 'en') {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function minutesBetween(startIso: string, endIso: string): number {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return 0;
  }
  return Math.round((end - start) / 60_000);
}

export function buildWorkSegments(events: Event[], nowIso = new Date().toISOString()): WorkSegment[] {
  const ordered = events.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const segments: WorkSegment[] = [];
  let current: DraftSegment | undefined;

  for (const event of ordered) {
    if (event.type === 'task.started') {
      if (current && !current.endedAt) {
        segments.push(finishSegment(current, nowIso));
      }
      current = startDraft(event);
      continue;
    }
    if (event.type === 'task.paused' || event.type === 'task.completed') {
      if (!current || current.endedAt) {
        continue;
      }
      addEventToDraft(current, event);
      current.endedAt = event.createdAt;
      current.endEventId = event.id;
      segments.push(finishSegment(current, nowIso));
      current = undefined;
      continue;
    }
    if (current && !current.endedAt) {
      addEventToDraft(current, event);
    }
  }

  if (current && !current.endedAt) {
    segments.push(finishSegment(current, nowIso));
  }

  return segments;
}

export function buildWorklogDraft(
  segments: WorkSegment[],
  selectedIds: string[],
  taskTitle?: string,
): WorklogDraft {
  const selected = segments
    .filter((segment) => segment.closed && selectedIds.includes(segment.id))
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  if (selected.length === 0) {
    return {
      workItemText: '',
      startedAt: '',
      minutes: 0,
      description: '',
      details: [],
      selectedCount: 0,
      days: [],
    };
  }

  const days = groupSelectedByLocalDay(selected, taskTitle);
  const first = days[0];
  return {
    workItemText: first?.workItemText ?? '',
    workItemHref: first?.workItemHref,
    startedAt: first?.startedAt ?? '',
    minutes: days.reduce((sum, day) => sum + day.minutes, 0),
    description: first?.description ?? '',
    details: days.flatMap((day) => day.details),
    selectedCount: selected.length,
    days,
  };
}

export function segmentCrossesLocalDays(segment: WorkSegment): boolean {
  const endIso = segment.endedAt;
  if (!endIso) {
    return false;
  }
  const startDay = localDayKey(segment.startedAt);
  const endDay = localDayKey(endIso);
  return Boolean(startDay && endDay && startDay !== endDay);
}

export function groupSelectedByLocalDay(segments: WorkSegment[], taskTitle?: string): WorklogDayDraft[] {
  const groups = new Map<string, DaySlice[]>();
  for (const segment of segments) {
    for (const slice of splitClosedSegmentByLocalDays(segment)) {
      const list = groups.get(slice.dayKey) ?? [];
      list.push(slice);
      groups.set(slice.dayKey, list);
    }
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([dayKey, items]) => {
      items.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
      const startedAt = items[0]?.startedAt ?? '';
      const originals = items.map((item) => item.segment);
      const feishu =
        pickLatestCommitFeishu(originals, dayKey) ??
        pickLatestCommitFeishu(originals) ??
        readableFeishu(findFeishuRef(taskTitle));
      return {
        dayKey,
        dayLabel: formatLocalDayTitle(startedAt),
        startedAt,
        minutes: items.reduce((sum, item) => sum + item.minutes, 0),
        description: joinSliceNotes(items),
        details: items.map((item) => {
          const name = item.segment.workspaceFolder || t('timeline.workspace');
          return `${formatDuration(item.minutes)} ${name}`;
        }),
        segmentIds: [...new Set(items.map((item) => item.segment.id))],
        segmentCount: items.length,
        workItemText: feishu?.text ?? '',
        workItemHref: feishu?.href,
        fromCrossDay: items.some((item) => item.fromCrossDay),
      };
    });
}

interface DaySlice {
  dayKey: string;
  startedAt: string;
  minutes: number;
  segment: WorkSegment;
  notes: WorkSegmentNote[];
  fromCrossDay: boolean;
}

export function splitClosedSegmentByLocalDays(segment: WorkSegment): DaySlice[] {
  const endIso = segment.endedAt ?? segment.startedAt;
  const startMs = Date.parse(segment.startedAt);
  const endMs = Date.parse(endIso);
  const crosses = segmentCrossesLocalDays(segment);
  const fallback: DaySlice = {
    dayKey: localDayKey(segment.startedAt) || segment.startedAt,
    startedAt: segment.startedAt,
    minutes: segment.minutes,
    segment,
    notes: segment.notes,
    fromCrossDay: crosses,
  };
  if (!segment.closed || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return [fallback];
  }
  const slices: DaySlice[] = [];
  let cursor = startOfLocalDay(new Date(startMs));
  while (cursor.getTime() < endMs) {
    const next = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    const sliceStart = Math.max(startMs, cursor.getTime());
    const sliceEnd = Math.min(endMs, next.getTime());
    const minutes = Math.round((sliceEnd - sliceStart) / 60_000);
    if (minutes > 0) {
      const startedAt = new Date(sliceStart).toISOString();
      const dayKey = localDayKey(startedAt) || fallback.dayKey;
      slices.push({
        dayKey,
        startedAt,
        minutes,
        segment,
        notes: segment.notes.filter((note) => localDayKey(note.createdAt) === dayKey),
        fromCrossDay: crosses,
      });
    }
    cursor = next;
    if (slices.length > 366) {
      break;
    }
  }
  return slices.length ? slices : [fallback];
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function readableFeishu(ref: { text: string; href?: string } | undefined): { text: string; href?: string } | undefined {
  if (!ref || ref.text === '#none' || ref.text === '#link') {
    return undefined;
  }
  return ref;
}

function pickLatestCommitFeishu(
  segments: WorkSegment[],
  dayKey?: string,
): { text: string; href?: string } | undefined {
  const commits = segments
    .flatMap((segment) => segment.commits)
    .filter((commit) => readableFeishu({ text: commit.feishuText, href: commit.feishuHref }))
    .filter((commit) => !dayKey || localDayKey(commit.authorTime) === dayKey)
    .sort((a, b) => {
      const byTime = b.authorTime.localeCompare(a.authorTime);
      return byTime !== 0 ? byTime : b.hash.localeCompare(a.hash);
    });
  const latest = commits[0];
  if (!latest) {
    return undefined;
  }
  return { text: latest.feishuText, href: latest.feishuHref };
}

function joinSliceNotes(slices: DaySlice[]): string {
  const blocks: string[] = [];
  let previousFolder: string | undefined;
  for (const slice of slices) {
    for (const note of slice.notes) {
      const folder = note.workspaceFolder || slice.segment.workspaceFolder;
      if (folder && folder !== previousFolder) {
        blocks.push(t('worklog.folderMark', { folder }));
        previousFolder = folder;
      }
      const time = formatClock(note.createdAt);
      const kind = noteKindLabel(note.noteKind);
      blocks.push(`${time} ${kind}\n${note.body}`);
    }
  }
  return blocks.join('\n\n');
}

function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

interface DraftSegment {
  startEventId: string;
  endEventId?: string;
  startedAt: string;
  endedAt?: string;
  eventIds: string[];
  notes: WorkSegmentNote[];
  commitMap: Map<string, WorkSegmentCommit>;
  workspaces: string[];
  projectName: string;
  branch: string;
  startWorkspacePath: string;
}

function startDraft(event: Event): DraftSegment {
  const path = workspacePathOf(event);
  return {
    startEventId: event.id,
    startedAt: event.createdAt,
    eventIds: [event.id],
    notes: [],
    commitMap: new Map(),
    workspaces: path ? [path] : [],
    projectName: event.snapshot?.context.projectName ?? '',
    branch: event.snapshot?.context.branch ?? '',
    startWorkspacePath: path,
  };
}

function addEventToDraft(draft: DraftSegment, event: Event): void {
  draft.eventIds.push(event.id);
  const path = workspacePathOf(event);
  if (path && draft.workspaces.at(-1) !== path) {
    draft.workspaces.push(path);
  }
  if (event.snapshot?.context.projectName) {
    draft.projectName = event.snapshot.context.projectName;
  }
  if (event.snapshot?.context.branch) {
    draft.branch = event.snapshot.context.branch;
  }
  const note = noteFromEvent(event, path);
  if (note) {
    draft.notes.push(note);
  }
  for (const commit of event.snapshot?.recentCommits ?? []) {
    const feishu = findCommitFeishuRef(commit.subject);
    const row: WorkSegmentCommit = {
      hash: commit.hash,
      subject: commit.subject,
      authorTime: commit.authorTime,
      feishuText: feishu.text,
      feishuHref: feishu.href,
    };
    const previous = draft.commitMap.get(commit.hash);
    if (!previous || commit.authorTime.localeCompare(previous.authorTime) >= 0) {
      draft.commitMap.set(commit.hash, row);
    }
  }
}

function finishSegment(draft: DraftSegment, nowIso: string): WorkSegment {
  const closed = !!draft.endedAt;
  const endForElapsed = draft.endedAt ?? nowIso;
  const minutes = closed ? minutesBetween(draft.startedAt, draft.endedAt ?? draft.startedAt) : 0;
  const lastPath = draft.workspaces.at(-1) || draft.startWorkspacePath;
  return {
    id: draft.startEventId,
    startEventId: draft.startEventId,
    endEventId: draft.endEventId,
    startedAt: draft.startedAt,
    endedAt: draft.endedAt,
    closed,
    minutes,
    elapsedMinutes: minutesBetween(draft.startedAt, endForElapsed),
    workspacePath: lastPath,
    workspaceFolder: folderName(lastPath),
    projectName: draft.projectName,
    branch: draft.branch,
    workspaceChanged: new Set(draft.workspaces).size > 1,
    eventIds: draft.eventIds,
    notes: draft.notes,
    commits: [...draft.commitMap.values()].sort((a, b) => a.authorTime.localeCompare(b.authorTime)),
  };
}

function workspacePathOf(event: Event): string {
  return event.snapshot?.context.gitRoot || event.snapshot?.context.workspacePath || '';
}

function noteFromEvent(event: Event, path: string): WorkSegmentNote | undefined {
  const body = event.body?.trim();
  if (!body) {
    return undefined;
  }
  if (event.type === 'note.added') {
    return {
      eventId: event.id,
      createdAt: event.createdAt,
      noteKind: event.noteKind,
      body,
      workspacePath: path,
      workspaceFolder: folderName(path),
    };
  }
  if (event.type === 'task.paused' && isPauseNextPlan(event, body)) {
    return {
      eventId: event.id,
      createdAt: event.createdAt,
      noteKind: 'next',
      body,
      workspacePath: path,
      workspaceFolder: folderName(path),
    };
  }
  return undefined;
}

function isPauseNextPlan(event: Event, body: string): boolean {
  if (event.noteKind === 'next') {
    return true;
  }
  return !looksLikeSwitchPause(body);
}

function looksLikeSwitchPause(body: string): boolean {
  return /任务进行中$/.test(body) || / is now in progress$/.test(body);
}
