import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Event } from '../types';
import {
  buildTimelineRows,
  filterEvents,
  folderName,
  formatHm,
  snapshotDetails,
  snapshotSummaryLine,
  sortNewestFirst,
} from './timelineModel';

function event(partial: Partial<Event> & Pick<Event, 'id' | 'type' | 'createdAt'>): Event {
  return {
    taskId: 't1',
    source: 'user',
    ...partial,
  };
}

test('筛选仅状态变更与仅用户标记', () => {
  const events = [
    event({ id: '1', type: 'task.started', createdAt: '2026-08-19T10:00:00.000Z' }),
    event({ id: '2', type: 'note.added', createdAt: '2026-08-19T10:01:00.000Z', noteKind: 'next' }),
    event({ id: '3', type: 'task.paused', createdAt: '2026-08-19T10:02:00.000Z' }),
  ];
  assert.deepEqual(
    filterEvents(events, 'status').map((item) => item.id),
    ['1', '3'],
  );
  assert.deepEqual(
    filterEvents(events, 'notes').map((item) => item.id),
    ['2'],
  );
  assert.equal(filterEvents(events, 'all').length, 3);
});

test('新到旧排序', () => {
  const events = [
    event({ id: 'old', type: 'task.created', createdAt: '2026-08-19T09:00:00.000Z' }),
    event({ id: 'new', type: 'task.started', createdAt: '2026-08-19T11:00:00.000Z' }),
  ];
  assert.deepEqual(
    sortNewestFirst(events).map((item) => item.id),
    ['new', 'old'],
  );
});

test('工作区变化时插入分隔，不用序号', () => {
  const events = sortNewestFirst([
    event({
      id: 'a',
      type: 'task.started',
      createdAt: '2026-08-19T11:00:00.000Z',
      snapshot: {
        context: {
          workspacePath: 'D:\\work\\frontend',
          projectName: 'frontend',
          recordedAt: '2026-08-19T11:00:00.000Z',
        },
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
      },
    }),
    event({
      id: 'b',
      type: 'note.added',
      createdAt: '2026-08-19T10:00:00.000Z',
      snapshot: {
        context: {
          workspacePath: 'D:\\work\\backend',
          projectName: 'backend',
          recordedAt: '2026-08-19T10:00:00.000Z',
        },
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
      },
    }),
  ]);
  const rows = buildTimelineRows(events, { includeOpenFiles: true, includeChangedPaths: true });
  assert.equal(rows[0]?.kind, 'event');
  assert.equal(rows[1]?.kind, 'separator');
  if (rows[1]?.kind === 'separator') {
    assert.equal(rows[1].folderName, 'backend');
  }
  assert.equal(rows.some((row) => row.kind === 'event' && 'index' in row), false);
});

test('folderName 与 HH:mm', () => {
  assert.equal(folderName('D:\\Program\\Crazy_Universe'), 'Crazy_Universe');
  assert.equal(formatHm('2026-08-19T01:05:00.000Z').includes(':'), true);
});

test('快照摘要只有分支、状态、编号', () => {
  const summary = snapshotSummaryLine({
    context: {
      workspacePath: 'D:\\work\\demo',
      projectName: 'demo',
      branch: 'main',
      recordedAt: '2026-08-20T01:00:00.000Z',
    },
    openFiles: [],
    gitStatusSummary: {
      available: true,
      dirty: true,
      stagedCount: 0,
      unstagedCount: 0,
      untrackedCount: 1,
      shortText: '1 个新文件',
    },
    recentCommits: [
      { hash: '9a92bb2', subject: 'Update README to include repository description', authorTime: '2026-08-20T01:00:00.000Z' },
    ],
  });
  assert.equal(summary, 'main · 1 个新文件 · 9a92bb2');
});

test('提交过多时默认展示 5 条并带总数', () => {
  const details = snapshotDetails(
    {
      context: {
        workspacePath: 'D:\\work\\demo',
        projectName: 'demo',
        recordedAt: '2026-08-20T01:00:00.000Z',
      },
      openFiles: [],
      gitStatusSummary: {
        available: false,
        dirty: false,
        stagedCount: 0,
        unstagedCount: 0,
        untrackedCount: 0,
        shortText: '',
      },
      recentCommits: Array.from({ length: 12 }, (_, index) => ({
        hash: `h${index}`,
        subject: `commit ${index}`,
        authorTime: '2026-08-20T01:00:00.000Z',
      })),
    },
    { includeOpenFiles: false, includeChangedPaths: false },
    'task.paused',
  );
  const commits = details.find((item) => item.label.startsWith('本任务期间的提交'));
  assert.equal(commits?.label, '本任务期间的提交（12）');
  assert.equal(commits?.value?.split('\n').filter((line) => line.startsWith('h')).length, 5);
  assert.match(commits?.value ?? '', /还有 7 条/);
});

test('没有飞书任务时显示 #none，有 id 时可跳转', () => {
  const none = snapshotDetails(undefined, { includeOpenFiles: false, includeChangedPaths: false }, 'note.added', [
    '修登录页',
  ]);
  assert.deepEqual(none, [{ label: '飞书', value: '#none', href: undefined }]);

  const linked = snapshotDetails(undefined, { includeOpenFiles: false, includeChangedPaths: false }, 'note.added', [
    '飞书 #task_hello',
  ]);
  assert.equal(linked[0]?.value, '#task_hello');
  assert.ok(linked[0]?.href?.includes('task_hello'));
});
