import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IllegalTransitionError } from './stateMachine';
import { TaskService } from './TaskService';
import { assertInvariants, emptyStore, type StoreFile, type TaskStoreLike } from '../store/schema';
import type { Event, Task, WorkContext } from '../types';

class MemoryStore implements TaskStoreLike {
  data: StoreFile = emptyStore();

  getTasks(): Task[] {
    return this.data.tasks;
  }

  getTask(id: string): Task | undefined {
    return this.data.tasks.find((task) => task.id === id);
  }

  getEvents(taskId?: string): Event[] {
    if (!taskId) {
      return this.data.events;
    }
    return this.data.events.filter((event) => event.taskId === taskId);
  }

  async commit(mutate: (draft: StoreFile) => void): Promise<void> {
    const draft = structuredClone(this.data);
    mutate(draft);
    assertInvariants(draft);
    this.data = draft;
  }
}

function context(): WorkContext {
  return {
    workspacePath: 'D:\\work\\demo',
    projectName: 'demo',
    recordedAt: '2026-08-19T00:00:00.000Z',
  };
}

function serviceWith(store = new MemoryStore()) {
  return { store, service: new TaskService(store, context) };
}

test('创建任务为未开始，并写入 task.created', async () => {
  const { store, service } = serviceWith();
  const task = await service.createTask('实现登录页');
  assert.equal(task.status, 'not_started');
  assert.equal(store.getEvents(task.id)[0]?.type, 'task.created');
});

test('开始任务变为进行中，并写入 task.started', async () => {
  const { store, service } = serviceWith();
  const task = await service.createTask('A');
  await service.start(task.id);
  assert.equal(store.getTask(task.id)?.status, 'in_progress');
  assert.ok(store.getEvents(task.id).some((event) => event.type === 'task.started'));
});

test('开始第二件会暂停第一件，两次写入同一 commit', async () => {
  const { store, service } = serviceWith();
  const first = await service.createTask('做个人中心');
  const second = await service.createTask('修导航栏错位');
  await service.start(first.id);
  const { pausedTitle } = await service.start(second.id);

  assert.equal(pausedTitle, '做个人中心');
  assert.equal(store.getTask(first.id)?.status, 'paused');
  assert.equal(store.getTask(second.id)?.status, 'in_progress');
  assert.equal(store.getTasks().filter((task) => task.status === 'in_progress').length, 1);
  const paused = store.getEvents(first.id).find((event) => event.type === 'task.paused');
  assert.ok(paused);
  assert.equal(paused.body, '暂停 — 修导航栏错位任务进行中');
  assert.ok(store.getEvents(second.id).some((event) => event.type === 'task.started'));
});

test('暂停可带下一步计划，Esc/空字符串则 body 为空', async () => {
  const { store, service } = serviceWith();
  const task = await service.createTask('A');
  await service.start(task.id);
  await service.pause(task.id, '  ');
  const skipped = store.getEvents(task.id).filter((event) => event.type === 'task.paused').at(-1);
  assert.equal(store.getTask(task.id)?.status, 'paused');
  assert.equal(skipped?.body, undefined);

  await service.start(task.id);
  await service.pause(task.id, ' 回来先接预签名 URL ');
  const withPlan = store.getEvents(task.id).filter((event) => event.type === 'task.paused').at(-1);
  assert.equal(withPlan?.body, '回来先接预签名 URL');
});

test('已暂停用开始接回，写入 task.started，且仍最多一个进行中', async () => {
  const { store, service } = serviceWith();
  const first = await service.createTask('A');
  const second = await service.createTask('B');
  await service.start(first.id);
  await service.pause(first.id);
  await service.start(second.id);
  const { pausedTitle } = await service.start(first.id);

  assert.equal(pausedTitle, 'B');
  assert.equal(store.getTask(first.id)?.status, 'in_progress');
  assert.equal(store.getTask(second.id)?.status, 'paused');
  assert.equal(
    store.getEvents(second.id).filter((event) => event.type === 'task.paused').at(-1)?.body,
    '暂停 — A任务进行中',
  );
  assert.ok(store.getEvents(first.id).filter((event) => event.type === 'task.started').length >= 2);
});

test('已完成可恢复到活动（已暂停），不能直接开始', async () => {
  const { store, service } = serviceWith();
  const task = await service.createTask('A');
  await service.start(task.id);
  await service.complete(task.id, '已合并');
  await assert.rejects(() => service.start(task.id), IllegalTransitionError);

  await service.resume(task.id);
  assert.equal(store.getTask(task.id)?.status, 'paused');
  assert.equal(store.getTask(task.id)?.completedAt, undefined);
  assert.ok(store.getEvents(task.id).some((event) => event.type === 'task.resumed'));

  await service.start(task.id);
  assert.equal(store.getTask(task.id)?.status, 'in_progress');
});

