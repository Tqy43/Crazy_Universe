import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertReadonlyGitArgs, GIT_READONLY_COMMANDS } from './gitCommands';
import {
  filterCommitsInPeriod,
  formatGitShortText,
  parseGitLog,
  parsePorcelainZ,
  toGitStatusSummary,
} from './gitParse';

test('白名单不含写操作', () => {
  const joined = GIT_READONLY_COMMANDS.flat().join(' ');
  assert.equal(/commit|checkout|push|reset|merge|rebase/.test(joined), false);
  assert.doesNotThrow(() => assertReadonlyGitArgs(['status', '--porcelain=v1', '-z']));
  assert.doesNotThrow(() => assertReadonlyGitArgs(['log', '-30', '--format=%h%x09%s%x09%aI']));
  assert.throws(() => assertReadonlyGitArgs(['commit', '-m', 'x']));
  assert.throws(() => assertReadonlyGitArgs(['status']));
});

test('解析 porcelain -z：修改、未跟踪、重命名', () => {
  const data = ['M  src/a.ts', ' M src/b.ts', '?? new.ts', 'R  old.ts', 'renamed.ts', ''].join('\0');
  const parsed = parsePorcelainZ(data);
  assert.equal(parsed.stagedCount, 2);
  assert.equal(parsed.unstagedCount, 1);
  assert.equal(parsed.untrackedCount, 1);
  assert.deepEqual(parsed.changedPaths, ['src/a.ts', 'src/b.ts', 'new.ts', 'renamed.ts']);
  assert.equal(formatGitShortText(parsed), '3 个已改，1 个新文件');
  const summary = toGitStatusSummary(parsed, false);
  assert.equal(summary.dirty, true);
  assert.equal(summary.changedPaths, undefined);
});

test('干净工作区', () => {
  const parsed = parsePorcelainZ('');
  assert.equal(formatGitShortText(parsed), '干净');
  assert.equal(toGitStatusSummary(parsed, true).dirty, false);
});

test('解析 git log', () => {
  const commits = parseGitLog('a1b2c3d\t加登录态\t2026-08-19T10:00:00+08:00\n');
  assert.equal(commits.length, 1);
  assert.equal(commits[0]?.hash, 'a1b2c3d');
  assert.equal(commits[0]?.subject, '加登录态');
});

test('只保留时间窗口内的 commit', () => {
  const commits = [
    { hash: 'old', subject: 'init', authorTime: '2026-08-19T00:00:00.000Z' },
    { hash: 'new', subject: 'task', authorTime: '2026-08-20T10:00:00.000Z' },
  ];
  const kept = filterCommitsInPeriod(
    commits,
    '2026-08-20T09:00:00.000Z',
    '2026-08-20T11:00:00.000Z',
  );
  assert.deepEqual(
    kept.map((item) => item.hash),
    ['new'],
  );
});

test('没有可解析时间时仍保留 git 已筛出的 commit', () => {
  const kept = filterCommitsInPeriod(
    [{ hash: 'abc1234', subject: 'wip', authorTime: '' }],
    '2026-08-20T09:00:00.000Z',
    '2026-08-20T11:00:00.000Z',
  );
  assert.equal(kept[0]?.hash, 'abc1234');
});

test('允许带 --since 或 hash 范围的 log', () => {
  assert.doesNotThrow(() =>
    assertReadonlyGitArgs(['log', '-30', '--since=2026-08-20T00:00:00Z', '--format=%h%x09%s%x09%cI']),
  );
  assert.doesNotThrow(() =>
    assertReadonlyGitArgs(['log', '-30', 'abc1234..HEAD', '--format=%h%x09%s%x09%cI']),
  );
});
