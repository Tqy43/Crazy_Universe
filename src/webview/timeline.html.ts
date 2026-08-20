import { DISPLAY_COMMITS } from '../snapshot/gitParse';
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
    .feed {
      position: relative;
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding: 10px 12px 16px 8px;
      scrollbar-width: none;
    }
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
      <div id="feed" class="feed"></div>
      <p id="error" class="error hidden"></p>
      <div id="composer" class="composer hidden">
        <h2><span id="composerTitle">添加标记</span> <button class="copy" id="collapse" type="button">收起</button></h2>
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
        <div id="preview" class="preview"></div>
        <div class="composer-actions">
          <button class="btn" id="cancel" type="button">取消</button>
          <button class="btn primary" id="save" type="button">保存标记</button>
        </div>
      </div>
    </div>
  <script nonce="${cspNonce}">
    const vscode = acquireVsCodeApi();
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
    let ui = {};

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
    }

    function showError(message) {
      errorEl.textContent = message || '';
      errorEl.classList.toggle('hidden', !message);
    }

    function setComposer(open) {
      composerEl.classList.toggle('hidden', !open);
      if (open) {
        bodyEl.focus();
      }
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
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
      if (message.type === 'error') {
        showError(message.message);
        return;
      }
      if (message.type !== 'state') return;
      const state = message.payload;
      applyUi(state.ui);
      showError('');
      if (state.empty) {
        emptyEl.textContent = state.emptyMessage;
        emptyEl.classList.remove('hidden');
        pageEl.classList.add('hidden');
        return;
      }
      emptyEl.classList.add('hidden');
      pageEl.classList.remove('hidden');
      previewEl.textContent = state.snapshotPreview;
      renderRows(state.rows);
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
      if (target.closest('#dismissGit')) {
        vscode.postMessage({ type: 'dismissGitHint' });
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

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  return { html };
}

export type { TimelineViewModel };