test('完成沉入 completed，可选说明写入事件，不能再开始', async () => {
  const { store, service } = serviceWith();
  const task = await service.createTask('A');
  await service.start(task.id);
  await service.complete(task.id, '已合并');
  assert.equal(store.getTask(task.id)?.status, 'completed');
  assert.ok(store.getTask(task.id)?.completedAt);
  const completed = store.getEvents(task.id).find((event) => event.type === 'task.completed');
  assert.equal(completed?.body, '已合并');
  await assert.rejects(() => service.start(task.id), IllegalTransitionError);
});

test('未开始不能暂停或完成', async () => {
  const { service } = serviceWith();
  const task = await service.createTask('A');
  await assert.rejects(() => service.pause(task.id), IllegalTransitionError);
  await assert.rejects(() => service.complete(task.id), IllegalTransitionError);
});

test('添加标记写入 note.added，已完成则拒绝', async () => {
  const { store, service } = serviceWith();
  const task = await service.createTask('A');
  await service.addNote(task.id, 'next', ' 回来先补测试 ');
  const note = store.getEvents(task.id).find((event) => event.type === 'note.added');
  assert.equal(note?.noteKind, 'next');
  assert.equal(note?.body, '回来先补测试');
  await service.start(task.id);
  await service.complete(task.id);
  await assert.rejects(() => service.addNote(task.id, 'other', 'x'), /恢复到活动/);
});

test('完整快照会写入事件', async () => {
  const store = new MemoryStore();
  const service = new TaskService(store, () => ({
    context: {
      workspacePath: 'D:\\work\\demo',
      projectName: 'demo',
      gitRoot: 'D:\\work\\demo',
      branch: 'feat/profile',
      recordedAt: '2026-08-19T00:00:00.000Z',
    },
    openFiles: ['src/a.ts'],
    activeFile: 'src/a.ts',
    gitStatusSummary: {
      available: true,
      dirty: true,
      stagedCount: 0,
      unstagedCount: 3,
      untrackedCount: 1,
      shortText: '3 个已修改，1 个未跟踪',
      changedPaths: ['src/a.ts'],
    },
    recentCommits: [{ hash: 'a1b2c3d', subject: '加登录态', authorTime: '2026-08-19T00:00:00.000Z' }],
  }));
  const task = await service.createTask('做个人中心');
  const created = store.getEvents(task.id)[0];
  assert.equal(created?.snapshot?.context.branch, 'feat/profile');
  assert.equal(created?.snapshot?.gitStatusSummary.shortText, '3 个已修改，1 个未跟踪');
  assert.equal(created?.snapshot?.openFiles[0], 'src/a.ts');
  assert.equal(created?.snapshot?.recentCommits.length, 0);
});

test('暂停时只保留本次开始之后的 commit', async () => {
  const store = new MemoryStore();
  const snapshot = {
    context: {
      workspacePath: 'D:\\work\\demo',
      projectName: 'demo',
      branch: 'main',
      recordedAt: new Date().toISOString(),
    },
    openFiles: [] as string[],
    gitStatusSummary: {
      available: true,
      dirty: false,
      stagedCount: 0,
      unstagedCount: 0,
      untrackedCount: 0,
      shortText: '干净',
    },
    recentCommits: [
      { hash: 'old', subject: 'init', authorTime: '2020-01-01T00:00:00.000Z' },
      { hash: 'new', subject: 'wip', authorTime: new Date().toISOString() },
    ],
  };
  const service = new TaskService(store, () => ({
    ...snapshot,
    recentCommits: snapshot.recentCommits,
  }));
  const task = await service.createTask('A');
  await service.start(task.id);
  snapshot.recentCommits = [
    { hash: 'old', subject: 'init', authorTime: '2020-01-01T00:00:00.000Z' },
    { hash: 'new', subject: 'wip', authorTime: new Date().toISOString() },
  ];
  await service.pause(task.id);
  const paused = store.getEvents(task.id).find((event) => event.type === 'task.paused');
  assert.deepEqual(paused?.snapshot?.recentCommits.map((item) => item.hash), ['new']);
});

test('暂停采集会带上本次开始时间', async () => {
  const store = new MemoryStore();
  const seen: Array<{ since?: string } | undefined> = [];
  const service = new TaskService(store, (options) => {
    seen.push(options);
    return context();
  });
  const task = await service.createTask('A');
  await service.start(task.id);
  await service.pause(task.id);
  const pauseOptions = seen.at(-1);
  assert.ok(pauseOptions?.since, '暂停时应把开始时间交给 Git log --since');
});
