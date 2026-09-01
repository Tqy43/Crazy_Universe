import { DISPLAY_COMMITS } from '../snapshot/gitParse';
import { FEISHU_PREFIX_API, FEISHU_PROJECT_HOST } from '../feishu/links';
import type { TimelineViewModel } from './timelineModel';

function nonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let i = 0; i < 32; i += 1) {
    value += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return value;
}

export function renderTimelineShell(): { html: string } {
  const cspNonce = nonce();
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${cspNonce}'" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>时间线</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    html, body {
      height: 100%;
      overflow: hidden;
    }
    body {
      margin: 0;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      line-height: 1.4;
    }
    button, select, textarea {
      font: inherit;
      color: inherit;
    }
    .empty {
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      color: var(--vscode-descriptionForeground);
      text-align: center;
    }
    .page {
      position: relative;
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }
    .copy {
      background: transparent;
      border: none;
      padding: 0;
      cursor: pointer;
      color: var(--vscode-textLink-foreground);
    }
    .btn {
      height: 24px;
      padding: 0 8px;
      border: 1px solid transparent;
      border-radius: 2px;
      cursor: pointer;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }
    .btn.primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn:hover { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-toolbar-hoverBackground)); }
    .btn.primary:hover { background: var(--vscode-button-hoverBackground); }
    .git-hint {
      flex-shrink: 0;
      margin: 8px 12px 0;
      padding: 6px 8px;
      background: var(--vscode-inputValidation-infoBackground);
      border: 1px solid var(--vscode-inputValidation-infoBorder);
      color: var(--vscode-foreground);
      font-size: 12px;
      display: flex;
      gap: 8px;
      align-items: flex-start;
      justify-content: space-between;
    }
    .git-hint button {
      flex-shrink: 0;
    }
    .worklog-bar, .mode-bar {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      border-bottom: 1px solid var(--vscode-sideBar-border, var(--vscode-widget-border));
    }
    .mode-bar { padding-top: 8px; }
    .mode-btn {
      height: 22px;
      padding: 0 8px;
      border: none;
      border-radius: 3px;
      background: transparent;
      color: var(--vscode-foreground);
      cursor: pointer;
    }
    .mode-btn.active {
      background: var(--vscode-toolbar-hoverBackground);
    }
    .worklog-bar .summary {
      flex: 1;
      min-width: 0;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
    .worklog-hint {
      flex-shrink: 0;
      margin: 0;
      padding: 6px 12px 8px;
      color: var(--vscode-errorForeground);
      font-size: 11px;
      line-height: 1.4;
      border-bottom: 1px solid var(--vscode-sideBar-border, var(--vscode-widget-border));
    }
    .segment {
      position: relative;
      margin: 0 4px 10px;
      padding: 8px 8px 8px 10px;
      border: 1px solid var(--vscode-widget-border, var(--vscode-sideBar-border));
      border-radius: 4px;
      background: var(--vscode-editor-background, var(--vscode-sideBar-background));
    }
    .segment-foots {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin-top: 6px;
    }
    .segment-cross {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      white-space: nowrap;
    }
    .segment-cross svg {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
    }
    .segment.open-seg { opacity: 0.72; }
    .segment-head {
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }
    .segment-head input { margin-top: 3px; }
    .segment-title {
      flex: 1;
      min-width: 0;
      font-size: 12px;
    }
    .segment-title strong {
      font-weight: 600;
      display: block;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .segment-meta {
      margin-top: 2px;
      min-width: 0;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .worklog-fields {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 0 12px 12px;
    }
    .worklog-fields label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin: 0;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
    }
    .worklog-fields input[type="text"],
    .worklog-fields input[type="number"],
    .worklog-fields input[type="datetime-local"],
    .worklog-fields textarea {
      width: 100%;
      min-height: 26px;
      margin: 0;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, var(--vscode-dropdown-border));
      border-radius: 2px;
      padding: 4px 8px;
    }
    .worklog-fields textarea {
      min-height: 0;
      max-height: none;
      margin-bottom: 0;
      resize: none;
    }
    .worklog-fields input:focus,
    .worklog-fields textarea:focus {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: -1px;
    }
    .work-item-input {
      display: flex;
      align-items: stretch;
      width: 100%;
      min-height: 26px;
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, var(--vscode-dropdown-border));
      border-radius: 2px;
    }
    .work-item-input:focus-within {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: -1px;
    }
    .work-item-hash {
      display: flex;
      align-items: center;
      padding: 0 0 0 8px;
      color: var(--vscode-descriptionForeground);
      user-select: none;
    }
    .work-item-input #workItem {
      border: none;
      width: auto;
      flex: 1;
      min-width: 0;
      padding-left: 2px;
    }
    .work-item-input #workItem:focus {
      outline: none;
    }
    .worklog-row {
      display: grid;
      grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
      gap: 8px;
      align-items: end;
    }
    .worklog-panel {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      background: var(--vscode-sideBar-background);
    }
    .worklog-panel-head {
      flex-shrink: 0;
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 12px 6px;
      font-size: 13px;
      font-weight: 600;
    }
    .worklog-pager {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }
    .worklog-step {
      min-width: 2.5em;
      text-align: center;
      font-size: 12px;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
    }
    .worklog-page-btn {
      width: 24px;
      height: 24px;
      padding: 0;
      border: none;
      border-radius: 0;
      background: transparent;
      color: var(--vscode-foreground);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .worklog-page-btn svg {
      display: block;
    }
    .worklog-page-btn:hover:not(:disabled) {
      color: var(--vscode-textLink-foreground);
      background: transparent;
    }
    .worklog-page-btn:disabled {
      opacity: 0.35;
      cursor: default;
    }
    .worklog-cancel-all {
      margin-right: auto;
    }
    .worklog-panel-sum {
      flex-shrink: 0;
      margin: 0 12px 10px;
      padding: 6px 8px;
      border-radius: 3px;
      background: var(--vscode-textBlockQuote-background, var(--vscode-editor-inactiveSelectionBackground));
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
    .worklog-panel-body {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .worklog-panel-body .worklog-fields {
      flex: 1;
      min-height: 0;
    }
    .worklog-desc {
      flex: 1;
      min-height: 0;
    }
    .worklog-desc textarea {
      flex: 1;
      min-height: 0;
      height: auto;
      resize: none;
    }
    .worklog-error {
      flex-shrink: 0;
      margin: 0 12px 8px;
      color: var(--vscode-errorForeground);
      font-size: 12px;
      line-height: 1.4;
    }
    .worklog-error.ok {
      color: var(--vscode-foreground);
    }
    .field-error {
      margin: 2px 0 0;
      color: var(--vscode-errorForeground);
      font-size: 11px;
      line-height: 1.35;
    }
    .work-item-input.invalid,
    .worklog-fields input.invalid {
      outline: 1px solid var(--vscode-inputValidation-errorBorder, var(--vscode-errorForeground));
      outline-offset: -1px;
    }
    .worklog-login-link {
      display: inline;
      padding: 0;
      border: none;
      background: transparent;
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
      font: inherit;
      text-decoration: underline;
    }
    .worklog-login-link:hover {
      color: var(--vscode-textLink-activeForeground);
    }
    .worklog-panel-foot {
      flex-shrink: 0;
      display: flex;
      flex-wrap: nowrap;
      justify-content: flex-end;
      align-items: center;
      gap: 6px;
      min-width: 0;
      padding: 8px 12px 12px;
      border-top: 1px solid var(--vscode-sideBar-border, var(--vscode-widget-border));
    }
    .worklog-panel-foot .btn {
      flex: 0 1 auto;
    }
    .worklog-panel-foot .btn.primary {
      flex: 1 1 auto;
    }
    .work-item-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-width: 0;
    }
    .work-item-jump {
      border: none;
      background: transparent;
      padding: 0;
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
      font: inherit;
      text-decoration: underline;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 58%;
    }
    .work-item-jump:hover {
      color: var(--vscode-textLink-activeForeground);
    }
    .feed {
      position: relative;
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding: 10px 12px 16px 8px;
      scrollbar-width: none;
    }
    .feed.segments::before { display: none; }
    .feed::-webkit-scrollbar {
      width: 0;
      height: 0;
      display: none;
    }
    .feed::before {
      content: "";
      position: absolute;
      left: 18px;
      top: 16px;
      bottom: 16px;
      width: 2px;
      background: var(--vscode-widget-border, var(--vscode-sideBar-border));
    }
    .sep {
      margin: 4px 0 10px 22px;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      letter-spacing: 0.02em;
    }
    .event {
      position: relative;
      padding: 0 0 14px 22px;
      margin: 0;
    }
    .event::before {
      content: "";
      position: absolute;
      left: 7px;
      top: 6px;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      box-shadow: 0 0 0 3px var(--vscode-sideBar-background);
    }
    .event.note::before { background: var(--vscode-textLink-foreground); }
    .event.started::before { background: var(--vscode-charts-green); }
    .event.paused::before { background: var(--vscode-charts-yellow); }
    .event.completed::before { background: var(--vscode-charts-blue); }
    .event.resumed::before { background: var(--vscode-charts-yellow); }
    .event.created::before { background: var(--vscode-disabledForeground); }
    .event.system::before { background: var(--vscode-charts-orange); }
    .row { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; }
    .meta { color: var(--vscode-descriptionForeground); }
    .date { color: var(--vscode-descriptionForeground); font-size: 11px; margin-bottom: 2px; }
    .body {
      margin-top: 4px;
      white-space: pre-wrap;
      word-break: break-word;
      display: -webkit-box;
      -webkit-line-clamp: 6;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .body.expanded { -webkit-line-clamp: unset; overflow: visible; }
    .snap {
      margin-top: 4px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
    .snap summary { cursor: pointer; }
    .snap-static { margin-top: 4px; }
    .snap dl { margin: 4px 0 0; }
    .snap dt { color: var(--vscode-descriptionForeground); font-size: 11px; }
    .snap dt:not(:first-child) {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--vscode-widget-border, var(--vscode-sideBar-border));
    }
    .snap dd { margin: 0 0 6px; white-space: pre-wrap; word-break: break-word; }
    .file-link {
      display: block;
      margin: 0 0 2px;
      padding: 0;
      border: none;
      background: transparent;
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
      text-align: left;
      text-decoration: underline;
      word-break: break-word;
    }
    .file-link.ext-link { display: inline; }
    .commits { list-style: none; margin: 0; padding: 0; }
    .commit { margin: 0 0 8px; }
    .commit.hidden-commit { display: none; }
    .commits-expanded .commit.hidden-commit { display: block; }
    .commit-head {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: baseline;
    }
    .commit-hash {
      font-family: var(--vscode-editor-font-family, inherit);
      color: var(--vscode-descriptionForeground);
    }
    .feishu-muted { color: var(--vscode-disabledForeground); }
    .commit-toggle {
      border: none;
      background: transparent;
      padding: 0;
      cursor: pointer;
      color: var(--vscode-descriptionForeground);
      line-height: 1;
    }
    .commit-toggle::before { content: "▸"; }
    .commit.open .commit-toggle::before { content: "▾"; }
    .commit-msg {
      display: none;
      margin-top: 2px;
      word-break: break-word;
    }
    .commit.open .commit-msg { display: block; }
    .commit-more {
      margin-top: 2px;
      background: transparent;
      border: none;
      padding: 0;
      cursor: pointer;
      color: var(--vscode-textLink-foreground);
    }
    .error {
      flex-shrink: 0;
      color: var(--vscode-errorForeground);
      font-size: 12px;
      margin: 0 12px 8px;
    }
    .composer {
      flex-shrink: 0;
      border-top: 1px solid var(--vscode-sideBar-border, var(--vscode-widget-border));
      padding: 8px 12px 12px;
      background: var(--vscode-sideBar-background);
    }
    .composer h2 { margin: 0 0 8px; font-size: 12px; font-weight: 600; display: flex; justify-content: space-between; }
    .composer label { display: block; margin-bottom: 4px; color: var(--vscode-descriptionForeground); font-size: 12px; }
    select, textarea {
      width: 100%;
      background: var(--vscode-dropdown-background, var(--vscode-input-background));
      color: var(--vscode-dropdown-foreground, var(--vscode-input-foreground));
      border: 1px solid var(--vscode-dropdown-border, var(--vscode-input-border));
      border-radius: 2px;
      padding: 4px 6px;
    }
    textarea { min-height: 4.5em; max-height: 12em; resize: vertical; margin-bottom: 6px; }
    .preview { color: var(--vscode-descriptionForeground); font-size: 11px; margin-bottom: 8px; }
    .composer-actions { display: flex; justify-content: flex-end; gap: 6px; }
    .hidden { display: none !important; }
  </style>
</head>
<body>
  <div id="empty" class="empty">选择一个任务以查看时间线</div>
  <div id="page" class="page hidden">
      <div id="gitHint" class="git-hint hidden">
        <span id="gitHintText"></span>
        <button class="copy" id="dismissGit" type="button">关闭</button>
      </div>
      <div id="modeBar" class="mode-bar hidden">
        <button class="mode-btn active" type="button" data-view="events" id="viewEvents">事件</button>
        <button class="mode-btn" type="button" data-view="segments" id="viewSegments">工作段</button>
      </div>
      <div id="worklogBar" class="worklog-bar hidden">
        <span class="summary" id="worklogSummary"></span>
        <button class="btn primary" type="button" id="worklogRegister">登记工时</button>
      </div>
      <p class="worklog-hint hidden" id="worklogHint"></p>
      <div id="feed" class="feed"></div>
      <div id="worklogPanel" class="worklog-panel hidden">
        <div class="worklog-panel-head">
          <span id="worklogModalTitle">登记工时</span>
          <div class="worklog-pager hidden" id="worklogPager">
            <button type="button" id="worklogPrev" class="worklog-page-btn" aria-label="prev">
              <svg width="16" height="16" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M31 36L19 24L31 12" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <span class="worklog-step" id="worklogStep">1/2</span>
            <button type="button" id="worklogNext" class="worklog-page-btn" aria-label="next">
              <svg width="16" height="16" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M19 12L31 24L19 36" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
        </div>
        <p class="worklog-panel-sum" id="worklogPanelSum"></p>
        <div class="worklog-panel-body">
          <div id="worklogFields" class="worklog-fields">
            <label><span class="work-item-head"><span id="workItemLabel">工作项</span>
              <button type="button" class="work-item-jump hidden" id="workItemJump" data-href=""></button></span>
              <span class="work-item-input" id="workItemWrap"><span class="work-item-hash" aria-hidden="true">#</span>
              <input id="workItem" type="text" /></span>
              <span class="field-error hidden" id="workItemError"></span></label>
            <div class="worklog-row">
              <label><span id="workStartedLabel">开始时间</span>
                <input id="workStarted" type="datetime-local" />
                <span class="field-error hidden" id="workStartedError"></span></label>
              <label><span id="workMinutesLabel">工时（分钟）</span>
                <input id="workMinutes" type="number" min="0" step="1" />
                <span class="field-error hidden" id="workMinutesError"></span></label>
            </div>
            <label class="worklog-desc"><span id="workDescriptionLabel">说明</span>
              <textarea id="workDescription"></textarea></label>
          </div>
        </div>
        <p class="worklog-error hidden" id="worklogError"></p>
        <div class="worklog-panel-foot">
          <button class="btn worklog-cancel-all hidden" id="worklogCancelAll" type="button">全部取消</button>
          <button class="btn" id="worklogCancel" type="button">取消</button>
          <button class="btn primary" id="worklogSave" type="button">确认登记</button>
        </div>
      </div>
      <p id="error" class="error hidden"></p>
      <div id="composer" class="composer hidden">
        <h2><span id="composerTitle">添加标记</span> <button class="copy" id="collapse" type="button">收起</button></h2>
        <div id="noteFields">
          <label for="kind" id="kindLabel">类型</label>
          <select id="kind">
            <option value="change">修改内容</option>
            <option value="action">关键操作</option>
            <option value="test">测试结果</option>
            <option value="commit">提交信息</option>
            <option value="issue">遇到的问题</option>
            <option value="next">下一步计划</option>
            <option value="other" selected>其他</option>
          </select>
          <label for="body" id="bodyLabel">正文</label>
          <textarea id="body" placeholder="记下修改意图、问题或下一步"></textarea>
        </div>
        <div id="preview" class="preview"></div>
        <div class="composer-actions">
          <button class="btn" id="cancel" type="button">取消</button>
          <button class="btn primary" id="save" type="button">保存标记</button>
        </div>
      </div>
    </div>
  <script nonce="${cspNonce}">
    const vscode = acquireVsCodeApi();
    const FEISHU_HOST = ${JSON.stringify(FEISHU_PROJECT_HOST)};
    const FEISHU_API = ${JSON.stringify(FEISHU_PREFIX_API)};
    const emptyEl = document.getElementById('empty');
    const pageEl = document.getElementById('page');
    const feedEl = document.getElementById('feed');
    const composerEl = document.getElementById('composer');
    const previewEl = document.getElementById('preview');
    const kindEl = document.getElementById('kind');
    const bodyEl = document.getElementById('body');
    const errorEl = document.getElementById('error');
    const gitHintEl = document.getElementById('gitHint');
    const gitHintTextEl = document.getElementById('gitHintText');
    const modeBarEl = document.getElementById('modeBar');
    const worklogBarEl = document.getElementById('worklogBar');
    const worklogSummaryEl = document.getElementById('worklogSummary');
    const worklogHintEl = document.getElementById('worklogHint');
    const worklogPanelEl = document.getElementById('worklogPanel');
    const worklogPanelSumEl = document.getElementById('worklogPanelSum');
    const workItemEl = document.getElementById('workItem');
    const workItemWrapEl = document.getElementById('workItemWrap');
    const workItemErrorEl = document.getElementById('workItemError');
    const workItemJumpEl = document.getElementById('workItemJump');
    const workStartedEl = document.getElementById('workStarted');
    const workStartedErrorEl = document.getElementById('workStartedError');
    const workMinutesEl = document.getElementById('workMinutes');
    const workMinutesErrorEl = document.getElementById('workMinutesError');
    const workDescriptionEl = document.getElementById('workDescription');
    const worklogStepEl = document.getElementById('worklogStep');
    const worklogPagerEl = document.getElementById('worklogPager');
    const worklogPrevEl = document.getElementById('worklogPrev');
    const worklogNextEl = document.getElementById('worklogNext');
    const worklogCancelEl = document.getElementById('worklogCancel');
    const worklogCancelAllEl = document.getElementById('worklogCancelAll');
    const worklogSaveEl = document.getElementById('worklogSave');
    const worklogErrorEl = document.getElementById('worklogError');
    let ui = {};
    let state = {};
    let selectedIds = [];
    let feedView = 'events';
    let worklogModalOpen = false;
    let worklogErrorTimer = 0;
    let worklogQueue = [];
    let worklogStep = 0;
    let worklogSubmitting = false;

    function applyUi(next) {
      if (!next) {
        return;
      }
      ui = next;
      document.documentElement.lang = next.lang || 'zh-CN';
      document.title = next.timelineTitle || document.title;
      document.getElementById('dismissGit').textContent = next.close || '';
      document.getElementById('composerTitle').textContent = next.addNote || '';
      document.getElementById('collapse').textContent = next.collapse || '';
      document.getElementById('kindLabel').textContent = next.kind || '';
      document.getElementById('bodyLabel').textContent = next.body || '';
      document.getElementById('body').placeholder = next.bodyPlaceholder || '';
      document.getElementById('cancel').textContent = next.cancel || '';
      document.getElementById('save').textContent = next.saveNote || '';
      document.getElementById('viewSegments').textContent = next.worklogViewSegments || '';
      document.getElementById('viewEvents').textContent = next.worklogViewEvents || '';
      document.getElementById('worklogRegister').textContent = next.worklogRegister || '';
      document.getElementById('worklogModalTitle').textContent = next.worklogTitle || '';
      document.getElementById('worklogSave').textContent = next.worklogConfirm || '';
      document.getElementById('worklogCancel').textContent = next.cancel || '';
      document.getElementById('worklogCancelAll').textContent = next.worklogCancelAll || '';
      document.getElementById('workItemLabel').textContent = next.worklogWorkItem || '';
      workItemEl.placeholder = '';
      workItemJumpEl.title = next.worklogOpenWorkItem || '';
      document.getElementById('workStartedLabel').textContent = next.worklogStarted || '';
      document.getElementById('workMinutesLabel').textContent = next.worklogMinutesField || '';
      document.getElementById('workDescriptionLabel').textContent = next.worklogDescription || '';
      const kindMap = {
        change: next.noteChange,
        action: next.noteAction,
        test: next.noteTest,
        commit: next.noteCommit,
        issue: next.noteIssue,
        next: next.noteNext,
        other: next.noteOther,
      };
      Array.from(kindEl.options).forEach((option) => {
        if (kindMap[option.value]) {
          option.textContent = kindMap[option.value];
        }
      });
      if (worklogModalOpen && worklogQueue.length) {
        updateWorklogChrome();
      }
    }

    function showError(message) {
      errorEl.textContent = message || '';
      errorEl.classList.toggle('hidden', !message);
    }

    function showWorklogError(message, ok) {
      window.clearTimeout(worklogErrorTimer);
      worklogErrorTimer = 0;
      if (!message) {
        worklogErrorEl.textContent = '';
        worklogErrorEl.classList.add('hidden');
        worklogErrorEl.classList.remove('ok');
        return;
      }
      worklogErrorEl.classList.toggle('ok', !!ok);
      worklogErrorEl.innerHTML = ok ? escapeHtml(message) : linkifyWorklogLogin(message);
      worklogErrorEl.classList.remove('hidden');
      worklogErrorTimer = window.setTimeout(() => showWorklogError(''), 30000);
    }

    function setFieldError(el, wrap, message) {
      const text = message || '';
      el.textContent = text;
      el.classList.toggle('hidden', !text);
      if (wrap) {
        wrap.classList.toggle('invalid', !!text);
      }
    }

    function clearFieldErrors() {
      setFieldError(workItemErrorEl, workItemWrapEl, '');
      setFieldError(workStartedErrorEl, workStartedEl, '');
      setFieldError(workMinutesErrorEl, workMinutesEl, '');
    }

    function showDraftError(error) {
      clearFieldErrors();
      showWorklogError('');
      if (!error || !error.message) {
        return;
      }
      if (error.field === 'workItem') {
        setFieldError(workItemErrorEl, workItemWrapEl, error.message);
        return;
      }
      if (error.field === 'started') {
        setFieldError(workStartedErrorEl, workStartedEl, error.message);
        return;
      }
      if (error.field === 'minutes') {
        setFieldError(workMinutesErrorEl, workMinutesEl, error.message);
        return;
      }
      showWorklogError(error.message);
    }

    function routeWorklogError(message, ok) {
      if (!message) {
        clearFieldErrors();
        showWorklogError('');
        return;
      }
      if (ok) {
        clearFieldErrors();
        showWorklogError(message, true);
        return;
      }
      if (message === ui.worklogNeedWorkItem) {
        showDraftError({ field: 'workItem', message: message });
        return;
      }
      if (message === ui.worklogNeedMinutes) {
        showDraftError({ field: 'minutes', message: message });
        return;
      }
      if (message === ui.worklogNeedStarted) {
        showDraftError({ field: 'started', message: message });
        return;
      }
      clearFieldErrors();
      showWorklogError(message);
    }

    function linkifyWorklogLogin(message) {
      const label = ui.worklogLoginLink || (ui.lang === 'en' ? 'sign in' : '登录');
      const button =
        '<button type="button" class="worklog-login-link" data-worklog-login="1">' +
        escapeHtml(label) +
        '</button>';
      const escaped = escapeHtml(message);
      if (escaped.includes('登录')) {
        return escaped.split('登录').join(
          '<button type="button" class="worklog-login-link" data-worklog-login="1">登录</button>',
        );
      }
      return escaped.replace(/sign in/gi, () => button);
    }

    function showWorklogHint(message) {
      worklogHintEl.textContent = message || '';
      worklogHintEl.classList.toggle('hidden', !message);
    }

    function setComposer(open) {
      composerEl.classList.toggle('hidden', !open);
      if (open) {
        bodyEl.focus();
      }
    }

    function setWorklogModal(open) {
      worklogModalOpen = !!open;
      worklogPanelEl.classList.toggle('hidden', !open);
      feedEl.classList.toggle('hidden', !!open);
      worklogSaveEl.disabled = false;
      showWorklogError('');
      clearFieldErrors();
      showError('');
      if (open) {
        showWorklogHint('');
        startWorklogWizard();
        workItemEl.focus();
      } else {
        worklogQueue = [];
        worklogStep = 0;
        worklogSubmitting = false;
        workItemEl.disabled = false;
        workStartedEl.disabled = false;
        workMinutesEl.disabled = false;
        workDescriptionEl.disabled = false;
      }
      updateWorklogBar();
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function fillTemplate(template, params) {
      let text = String(template || '');
      Object.keys(params || {}).forEach((key) => {
        text = text.split('{' + key + '}').join(String(params[key] ?? ''));
      });
      return text;
    }

    function formatDuration(minutes) {
      const safe = Math.max(0, Math.round(Number(minutes) || 0));
      if (safe < 60) {
        return safe + 'm';
      }
      const hours = Math.floor(safe / 60);
      const rest = safe % 60;
      return rest === 0 ? hours + 'h' : hours + 'h' + rest + 'm';
    }

    function pad(value) {
      return String(value).padStart(2, '0');
    }

    function toDatetimeLocal(iso) {
      if (!iso) {
        return '';
      }
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) {
        return '';
      }
      return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
        'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
    }

    function fromDatetimeLocal(value) {
      if (!value) {
        return '';
      }
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? '' : date.toISOString();
    }

    function readableFeishu(text) {
      return text && text !== '#none' && text !== '#link';
    }

    function clockLabel(iso) {
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) {
        return iso;
      }
      return pad(date.getHours()) + ':' + pad(date.getMinutes());
    }

    function selectedSegments() {
      const ids = new Set(selectedIds);
      return (state.segments || [])
        .filter((segment) => segment.closed && ids.has(segment.id))
        .slice()
        .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    }

    function stripWorkItemHash(text) {
      return String(text || '').trim().replace(/^[＃#]+/, '').trim();
    }

    function storedWorkItem(text) {
      const body = stripWorkItemHash(text);
      const match = body.match(/^([a-zA-Z]+)-(\\d+)$/);
      if (!match) {
        return body;
      }
      return '#' + match[1].toLowerCase() + '-' + match[2];
    }

    function hrefForWorkItem(text) {
      const match = stripWorkItemHash(text).match(/^([a-zA-Z]+)-(\\d+)$/);
      if (!match) {
        return '';
      }
      const api = FEISHU_API[match[1].toLowerCase()] || match[1].toLowerCase();
      return FEISHU_HOST + '/' + api + '/detail/' + encodeURIComponent(match[2]);
    }

    function syncWorkItemJump() {
      const stored = storedWorkItem(workItemEl.value);
      const href = hrefForWorkItem(stored);
      workItemJumpEl.textContent = href ? stored : '';
      workItemJumpEl.setAttribute('data-href', href);
      workItemJumpEl.classList.toggle('hidden', !href);
    }

    workItemEl.addEventListener('input', () => {
      const cleaned = stripWorkItemHash(workItemEl.value);
      if (cleaned !== workItemEl.value) {
        const cursor = workItemEl.selectionStart;
        workItemEl.value = cleaned;
        if (typeof cursor === 'number') {
          workItemEl.setSelectionRange(Math.max(0, cursor - 1), Math.max(0, cursor - 1));
        }
      }
      syncWorkItemJump();
      stashCurrentWorklogStep();
      setFieldError(workItemErrorEl, workItemWrapEl, '');
    });
    workStartedEl.addEventListener('input', () => {
      stashCurrentWorklogStep();
      setFieldError(workStartedErrorEl, workStartedEl, '');
    });
    workMinutesEl.addEventListener('input', () => {
      stashCurrentWorklogStep();
      setFieldError(workMinutesErrorEl, workMinutesEl, '');
    });
    workDescriptionEl.addEventListener('input', () => {
      stashCurrentWorklogStep();
    });

    function localDayKey(iso) {
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) {
        return '';
      }
      return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
    }

    function formatLocalDayTitle(iso) {
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) {
        return iso || '';
      }
      if (ui.lang === 'en') {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }
      return (date.getMonth() + 1) + '月' + date.getDate() + '日';
    }

    function startOfLocalDay(date) {
      return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }

    function splitSegmentByLocalDays(segment) {
      const startMs = Date.parse(segment.startedAt);
      const endIso = segment.endedAt || segment.startedAt;
      const endMs = Date.parse(endIso);
      const startDay = localDayKey(segment.startedAt);
      const endDay = localDayKey(endIso);
      const crosses = !!(startDay && endDay && startDay !== endDay);
      const fallback = {
        dayKey: startDay || segment.startedAt,
        startedAt: segment.startedAt,
        minutes: segment.minutes || 0,
        segment: segment,
        notes: segment.notes || [],
        fromCrossDay: crosses,
      };
      if (!segment.closed || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
        return [fallback];
      }
      const slices = [];
      let cursor = startOfLocalDay(new Date(startMs));
      while (cursor.getTime() < endMs) {
        const next = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
        const sliceStart = Math.max(startMs, cursor.getTime());
        const sliceEnd = Math.min(endMs, next.getTime());
        const minutes = Math.round((sliceEnd - sliceStart) / 60000);
        if (minutes > 0) {
          const startedAt = new Date(sliceStart).toISOString();
          const dayKey = localDayKey(startedAt) || fallback.dayKey;
          slices.push({
            dayKey: dayKey,
            startedAt: startedAt,
            minutes: minutes,
            segment: segment,
            notes: (segment.notes || []).filter((note) => localDayKey(note.createdAt) === dayKey),
            fromCrossDay: crosses,
          });
        }
        cursor = next;
        if (slices.length > 366) {
          break;
        }
      }
      return slices.length ? slices : [fallback];
    }

    function notesFromSlices(slices) {
      const kindLabels = {
        change: ui.noteChange,
        action: ui.noteAction,
        test: ui.noteTest,
        commit: ui.noteCommit,
        issue: ui.noteIssue,
        next: ui.noteNext,
        other: ui.noteOther,
      };
      const blocks = [];
      let previousFolder;
      slices.forEach((slice) => {
        (slice.notes || []).forEach((note) => {
          const folder = note.workspaceFolder || slice.segment.workspaceFolder;
          if (folder && folder !== previousFolder) {
            blocks.push((ui.worklogFolderMark || '【{folder}】').replace('{folder}', folder));
            previousFolder = folder;
          }
          const kind = kindLabels[note.noteKind] || '';
          blocks.push(clockLabel(note.createdAt) + (kind ? ' ' + kind : '') + '\\n' + (note.body || ''));
        });
      });
      return blocks.join('\\n\\n');
    }

    function latestFeishuFromSlices(slices, dayKey) {
      const all = slices.flatMap((slice) => slice.segment.commits || [])
        .filter((commit) => readableFeishu(commit.feishuText));
      const onDay = all.filter((commit) => localDayKey(commit.authorTime) === dayKey);
      const pool = (onDay.length ? onDay : all).slice().sort((a, b) => {
        const byTime = String(b.authorTime || '').localeCompare(String(a.authorTime || ''));
        return byTime !== 0 ? byTime : String(b.hash || '').localeCompare(String(a.hash || ''));
      });
      return pool[0];
    }

    function draftFromSelection() {
      const selected = selectedSegments();
      if (!selected.length) {
        return { minutes: 0, selectedCount: 0, days: [] };
      }
      const fallback = state.taskWorkItem || {};
      const groups = [];
      const indexByDay = {};
      selected.forEach((segment) => {
        splitSegmentByLocalDays(segment).forEach((slice) => {
          if (!indexByDay[slice.dayKey]) {
            indexByDay[slice.dayKey] = { key: slice.dayKey, slices: [] };
            groups.push(indexByDay[slice.dayKey]);
          }
          indexByDay[slice.dayKey].slices.push(slice);
        });
      });
      groups.forEach((group) => {
        group.slices.sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
      });
      const days = groups.map((group) => {
        const startedAt = group.slices[0].startedAt;
        const minutes = group.slices.reduce((sum, slice) => sum + (slice.minutes || 0), 0);
        const latest = latestFeishuFromSlices(group.slices, group.key);
        return {
          dayKey: group.key,
          dayLabel: formatLocalDayTitle(startedAt),
          startedAt: startedAt,
          minutes: minutes,
          description: notesFromSlices(group.slices),
          segmentIds: Array.from(new Set(group.slices.map((slice) => slice.segment.id))),
          segmentCount: group.slices.length,
          workItemText: latest ? latest.feishuText : (fallback.text || ''),
          fromCrossDay: group.slices.some((slice) => slice.fromCrossDay),
        };
      });
      return {
        minutes: days.reduce((sum, day) => sum + day.minutes, 0),
        selectedCount: selected.length,
        days: days,
      };
    }

    function panelSummaryForDay(day) {
      const key = day.fromCrossDay && ui.worklogDayTitleCross ? 'worklogDayTitleCross' : 'worklogDayTitle';
      return fillTemplate(ui[key] || ui.worklogDayTitle, {
        date: day.dayLabel,
        count: day.segmentCount,
        duration: formatDuration(day.minutes),
      });
    }

    function updateWorklogBar() {
      const draft = draftFromSelection();
      worklogSummaryEl.textContent = draft.selectedCount
        ? fillTemplate(ui.worklogBarSelected, { count: draft.selectedCount, duration: formatDuration(draft.minutes) })
        : (ui.worklogBarEmpty || '');
      const showBar = !!state.worklogMode && feedView === 'segments' && !worklogModalOpen;
      worklogBarEl.classList.toggle('hidden', !showBar);
      if (!showBar) {
        showWorklogHint('');
      } else if (draft.selectedCount) {
        showWorklogHint('');
      }
    }

    function startWorklogWizard() {
      const draft = draftFromSelection();
      worklogQueue = draft.days.map((day) => Object.assign({ status: 'pending' }, day));
      worklogStep = 0;
      loadWorklogStepFields();
      updateWorklogChrome();
    }

    function stashCurrentWorklogStep() {
      const day = worklogQueue[worklogStep];
      if (!day || day.status === 'submitted') {
        return;
      }
      day.workItemText = storedWorkItem(workItemEl.value);
      day.startedAt = fromDatetimeLocal(workStartedEl.value) || day.startedAt;
      day.minutes = Number(workMinutesEl.value);
      day.description = workDescriptionEl.value;
    }

    function pendingDaysPayload() {
      stashCurrentWorklogStep();
      return worklogQueue
        .filter((day) => day.status === 'pending')
        .map((day) => ({
          workItem: storedWorkItem(day.workItemText),
          startedAt: day.startedAt,
          minutes: day.minutes,
          description: day.description || '',
          segmentIds: (day.segmentIds || []).map(String),
          dayKey: day.dayKey,
          dayLabel: day.dayLabel,
        }));
    }

    function validateDayDraft(day) {
      const workItem = stripWorkItemHash(day.workItemText || '');
      if (!/^[a-zA-Z]+-\\d+$/.test(workItem) || !(Number(workItem.split('-')[1]) > 0)) {
        return { field: 'workItem', message: ui.worklogNeedWorkItem || '' };
      }
      const minutes = Number(day.minutes);
      if (!Number.isFinite(minutes) || minutes <= 0) {
        return { field: 'minutes', message: ui.worklogNeedMinutes || '' };
      }
      if (!day.startedAt || Number.isNaN(Date.parse(day.startedAt))) {
        return { field: 'started', message: ui.worklogNeedStarted || '' };
      }
      return null;
    }

    function firstInvalidPendingIndex() {
      return worklogQueue.findIndex((day) => day.status === 'pending' && validateDayDraft(day));
    }

    function goWorklogStep(index) {
      if (worklogSubmitting || index < 0 || index >= worklogQueue.length || index === worklogStep) {
        return;
      }
      stashCurrentWorklogStep();
      worklogStep = index;
      loadWorklogStepFields();
      updateWorklogChrome();
      showWorklogError('');
      clearFieldErrors();
    }

    function queuedSegmentIds(exceptIndex) {
      const ids = new Set();
      worklogQueue.forEach((day, index) => {
        if (index === exceptIndex || day.status === 'submitted') {
          return;
        }
        (day.segmentIds || []).forEach((id) => ids.add(String(id)));
      });
      return ids;
    }

    function closeCurrentWorklogStep() {
      if (worklogSubmitting) {
        return;
      }
      const day = worklogQueue[worklogStep];
      if (day && day.status !== 'submitted') {
        const still = queuedSegmentIds(worklogStep);
        const drop = new Set((day.segmentIds || []).map(String).filter((id) => !still.has(id)));
        selectedIds = selectedIds.filter((id) => !drop.has(id));
        renderFeed();
      }
      worklogQueue.splice(worklogStep, 1);
      if (!worklogQueue.length) {
        setWorklogModal(false);
        return;
      }
      if (worklogStep >= worklogQueue.length) {
        worklogStep = worklogQueue.length - 1;
      }
      loadWorklogStepFields();
      updateWorklogChrome();
      showWorklogError('');
      clearFieldErrors();
    }

    function loadWorklogStepFields() {
      const day = worklogQueue[worklogStep];
      if (!day) {
        worklogPanelSumEl.textContent = ui.worklogBarEmpty || '';
        return;
      }
      workStartedEl.value = toDatetimeLocal(day.startedAt);
      workMinutesEl.value = String(day.minutes || 0);
      workDescriptionEl.value = day.description || '';
      workItemEl.value = stripWorkItemHash(day.workItemText || '');
      syncWorkItemJump();
    }

    function updateWorklogChrome() {
      const day = worklogQueue[worklogStep];
      const total = worklogQueue.length;
      const multi = total > 1;
      worklogPagerEl.classList.toggle('hidden', !multi);
      worklogCancelAllEl.classList.toggle('hidden', !multi);
      worklogCancelEl.textContent = ui.cancel || '';
      if (!day) {
        return;
      }
      worklogStepEl.textContent = fillTemplate(ui.worklogStep, {
        current: worklogStep + 1,
        total: total,
      });
      worklogPrevEl.disabled = worklogSubmitting || worklogStep <= 0;
      worklogNextEl.disabled = worklogSubmitting || worklogStep >= total - 1;
      worklogPanelSumEl.textContent = panelSummaryForDay(day);
      const submitted = day.status === 'submitted';
      const lastPage = worklogStep === total - 1;
      const nextLabel = ui.worklogNext || '';
      const confirmLabel = submitted ? (ui.worklogSubmitted || '') : (ui.worklogConfirm || '');
      worklogSaveEl.classList.remove('hidden');
      worklogSaveEl.textContent = lastPage ? confirmLabel : nextLabel;
      worklogSaveEl.title = worklogSaveEl.textContent;
      worklogSaveEl.disabled = worklogSubmitting || (lastPage && submitted);
      worklogCancelEl.title = worklogCancelEl.textContent;
      worklogCancelAllEl.title = worklogCancelAllEl.textContent;
      workItemEl.disabled = submitted;
      workStartedEl.disabled = submitted;
      workMinutesEl.disabled = submitted;
      workDescriptionEl.disabled = submitted;
    }

    function setFeedView(next) {
      feedView = next;
      document.getElementById('viewSegments').classList.toggle('active', next === 'segments');
      document.getElementById('viewEvents').classList.toggle('active', next === 'events');
      if (next !== 'segments') {
        showWorklogHint('');
        setWorklogModal(false);
      } else {
        setComposer(false);
      }
      renderFeed();
      reportFeedView();
    }

    function reportFeedView() {
      if (state.empty || !state.task) {
        vscode.postMessage({ type: 'feedView', view: 'none' });
        return;
      }
      vscode.postMessage({
        type: 'feedView',
        view: state.worklogMode && feedView === 'segments' ? 'segments' : 'events',
      });
    }

    function renderFeed() {
      const useSegments = !!state.worklogMode && feedView === 'segments';
      feedEl.classList.toggle('segments', useSegments);
      if (useSegments) {
        renderSegments(state.segments || []);
      } else {
        renderRows(state.rows || []);
      }
      updateWorklogBar();
    }

    function segmentFootItem(label, paths) {
      return '<div class="segment-cross">' +
        '<svg width="14" height="14" viewBox="0 0 48 48" fill="none" aria-hidden="true">' + paths + '</svg>' +
        '<span>' + escapeHtml(label) + '</span></div>';
    }

    function renderSegments(segments) {
      if (!segments.length) {
        feedEl.innerHTML = '<p class="meta">' + escapeHtml(ui.worklogNone || '') + '</p>';
        return;
      }
      let previousDate = '';
      feedEl.innerHTML = segments.map((segment) => {
        const date = segment.dateLabel && segment.dateLabel !== previousDate
          ? '<div class="date">' + escapeHtml(segment.dateLabel) + '</div>'
          : '';
        previousDate = segment.dateLabel || previousDate;
        const checked = selectedIds.indexOf(segment.id) >= 0 ? ' checked' : '';
        const disabled = segment.selectable ? '' : ' disabled';
        const selectedClass = checked ? ' selected' : '';
        const openClass = segment.closed ? '' : ' open-seg';
        const duration = segment.durationLabel;
        const foots = [];
        if (!segment.closed) {
          foots.push(segmentFootItem(
            ui.worklogInProgress || '',
            '<path d="M24 44C35.0457 44 44 35.0457 44 24C44 12.9543 35.0457 4 24 4C12.9543 4 4 12.9543 4 24C4 35.0457 12.9543 44 24 44Z" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>' +
            '<path d="M31 31C31 31 29 35 24 35C19 35 17 31 17 31" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<path d="M33 20H29" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<path d="M17 18V22" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>',
          ));
        }
        if (segment.crossedDays) {
          foots.push(segmentFootItem(
            ui.worklogCrossedDays || '',
            '<path d="M14 25C14 19.4772 18.4772 15 24 15C29.5228 15 34 19.4772 34 25V41H14V25Z" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>' +
            '<path d="M24 5V8" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<path d="M35.8918 9.32823L33.9634 11.6264" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<path d="M42.2187 20.2873L39.2642 20.8083" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<path d="M5.78116 20.2874L8.73558 20.8083" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<path d="M12.1086 9.32802L14.037 11.6262" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<path d="M6 41H43" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>',
          ));
        }
        if (segment.workspaceChanged) {
          foots.push(segmentFootItem(
            ui.worklogSwitched || '',
            '<rect x="6" y="12" width="36" height="30" rx="2" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>' +
            '<path d="M17.9497 24.0083L29.9497 24.0083" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<path d="M6 13L13 5H35L42 13" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>',
          ));
        }
        if (segment.submitted) {
          foots.push(segmentFootItem(
            ui.worklogSubmitted || '',
            '<path d="M24 44C29.5228 44 34.5228 41.7614 38.1421 38.1421C41.7614 34.5228 44 29.5228 44 24C44 18.4772 41.7614 13.4772 38.1421 9.85786C34.5228 6.23858 29.5228 4 24 4C18.4772 4 13.4772 6.23858 9.85786 9.85786C6.23858 13.4772 4 18.4772 4 24C4 29.5228 6.23858 34.5228 9.85786 38.1421C13.4772 41.7614 18.4772 44 24 44Z" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>' +
            '<path d="M16 24L22 30L34 18" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>',
          ));
        }
        const crossClass = segment.crossedDays ? ' cross-day' : '';
        const crossFoot = foots.length
          ? '<div class="segment-foots">' + foots.join('') + '</div>'
          : '';
        return date +
          '<article class="segment' + selectedClass + openClass + crossClass + '" data-segment="' + escapeHtml(segment.id) + '">' +
          '<label class="segment-head">' +
          '<input type="checkbox" data-segment-check="' + escapeHtml(segment.id) + '"' + checked + disabled + ' />' +
          '<span class="segment-title"><strong>' + escapeHtml(segment.rangeLabel) +
          '  ' + escapeHtml(duration) + '</strong>' +
          '<div class="segment-meta">' + escapeHtml(segment.workspaceLabel || '') +
          '</div></span></label>' +
          crossFoot + '</article>';
      }).join('');
    }

    const DISPLAY_COMMITS = ${DISPLAY_COMMITS};

    function renderCommits(commits) {
      const items = (commits || []).map((commit, index) => {
        const hidden = index >= DISPLAY_COMMITS ? ' hidden-commit' : '';
        const feishu = commit.feishuHref
          ? '<button class="file-link ext-link" type="button" data-href="' +
            escapeHtml(commit.feishuHref) + '">' + escapeHtml(commit.feishuText) + '</button>'
          : '<span class="feishu-muted">' + escapeHtml(commit.feishuText) + '</span>';
        const toggle = commit.subject
          ? '<button class="commit-toggle" type="button" data-toggle-msg="1" title="' +
            escapeHtml(ui.expandMessage || '') + '"></button>'
          : '';
        return '<li class="commit' + hidden + '">' +
          '<div class="commit-head"><span class="commit-hash">' + escapeHtml(commit.hash) +
          '</span>' + feishu + toggle + '</div>' +
          '<div class="commit-msg">' + escapeHtml(commit.subject) + '</div></li>';
      }).join('');
      const more = commits && commits.length > DISPLAY_COMMITS
        ? '<button class="commit-more" type="button" data-toggle-commits="1">' +
          escapeHtml(ui.showMore || '') + '</button>'
        : '';
      return '<ul class="commits">' + items + '</ul>' + more;
    }

    function renderRows(rows) {
      if (!rows.length) {
        feedEl.innerHTML = '<p class="meta">' + escapeHtml(ui.noEvents || '') + '</p>';
        return;
      }
      feedEl.innerHTML = rows.map((row) => {
        if (row.kind === 'separator') {
          return '<div class="sep" title="' + escapeHtml(row.workspacePath) + '">── ' +
            escapeHtml(row.folderName) + ' ──</div>';
        }
        const details = (row.snapshotDetails || []).map((item) => {
          let value = '';
          if (item.commits && item.commits.length) {
            value = renderCommits(item.commits);
          } else {
            const files = (item.files || []).map((file) =>
              '<button class="file-link" type="button" data-file="' + escapeHtml(file.path) +
              '" data-workspace="' + escapeHtml(row.workspacePath || '') + '">' +
              escapeHtml(file.label) + '</button>'
            ).join('');
            value = item.href
              ? '<button class="file-link ext-link" type="button" data-href="' + escapeHtml(item.href) + '">' +
                escapeHtml(item.value || '') + '</button>'
              : item.value
                ? escapeHtml(item.value)
                : files;
          }
          return '<dt>' + escapeHtml(item.label) + '</dt><dd>' + value + '</dd>';
        }).join('');
        const snap = details
          ? '<details class="snap"><summary>' + escapeHtml(row.snapshotSummary || ui.snapshot || '') +
            '</summary><dl>' + details + '</dl></details>'
          : row.snapshotSummary
            ? '<div class="snap snap-static">' + escapeHtml(row.snapshotSummary) + '</div>'
            : '';
        const date = row.dateLabel ? '<div class="date">' + escapeHtml(row.dateLabel) + '</div>' : '';
        const body = row.body ? '<div class="body">' + escapeHtml(row.body) + '</div>' : '';
        return '<article class="event ' + row.bar + '">' + date +
          '<div class="row"><span class="meta">' + escapeHtml(row.timeLabel) + '  ' + escapeHtml(row.typeLabel) +
          '</span></div>' + body + snap + '</article>';
      }).join('');
    }

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'noteSaved') {
        bodyEl.value = '';
        setComposer(false);
        showError('');
        return;
      }
      if (message.type === 'worklogResult') {
        worklogSubmitting = false;
        const submitted = Array.isArray(message.submittedSegmentIds)
          ? message.submittedSegmentIds.map(String)
          : [];
        if (submitted.length) {
          const done = new Set(submitted);
          selectedIds = selectedIds.filter((id) => !done.has(id));
          renderFeed();
        }
        const submittedKeys = new Set(
          (Array.isArray(message.submittedDayKeys) ? message.submittedDayKeys : []).map(String),
        );
        if (submittedKeys.size) {
          worklogQueue.forEach((day) => {
            if (submittedKeys.has(String(day.dayKey))) {
              day.status = 'submitted';
            }
          });
        }
        if (message.ok) {
          setWorklogModal(false);
        } else if (message.message) {
          const failedKey = String(message.failedDayKey || '');
          const failedIndex = worklogQueue.findIndex((day) => String(day.dayKey) === failedKey);
          if (failedIndex >= 0) {
            worklogStep = failedIndex;
            loadWorklogStepFields();
          }
          routeWorklogError(message.message);
          updateWorklogChrome();
        } else {
          updateWorklogChrome();
        }
        return;
      }
      if (message.type === 'worklogLoginResult') {
        if (message.ok) {
          const captured = ui.worklogLoginOk || '';
          const resubmit = ui.worklogLoginResubmit || '';
          showWorklogError([captured, resubmit].filter(Boolean).join(' '), true);
        } else if (message.message) {
          showWorklogError(message.message);
        }
        return;
      }
      if (message.type === 'error') {
        if (!worklogModalOpen) {
          showError(message.message);
        }
        return;
      }
      if (message.type !== 'state') return;
      state = message.payload;
      applyUi(state.ui);
      showError('');
      if (state.empty) {
        emptyEl.textContent = state.emptyMessage;
        emptyEl.classList.remove('hidden');
        pageEl.classList.add('hidden');
        reportFeedView();
        return;
      }
      emptyEl.classList.add('hidden');
      pageEl.classList.remove('hidden');
      previewEl.textContent = state.snapshotPreview;
      const valid = new Set((state.segments || []).filter((segment) => segment.selectable).map((segment) => segment.id));
      selectedIds = selectedIds.filter((id) => valid.has(id));
      if (!state.worklogMode) {
        feedView = 'events';
        setWorklogModal(false);
        showWorklogHint('');
      }
      modeBarEl.classList.toggle('hidden', !state.worklogMode);
      document.getElementById('viewSegments').classList.toggle('active', feedView === 'segments');
      document.getElementById('viewEvents').classList.toggle('active', feedView === 'events');
      renderFeed();
      reportFeedView();
      gitHintTextEl.textContent = state.gitHint || '';
      gitHintEl.classList.toggle('hidden', !state.gitHint);
      if (!state.task.canNote) setComposer(false);
    });

    document.body.addEventListener('click', (event) => {
      let target = event.target;
      if (target && target.nodeType !== 1) {
        target = target.parentElement;
      }
      if (!target || target.nodeType !== 1) {
        return;
      }
      if (target.closest('[data-worklog-login]')) {
        window.clearTimeout(worklogErrorTimer);
        vscode.postMessage({ type: 'worklogLogin' });
        return;
      }
      if (target.closest('#dismissGit')) {
        vscode.postMessage({ type: 'dismissGitHint' });
        return;
      }
      const viewEl = target.closest('[data-view]');
      if (viewEl) {
        setFeedView(viewEl.getAttribute('data-view'));
        return;
      }
      if (target.closest('#worklogRegister')) {
        if (!selectedSegments().length) {
          showWorklogHint(ui.worklogNeedSelect || '');
          return;
        }
        showWorklogHint('');
        setWorklogModal(true);
        return;
      }
      if (target.closest('#worklogPrev')) {
        goWorklogStep(worklogStep - 1);
        return;
      }
      if (target.closest('#worklogNext')) {
        goWorklogStep(worklogStep + 1);
        return;
      }
      if (target.closest('#worklogCancelAll')) {
        setWorklogModal(false);
        return;
      }
      if (target.closest('#worklogCancel')) {
        if (worklogQueue.length > 1) {
          closeCurrentWorklogStep();
        } else {
          setWorklogModal(false);
        }
        return;
      }
      if (target.closest('#worklogSave')) {
        const total = worklogQueue.length;
        if (total > 1 && worklogStep !== total - 1) {
          goWorklogStep(worklogStep + 1);
          return;
        }
        const day = worklogQueue[worklogStep];
        if (!day || day.status === 'submitted') {
          return;
        }
        const days = pendingDaysPayload();
        if (!days.length) {
          return;
        }
        const invalidIndex = firstInvalidPendingIndex();
        if (invalidIndex >= 0) {
          worklogStep = invalidIndex;
          loadWorklogStepFields();
          showDraftError(validateDayDraft(worklogQueue[invalidIndex]));
          updateWorklogChrome();
          return;
        }
        showWorklogError('');
        clearFieldErrors();
        worklogSubmitting = true;
        worklogSaveEl.disabled = true;
        vscode.postMessage({
          type: 'worklogConfirm',
          days: days,
        });
        return;
      }
      const fileEl = target.closest('[data-file]');
      if (fileEl) {
        vscode.postMessage({
          type: 'openFile',
          path: fileEl.getAttribute('data-file'),
          workspacePath: fileEl.getAttribute('data-workspace'),
        });
        return;
      }
      const moreEl = target.closest('[data-toggle-commits]');
      if (moreEl) {
        const dd = moreEl.closest('dd');
        if (dd) {
          const expanded = dd.classList.toggle('commits-expanded');
          moreEl.textContent = expanded ? (ui.collapse || '') : (ui.showMore || '');
        }
        return;
      }
      const msgToggle = target.closest('[data-toggle-msg]');
      if (msgToggle) {
        const commitEl = msgToggle.closest('.commit');
        if (commitEl) {
          commitEl.classList.toggle('open');
        }
        return;
      }
      const hrefEl = target.closest('[data-href]');
      if (hrefEl) {
        vscode.postMessage({ type: 'openUrl', url: hrefEl.getAttribute('data-href') });
        return;
      }
      const copy = target.closest('#copy');
      if (copy) {
        vscode.postMessage({ type: 'copyPath' });
        return;
      }
      const runEl = target.closest('[data-run]');
      if (runEl) {
        const run = runEl.getAttribute('data-run');
        if (run) {
          vscode.postMessage({ type: 'run', command: run });
          return;
        }
      }
      if (target.classList.contains('body')) {
        target.classList.toggle('expanded');
      }
    });

    feedEl.addEventListener('change', (event) => {
      const box = event.target && event.target.closest ? event.target.closest('[data-segment-check]') : null;
      if (!box) {
        return;
      }
      const id = box.getAttribute('data-segment-check');
      if (box.checked) {
        if (selectedIds.indexOf(id) < 0) {
          selectedIds.push(id);
        }
      } else {
        selectedIds = selectedIds.filter((item) => item !== id);
      }
      renderFeed();
    });
    document.getElementById('collapse').addEventListener('click', () => setComposer(false));
    document.getElementById('cancel').addEventListener('click', () => {
      bodyEl.value = '';
      setComposer(false);
    });
    document.getElementById('save').addEventListener('click', () => {
      vscode.postMessage({
        type: 'addNote',
        noteKind: kindEl.value,
        body: bodyEl.value,
      });
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && worklogModalOpen) {
        setWorklogModal(false);
      }
    });

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  return { html };
}

export type { TimelineViewModel };
