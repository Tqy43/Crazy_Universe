import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FEISHU_PROJECT_HOST, findCommitFeishuRef, findFeishuRef } from './links';

test('没有飞书任务时显示 #none', () => {
  assert.deepEqual(findFeishuRef('修登录页', '下一步补测试'), { text: '#none' });
});

test('从正文识别飞书链接', () => {
  const ref = findFeishuRef('见 https://applink.feishu.cn/client/todo/detail?guid=abc-123 处理');
  assert.equal(ref.text, '#abc-123');
  assert.equal(ref.href, 'https://applink.feishu.cn/client/todo/detail?guid=abc-123');
});

test('m/f/g 前缀分别打开需求、缺陷、任务', () => {
  const story = findFeishuRef('飞书 #m-6987718013');
  assert.equal(story.text, '#m-6987718013');
  assert.equal(story.href, `${FEISHU_PROJECT_HOST}/story/detail/6987718013`);

  const issue = findFeishuRef('fix: 登录失败 #f-1234567890');
  assert.equal(issue.text, '#f-1234567890');
  assert.equal(issue.href, `${FEISHU_PROJECT_HOST}/issue/detail/1234567890`);

  const assignment = findFeishuRef('关联 g-1234567890');
  assert.equal(assignment.text, '#g-1234567890');
  assert.equal(assignment.href, `${FEISHU_PROJECT_HOST}/assignment/detail/1234567890`);
});

test('提交说明里的长数字编号可跳转，PR 短号不误认', () => {
  const none = findCommitFeishuRef('修登录页');
  assert.deepEqual(none, { text: '#none' });

  const prAndId = findCommitFeishuRef(
    'Pull request #8338: feat: 完成数据预览功能 #7075239972',
  );
  assert.equal(prAndId.text, '#7075239972');
  assert.equal(prAndId.href, `${FEISHU_PROJECT_HOST}/story/detail/7075239972`);

  const tagged = findCommitFeishuRef('fix: 补充数据预览截断提示 #m-6987718013');
  assert.equal(tagged.text, '#m-6987718013');
  assert.equal(tagged.href, `${FEISHU_PROJECT_HOST}/story/detail/6987718013`);

  const fromUrl = findCommitFeishuRef(
    '见 https://project.feishu.cn/b2rl2h/assignment/detail/1234567890',
  );
  assert.equal(fromUrl.text, '#g-1234567890');
  assert.equal(fromUrl.href, 'https://project.feishu.cn/b2rl2h/assignment/detail/1234567890');
});
