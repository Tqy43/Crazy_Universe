import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveFsPath, scopedRelativeFiles, toRelativePath, fileName } from './paths';

test('相对路径与绝对路径互转', () => {
  assert.equal(toRelativePath('D:\\work\\demo\\src\\a.ts', 'D:\\work\\demo'), 'src/a.ts');
  assert.equal(toRelativePath('README.md', 'D:\\work\\demo'), 'README.md');
  assert.equal(resolveFsPath('src/a.ts', 'D:\\work\\demo').toLowerCase().endsWith('src\\a.ts'), true);
  assert.equal(resolveFsPath('D:\\work\\demo\\src\\a.ts', 'D:\\work\\demo'), 'D:\\work\\demo\\src\\a.ts');
});

test('只保留当前 Git 仓库内打开的文件', () => {
  const files = [
    'D:\\Program\\project2\\A_Unieat\\src\\a.ts',
    'D:\\Program\\project2\\B_Unieat\\src\\b.ts',
    'D:\\Program\\Crazy_Universe\\src\\extension.ts',
  ];
  assert.deepEqual(scopedRelativeFiles(files, 'D:\\Program\\project2\\A_Unieat'), ['src/a.ts']);
});

test('fileName 只取最后一段', () => {
  assert.equal(
    fileName('packages/jsy-portal-react/src/cloudmigration/CloudMigrationAddDialog.tsx'),
    'CloudMigrationAddDialog.tsx',
  );
  assert.equal(fileName('D:\\work\\demo\\src\\a.ts'), 'a.ts');
});
