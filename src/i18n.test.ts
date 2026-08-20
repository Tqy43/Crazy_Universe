import assert from 'node:assert/strict';
import { test } from 'node:test';
import { displayGitShort, resolveLocale, setLocale, t } from './i18n';

test('auto 跟随 Cursor 语言', () => {
  assert.equal(resolveLocale('auto', 'zh-cn'), 'zh-cn');
  assert.equal(resolveLocale('auto', 'en'), 'en');
  assert.equal(resolveLocale('en', 'zh-cn'), 'en');
  assert.equal(resolveLocale('zh-cn', 'en'), 'zh-cn');
});

test('英文下翻译 git 摘要', () => {
  setLocale('en');
  try {
    assert.equal(displayGitShort('干净'), 'Clean');
    assert.equal(displayGitShort('3 个已改，1 个新文件'), '3 changed, 1 new files');
    assert.equal(t('view.tasks'), 'Tasks');
  } finally {
    setLocale('zh-cn');
  }
  assert.equal(t('view.tasks'), '任务');
});
