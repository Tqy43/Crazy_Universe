import { findCommitFeishuRef, findFeishuRef } from '../feishu/links';
import type { Event, NoteKind } from '../types';
import { noteKindLabel } from './notes';
import { t } from '../i18n';

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

export interface WorklogDraft {
  workItemText: string;
  workItemHref?: string;
  startedAt: string;
  minutes: number;
  description: string;
  details: string[];
  selectedCount: number;
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
    };
  }

  const feishu = pickLatestCommitFeishu(selected) ?? readableFeishu(findFeishuRef(taskTitle));
  return {
    workItemText: feishu?.text ?? '',
    workItemHref: feishu?.href,
    startedAt: selected[0]?.startedAt ?? '',
    minutes: selected.reduce((sum, segment) => sum + segment.minutes, 0),
    description: joinNotes(selected),
    details: selected.map((segment) => {
      const name = segment.workspaceFolder || t('timeline.workspace');
      return `${formatDuration(segment.minutes)} ${name}`;
    }),
    selectedCount: selected.length,
  };
}

function readableFeishu(ref: { text: string; href?: string } | undefined): { text: string; href?: string } | undefined {
  if (!ref || ref.text === '#none' || ref.text === '#link') {
    return undefined;
  }
  return ref;
}

function pickLatestCommitFeishu(segments: WorkSegment[]): { text: string; href?: string } | undefined {
  const commits = segments
    .flatMap((segment) => segment.commits)
    .filter((commit) => readableFeishu({ text: commit.feishuText, href: commit.feishuHref }))
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

function joinNotes(segments: WorkSegment[]): string {
  const blocks: string[] = [];
  let previousFolder: string | undefined;
  for (const segment of segments) {
    for (const note of segment.notes) {
      const folder = note.workspaceFolder || segment.workspaceFolder;
      if (folder && folder !== previousFolder) {
        blocks.push(`【${folder}】`);
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
  if (event.type === 'note.added' && event.body?.trim()) {
    draft.notes.push({
      eventId: event.id,
      createdAt: event.createdAt,
      noteKind: event.noteKind,
      body: event.body.trim(),
      workspacePath: path,
      workspaceFolder: folderName(path),
    });
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
