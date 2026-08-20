import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Event } from '../types';
import { setLocale } from '../i18n';
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

test('提交列表带总数、飞书 ID，不截断数据也不提示还有 n 条', () => {
  const details = snapshotDetails(
    {
      context: {
        workspacePath: 'D:\\work\\demo',
        projectName: 'demo',
        branch: 'release',
        recordedAt: '2026-08-20T01:00:00.000Z',
      },
      openFiles: ['D:\\work\\demo\\src\\a.ts', 'D:\\work\\demo\\src\\b.ts'],
      activeFile: 'D:\\work\\demo\\src\\cloud\\Dialog.tsx',
      gitStatusSummary: {
        available: true,
        dirty: false,
        stagedCount: 0,
        unstagedCount: 0,
        untrackedCount: 0,
        shortText: '干净',
      },
      recentCommits: Array.from({ length: 12 }, (_, index) => ({
        hash: `h${index}`,
        subject:
          index === 0
            ? 'Pull request #8338: feat: 完成数据预览功能 #7075239972'
            : `commit ${index}`,
        authorTime: '2026-08-20T01:00:00.000Z',
      })),
    },
    { includeOpenFiles: true, includeChangedPaths: true },
    'task.paused',
  );
  assert.equal(details.some((item) => item.label === '分支'), false);
  assert.equal(details.some((item) => item.label === '未提交改动'), false);
  assert.equal(details.some((item) => item.label === '当时打开的文件'), false);
  assert.equal(details.some((item) => item.label === '飞书'), false);

  const active = details.find((item) => item.label === '当时正在看的文件');
  assert.deepEqual(active?.files, [
    { label: 'Dialog.tsx', path: 'D:\\work\\demo\\src\\cloud\\Dialog.tsx' },
  ]);

  const commits = details.find((item) => item.label.startsWith('本任务期间的提交'));
  assert.equal(commits?.label, '本任务期间的提交（12）');
  assert.equal(commits?.commits?.length, 12);
  assert.equal(commits?.value, undefined);
  assert.equal(commits?.commits?.[0]?.hash, 'h0');
  assert.equal(commits?.commits?.[0]?.feishuText, '#7075239972');
  assert.equal(
    commits?.commits?.[0]?.feishuHref,
    'https://project.feishu.cn/b2rl2h/story/detail/7075239972',
  );
  assert.equal(commits?.commits?.[1]?.feishuText, '#none');
  assert.equal(commits?.commits?.[1]?.feishuHref, undefined);
});

test('没有快照时不再单独显示飞书', () => {
  const none = snapshotDetails(undefined, { includeOpenFiles: false, includeChangedPaths: false }, 'note.added');
  assert.deepEqual(none, []);
});

test('英文界面下快照标签切换', () => {
  setLocale('en');
  try {
    const details = snapshotDetails(
      {
        context: {
          workspacePath: 'D:\\work\\demo',
          projectName: 'demo',
          recordedAt: '2026-08-20T01:00:00.000Z',
        },
        openFiles: [],
        activeFile: 'D:\\work\\demo\\src\\a.ts',
        gitStatusSummary: {
          available: true,
          dirty: false,
          stagedCount: 0,
          unstagedCount: 0,
          untrackedCount: 0,
          shortText: '干净',
        },
        recentCommits: [],
      },
      { includeOpenFiles: true, includeChangedPaths: true },
      'task.paused',
    );
    assert.equal(details.find((item) => item.label === 'File in view')?.files?.[0]?.label, 'a.ts');
    assert.equal(details.find((item) => item.label === 'Commits during this task (0)')?.value, 'No new commits since this start');
    assert.equal(snapshotSummaryLine({
      context: {
        workspacePath: 'D:\\work\\demo',
        projectName: 'demo',
        branch: 'main',
        recordedAt: '2026-08-20T01:00:00.000Z',
      },
      openFiles: [],
      gitStatusSummary: {
        available: true,
        dirty: false,
        stagedCount: 0,
        unstagedCount: 0,
        untrackedCount: 0,
        shortText: '干净',
      },
      recentCommits: [],
    }), 'main · Clean');
  } finally {
    setLocale('zh-cn');
  }
});
