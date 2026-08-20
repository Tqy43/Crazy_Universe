import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findFeishuRef } from './links';

test('没有飞书任务时显示 #none', () => {
  assert.deepEqual(findFeishuRef('修登录页', '下一步补测试'), { text: '#none' });
});

test('从正文识别飞书链接', () => {
  const ref = findFeishuRef('见 https://applink.feishu.cn/client/todo/detail?guid=abc-123 处理');
  assert.equal(ref.text, '#abc-123');
  assert.equal(ref.href, 'https://applink.feishu.cn/client/todo/detail?guid=abc-123');
});

test('飞书 #id 可跳转', () => {
  const ref = findFeishuRef('飞书 #task_hello');
  assert.equal(ref.text, '#task_hello');
  assert.ok(ref.href?.includes('task_hello'));
});
