import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { discoverGitRoots } from './gitRoots';

test('工作区根不是仓库时，能发现子目录里的 Git', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'cu-git-'));
  try {
    mkdirSync(path.join(root, 'A_Unieat', '.git'), { recursive: true });
    mkdirSync(path.join(root, 'B_Unieat', '.git'), { recursive: true });
    writeFileSync(path.join(root, 'README.md'), '');
    const found = discoverGitRoots(root).map((item) => path.basename(item)).sort();
    assert.deepEqual(found, ['A_Unieat', 'B_Unieat']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
