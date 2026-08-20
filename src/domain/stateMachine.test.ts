import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertCanTransition,
  canTransition,
  eventTypeFor,
  IllegalTransitionError,
  nextStatus,
} from './stateMachine';

test('允许的状态迁移', () => {
  assert.equal(canTransition('not_started', 'start'), true);
  assert.equal(canTransition('paused', 'start'), true);
  assert.equal(canTransition('completed', 'resume'), true);
  assert.equal(canTransition('in_progress', 'pause'), true);
  assert.equal(canTransition('in_progress', 'complete'), true);
  assert.equal(canTransition('paused', 'complete'), true);
});

test('禁止的状态迁移', () => {
  assert.equal(canTransition('in_progress', 'start'), false);
  assert.equal(canTransition('not_started', 'pause'), false);
  assert.equal(canTransition('paused', 'resume'), false);
  assert.equal(canTransition('not_started', 'resume'), false);
  assert.equal(canTransition('not_started', 'complete'), false);
  assert.equal(canTransition('completed', 'start'), false);
  assert.equal(canTransition('completed', 'complete'), false);
  assert.equal(canTransition('paused', 'pause'), false);
});

test('非法迁移抛出 IllegalTransitionError', () => {
  assert.throws(
    () => assertCanTransition('completed', 'start'),
    (error: unknown) =>
      error instanceof IllegalTransitionError &&
      error.from === 'completed' &&
      error.action === 'start',
  );
});

test('迁移后的目标状态与事件类型', () => {
  assert.equal(nextStatus('start'), 'in_progress');
  assert.equal(nextStatus('resume'), 'paused');
  assert.equal(nextStatus('pause'), 'paused');
  assert.equal(nextStatus('complete'), 'completed');
  assert.equal(eventTypeFor('start'), 'task.started');
  assert.equal(eventTypeFor('resume'), 'task.resumed');
  assert.equal(eventTypeFor('pause'), 'task.paused');
  assert.equal(eventTypeFor('complete'), 'task.completed');
});
