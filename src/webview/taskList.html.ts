function nonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let i = 0; i < 32; i += 1) {
    value += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return value;
}

export function renderTaskListShell(cspSource: string): { html: string } {
  const cspNonce = nonce();
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data:; style-src 'unsafe-inline'; script-src 'nonce-${cspNonce}'" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>任务</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    html, body { height: 100%; overflow: hidden; }
    body {
      margin: 0;
      padding: 0;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      line-height: 1.4;
    }
    button { font: inherit; color: inherit; }
    .page { position: relative; display: flex; flex-direction: column; height: 100%; min-height: 0; }
    .hover-tip {
      position: fixed;
      z-index: 70;
      max-width: min(240px, calc(100vw - 16px));
      padding: 6px 8px;
      border: 1px solid var(--vscode-editorHoverWidget-border, var(--vscode-widget-border));
      border-radius: 3px;
      background: var(--vscode-editorHoverWidget-background, var(--vscode-editorWidget-background));
      color: var(--vscode-editorHoverWidget-foreground, var(--vscode-foreground));
      box-shadow: 0 2px 8px var(--vscode-widget-shadow);
      font-size: 12px;
      line-height: 1.45;
      pointer-events: none;
    }
    .hover-tip.hidden { display: none; }
    .search {
      display: none;
      flex-shrink: 0;
      align-items: center;
      gap: 4px;
      padding: 4px 8px 6px;
      width: 100%;
    }
    .search.open { display: flex; }
    .search-box {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      height: 26px;
      border: 1px solid var(--vscode-focusBorder, var(--vscode-input-border));
      border-radius: 2px;
      background: var(--vscode-input-background);
    }
    .search-box input {
      flex: 1;
      min-width: 0;
      width: 100%;
      height: 100%;
      border: none;
      outline: none;
      background: transparent;
      color: var(--vscode-input-foreground);
      padding: 0 8px;
    }
    .search-box input::placeholder { color: var(--vscode-input-placeholderForeground); }
    .icon-btn {
      flex-shrink: 0;
      width: 22px;
      height: 22px;
      padding: 0;
      border: none;
      border-radius: 3px;
      background: transparent;
      color: var(--vscode-icon-foreground);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .icon-btn:hover { background: var(--vscode-toolbar-hoverBackground); }
    .tree {
      flex: 1;
      min-height: 0;
      overflow: auto;
    }
    .hint, .empty-action {
      padding: 4px 12px 4px 22px;
      color: var(--vscode-descriptionForeground);
    }
    .empty-action {
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
      border: none;
      background: transparent;
      text-align: left;
      cursor: pointer;
      color: var(--vscode-foreground);
    }
    .empty-action:hover { background: var(--vscode-list-hoverBackground); }
    .section-head, .task {
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
      min-height: 22px;
      padding: 0 8px 0 8px;
      border: none;
      background: transparent;
      text-align: left;
      cursor: pointer;
      color: inherit;
    }
    .section-head { font-weight: 600; }
    .task { padding-left: 22px; }
    .section-head:hover, .task:hover { background: var(--vscode-list-hoverBackground); }
    .task.selected {
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
    }
    .chevron {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
      opacity: 0.8;
    }
    .chevron.collapsed { transform: rotate(-90deg); }
    .status {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
    }
    .status svg { width: 16px; height: 16px; display: block; }
    .title {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .title-wrap {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      min-width: 0;
      flex: 1;
    }
    .title-wrap .title {
      flex: 0 1 auto;
    }
    .title-wrap [data-tip] { display: none; }
    .task:hover .title-wrap [data-tip],
    .task.selected .title-wrap [data-tip] { display: inline-flex; }
    .desc, .actions {
      flex-shrink: 0;
      margin-left: auto;
      padding-left: 8px;
    }
    .desc {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 45%;
    }
    .task.selected .desc { color: var(--vscode-list-activeSelectionForeground); opacity: 0.8; }
    .actions { display: none; }
    .task:hover .actions, .task.selected .actions { display: inline-flex; }
    .task:hover .desc, .task.selected .desc { display: none; }
    .placeholder {
      padding: 2px 12px 2px 22px;
      color: var(--vscode-descriptionForeground);
    }
    .menu {
      position: fixed;
      z-index: 40;
      width: max-content;
      min-width: 0;
      padding: 4px 0;
      border: 1px solid var(--vscode-menu-border, var(--vscode-widget-border));
      border-radius: 5px;
      background: var(--vscode-menu-background, var(--vscode-dropdown-background));
      color: var(--vscode-menu-foreground, var(--vscode-foreground));
      box-shadow: 0 2px 8px var(--vscode-widget-shadow);
    }
    .menu.hidden { display: none; }
    .menu button {
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
      height: 26px;
      padding: 0 12px 0 8px;
      border: none;
      background: transparent;
      text-align: left;
      cursor: pointer;
      color: inherit;
      white-space: nowrap;
    }
    .menu button:hover, .menu button:focus {
      background: var(--vscode-menu-selectionBackground, var(--vscode-list-activeSelectionBackground));
      color: var(--vscode-menu-selectionForeground, var(--vscode-list-activeSelectionForeground));
      outline: none;
    }
    .menu svg {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="search" id="search">
      <div class="search-box">
        <input id="q" type="text" placeholder="搜索任务名称" spellcheck="false" />
      </div>
      <button class="icon-btn" id="close" title="关闭" type="button">✕</button>
    </div>
    <div class="tree" id="tree"></div>
    <div class="menu hidden" id="menu"></div>
    <div class="hover-tip hidden" id="hoverTip" role="tooltip"></div>
  </div>
  <script nonce="${cspNonce}">
    const vscode = acquireVsCodeApi();
    const searchEl = document.getElementById('search');
    const inputEl = document.getElementById('q');
    const treeEl = document.getElementById('tree');
    const menuEl = document.getElementById('menu');
    const hoverTipEl = document.getElementById('hoverTip');
    const history = [];
    let historyIndex = -1;
    let collapsed = { completed: true };
    let state = { searchOpen: false, searchNeedle: '', selectedTaskId: '', sections: [], empty: false, ui: {} };

    function ui() {
      return state.ui || {};
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function chevronSvg(isCollapsed) {
      return '<svg class="chevron' + (isCollapsed ? ' collapsed' : '') + '" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M5.7 3.3L10.4 8l-4.7 4.7.7.7L11.8 8 6.4 2.6z"/></svg>';
    }

    function actionBtn(command, label, svg) {
      return '<button class="icon-btn" type="button" data-run="' + escapeHtml(command) + '" title="' +
        escapeHtml(label) + '">' + svg + '</button>';
    }
    const iconPause = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4 3h3v10H4zm5 0h3v10H9z"/></svg>';
    const iconPlay = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4.5 2.5v11l9-5.5z"/></svg>';
    const iconNote = '<svg width="16" height="16" viewBox="0 0 48 48" fill="none" aria-hidden="true"><rect x="13" y="10" width="28" height="34" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M35 10V4H8C7.44772 4 7 4.44772 7 5V38H13" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 22H33" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 30H33" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const iconResume = '<svg width="16" height="16" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M12.9998 8L6 14L12.9998 21" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 14H28.9938C35.8768 14 41.7221 19.6204 41.9904 26.5C42.2739 33.7696 36.2671 40 28.9938 40H11.9984" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const iconCheck = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6.5 11.2 3.4 8.1l.8-.8 2.3 2.3 5.3-5.4.8.8z"/></svg>';
    const iconHistory = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 2.5A5.5 5.5 0 1 1 2.5 8H4a4 4 0 1 0 1-2.6L6.5 7h-4V3l1.3 1.3A5.48 5.48 0 0 1 8 2.5zM7.2 5v3.2l2.4 1.4.6-1-2-1.2V5z"/></svg>';
    const iconRename = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M11.6 2.4 13.6 4.4 6 12H4v-2zM3 13h10v1H3z"/></svg>';
    const iconDelete = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6 2h4l.5 1H13v1H3V3h3.5zm1 4h1v6H7zm3 0h1v6h-1zM4.5 4H12v9.5c0 .8-.7 1.5-1.5 1.5h-5c-.8 0-1.5-.7-1.5-1.5z"/></svg>';
    const iconEnd = '<svg width="16" height="16" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M34 12H14C12.8954 12 12 12.8954 12 14V34C12 35.1046 12.8954 36 14 36H34C35.1046 36 36 35.1046 36 34V14C36 12.8954 35.1046 12 34 12Z" fill="none" stroke="currentColor" stroke-width="4"/></svg>';
    const iconHide = '<svg width="16" height="16" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M6 16C6.63472 17.2193 7.59646 18.3504 8.82276 19.3554C12.261 22.1733 17.779 24 24 24C30.221 24 35.739 22.1733 39.1772 19.3554C40.4035 18.3504 41.3653 17.2193 42 16" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M28.9775 24L31.048 31.7274" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M37.3535 21.3536L43.0103 27.0104" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.00004 27.0103L10.6569 21.3534" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M16.9278 31.7276L18.9983 24.0001" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const iconInfo = '<svg width="16" height="16" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 44C29.5228 44 34.5228 41.7614 38.1421 38.1421C41.7614 34.5228 44 29.5228 44 24C44 18.4772 41.7614 13.4772 38.1421 9.85786C34.5228 6.23858 29.5228 4 24 4C18.4772 4 13.4772 6.23858 9.85786 9.85786C6.23858 13.4772 4 18.4772 4 24C4 29.5228 6.23858 34.5228 9.85786 38.1421C13.4772 41.7614 18.4772 44 24 44Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path fill-rule="evenodd" clip-rule="evenodd" d="M24 11C25.3807 11 26.5 12.1193 26.5 13.5C26.5 14.8807 25.3807 16 24 16C22.6193 16 21.5 14.8807 21.5 13.5C21.5 12.1193 22.6193 11 24 11Z" fill="currentColor"/><path d="M24.5 34V20H23.5H22.5" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 34H28" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const iconFeishu = '<svg width="16" height="16" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M17 29C21 29 25 26.9339 28 23.4065C36 14 41.4242 16.8166 44 17.9998C38.5 20.9998 40.5 29.6233 33 35.9998C28.382 39.9259 23.4945 41.014 19 41C12.5231 40.9799 6.86226 37.7637 4 35.4063V16.9998" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.64808 15.8669C5.02231 14.9567 3.77715 14.7261 2.86694 15.3519C1.95673 15.9777 1.72615 17.2228 2.35192 18.1331L5.64808 15.8669ZM36.0021 35.7309C36.958 35.1774 37.2843 33.9539 36.7309 32.9979C36.1774 32.042 34.9539 31.7157 33.9979 32.2691L36.0021 35.7309ZM2.35192 18.1331C5.2435 22.339 10.7992 28.144 16.8865 32.2239C19.9345 34.2667 23.217 35.946 26.449 36.7324C29.6946 37.522 33.0451 37.4428 36.0021 35.7309L33.9979 32.2691C32.2049 33.3072 29.9929 33.478 27.3947 32.8458C24.783 32.2103 21.9405 30.7958 19.1135 28.9011C13.4508 25.106 8.2565 19.661 5.64808 15.8669L2.35192 18.1331Z" fill="currentColor"/><path d="M33.5947 17C32.84 14.7027 30.8551 9.94054 27.5947 7H11.5947C15.2174 10.6757 23.0002 16 27.0002 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const iconEdit = '<svg width="16" height="16" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M24 24V19L39 4L44 9L29 24H24Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 24H9C6.23858 24 4 26.2386 4 29C4 31.7614 6.23858 34 9 34H39C41.7614 34 44 36.2386 44 39C44 41.7614 41.7614 44 39 44H18" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    function actionsFor(status) {
      const labels = ui();
      if (status === 'in_progress') {
        return actionBtn('crazyUniverse.addNote', labels.note || '添加标记', iconNote) +
          actionBtn('crazyUniverse.pauseTask', labels.pause || '暂停', iconPause) +
          actionBtn('crazyUniverse.completeTask', labels.end || labels.complete || '结束', iconEnd);
      }
      if (status === 'completed') {
        return actionBtn('crazyUniverse.resumeTask', labels.resume || '恢复', iconResume);
      }
      return actionBtn('crazyUniverse.addNote', labels.note || '添加标记', iconNote) +
        actionBtn('crazyUniverse.startTask', labels.start || '开始', iconPlay) +
        actionBtn('crazyUniverse.completeTask', labels.end || labels.complete || '结束', iconEnd);
    }

    function toolAction(action, label, svg) {
      return '<button class="icon-btn" type="button" data-tool-action="' + escapeHtml(action) + '" title="' +
        escapeHtml(label) + '">' + svg + '</button>';
    }

    function toolInfoBtn() {
      const labels = ui();
      return '<button class="icon-btn" type="button" data-tip="toolsHint" aria-label="' +
        escapeHtml(labels.toolsInfo || '') + '">' + iconInfo + '</button>';
    }

    function toolActions(status) {
      const labels = ui();
      if (status === 'running') {
        return toolAction('end', labels.toolsDisable || '停用', iconEnd);
      }
      return toolAction('start', labels.toolsUse || '使用', iconPlay) +
        toolAction('hide', labels.hide || '隐藏', iconHide);
    }

    function toolMenuItems(status) {
      const labels = ui();
      const items = [];
      if (status !== 'running') {
        items.push({ action: 'start', label: labels.toolsUse || '使用', icon: iconPlay });
      }
      if (status === 'running') {
        items.push({ action: 'end', label: labels.toolsDisable || '停用', icon: iconEnd });
      }
      items.push(
        { action: 'hide', label: labels.hide || '隐藏', icon: iconHide },
        { action: 'login', label: labels.worklogLogin || '登录飞书工时', icon: iconFeishu },
        { action: 'enterUserId', label: labels.worklogEnterUserId || '手动输入', icon: iconEdit },
      );
      return items;
    }

    function menuItems(status) {
      const labels = ui();
      if (status === 'in_progress') {
        return [
          { command: 'crazyUniverse.addNote', label: labels.note || '添加标记', icon: iconNote },
          { command: 'crazyUniverse.pauseTask', label: labels.pause || '暂停', icon: iconPause },
          { command: 'crazyUniverse.completeTask', label: labels.end || labels.complete || '结束', icon: iconEnd },
          { command: 'crazyUniverse.openTimeline', label: labels.timeline || '打开时间线', icon: iconHistory },
          { command: 'crazyUniverse.renameTask', label: labels.rename || '重命名任务', icon: iconRename },
          { command: 'crazyUniverse.deleteTask', label: labels.delete || '删除任务', icon: iconDelete },
        ];
      }
      const items = [];
      if (status === 'completed') {
        items.push({ command: 'crazyUniverse.resumeTask', label: labels.resume || '恢复', icon: iconResume });
      } else {
        items.push({ command: 'crazyUniverse.addNote', label: labels.note || '添加标记', icon: iconNote });
        items.push({ command: 'crazyUniverse.startTask', label: labels.start || '开始', icon: iconPlay });
        if (status === 'paused' || status === 'not_started') {
          items.push({ command: 'crazyUniverse.completeTask', label: labels.end || labels.complete || '结束', icon: iconEnd });
        }
      }
      items.push(
        { command: 'crazyUniverse.openTimeline', label: labels.timeline || '打开时间线', icon: iconHistory },
        { command: 'crazyUniverse.renameTask', label: labels.rename || '重命名任务', icon: iconRename },
        { command: 'crazyUniverse.deleteTask', label: labels.delete || '删除任务', icon: iconDelete },
      );
      return items;
    }

    function hideMenu() {
      menuEl.classList.add('hidden');
      menuEl.innerHTML = '';
    }

    function showMenu(rowEl, x, y) {
      const isTool = !!rowEl.dataset.tool;
      const status = rowEl.dataset.status;
      const html = isTool
        ? toolMenuItems(status).map((item) => {
            return '<button type="button" data-tool-action="' + escapeHtml(item.action) + '" data-tool="' +
              escapeHtml(rowEl.dataset.tool) + '">' + item.icon +
              '<span>' + escapeHtml(item.label) + '</span></button>';
          }).join('')
        : menuItems(status).map((item) => {
            const id = item.command === 'crazyUniverse.newTask' ? '' : rowEl.dataset.task;
            return '<button type="button" data-run="' + escapeHtml(item.command) + '"' +
              (id ? ' data-task="' + escapeHtml(id) + '"' : '') + '>' + item.icon +
              '<span>' + escapeHtml(item.label) + '</span></button>';
          }).join('');
      menuEl.innerHTML = html;
      menuEl.classList.remove('hidden');
      menuEl.style.left = x + 'px';
      menuEl.style.top = y + 'px';
      const rect = menuEl.getBoundingClientRect();
      const left = Math.min(x, Math.max(4, window.innerWidth - rect.width - 4));
      const top = Math.min(y, Math.max(4, window.innerHeight - rect.height - 4));
      menuEl.style.left = left + 'px';
      menuEl.style.top = top + 'px';
    }

    function applyUi(next) {
      if (!next) {
        return;
      }
      document.documentElement.lang = next.lang || 'zh-CN';
      document.title = next.viewTitle || document.title;
      inputEl.placeholder = next.searchPlaceholder || inputEl.placeholder;
      document.getElementById('close').title = next.close || '';
    }

    function render() {
      applyUi(ui());
      hideTip();
      searchEl.classList.toggle('open', !!state.searchOpen);
      if (state.searchOpen && inputEl.value !== (state.searchNeedle || '')) {
        inputEl.value = state.searchNeedle || '';
      }
      if (state.empty) {
        const labels = ui();
        treeEl.innerHTML = '<div class="hint">' + escapeHtml(labels.emptyHint || '') + '</div>' +
          '<button class="empty-action" type="button" data-run="crazyUniverse.newTask">' +
          escapeHtml(labels.newTaskPlus || labels.newTask || '') + '</button>';
        return;
      }
      treeEl.innerHTML = (state.sections || []).map((section) => {
        const isCollapsed = !!collapsed[section.id] && section.id !== 'search';
        const items = isCollapsed ? '' : (section.items || []).map((item) => {
          if (item.placeholder) {
            return '<div class="placeholder">' + escapeHtml(item.title) + '</div>';
          }
          if (item.kind === 'tool') {
            return '<div class="task" data-tool="' + escapeHtml(item.id) + '" data-status="' +
              escapeHtml(item.status) + '" data-title="' + escapeHtml(item.title) + '">' +
              '<span class="status">' + iconFeishu + '</span>' +
              '<span class="title-wrap"><span class="title">' + escapeHtml(item.title) + '</span>' +
              toolInfoBtn() + '</span>' +
              '<span class="desc">' + escapeHtml(item.description || '') + '</span>' +
              '<span class="actions">' + toolActions(item.status) + '</span></div>';
          }
          const selected = item.id === state.selectedTaskId ? ' selected' : '';
          return '<div class="task' + selected + '" data-task="' + escapeHtml(item.id) +
            '" data-status="' + escapeHtml(item.status) + '" data-title="' + escapeHtml(item.title) + '">' +
            '<img class="status" src="' + escapeHtml(item.icon) + '" alt="" />' +
            '<span class="title">' + escapeHtml(item.title) + '</span>' +
            '<span class="desc">' + escapeHtml(item.description || '') + '</span>' +
            '<span class="actions">' + actionsFor(item.status) + '</span></div>';
        }).join('');
        return '<button class="section-head" type="button" data-section="' + escapeHtml(section.id) + '">' +
          chevronSvg(isCollapsed) + escapeHtml(section.title) + '</button>' + items;
      }).join('');
    }

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'state') {
        state = message.state || state;
        render();
        if (state.searchOpen && state.focusSearch) {
          inputEl.focus();
          inputEl.select();
        }
      }
    });

    inputEl.addEventListener('input', () => {
      vscode.postMessage({ type: 'query', text: inputEl.value });
    });
    inputEl.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        vscode.postMessage({ type: 'closeSearch' });
        return;
      }
      if (event.key === 'ArrowUp' && history.length) {
        event.preventDefault();
        historyIndex = historyIndex < 0 ? history.length - 1 : Math.max(0, historyIndex - 1);
        inputEl.value = history[historyIndex];
        vscode.postMessage({ type: 'query', text: inputEl.value });
        return;
      }
      if (event.key === 'ArrowDown' && history.length) {
        event.preventDefault();
        historyIndex = Math.min(history.length - 1, historyIndex + 1);
        inputEl.value = history[historyIndex];
        vscode.postMessage({ type: 'query', text: inputEl.value });
        return;
      }
      if (event.key === 'Enter' && inputEl.value.trim()) {
        const text = inputEl.value.trim();
        if (history[history.length - 1] !== text) {
          history.push(text);
        }
        historyIndex = history.length;
      }
    });
    document.getElementById('close').addEventListener('click', () => {
      vscode.postMessage({ type: 'closeSearch' });
    });
    treeEl.addEventListener('click', (event) => {
      if (!menuEl.contains(event.target)) {
        hideMenu();
      }
      const target = event.target.closest('[data-run], [data-tool-action], [data-tip], [data-section], [data-task], [data-tool]');
      if (!target) {
        return;
      }
      if (target.dataset.tip) {
        event.stopPropagation();
        showTip(target, ui().toolsHint);
        return;
      }
      if (target.dataset.toolAction) {
        event.stopPropagation();
        hideTip();
        const toolEl = target.closest('[data-tool]');
        vscode.postMessage({
          type: 'tool',
          id: toolEl ? toolEl.dataset.tool : undefined,
          action: target.dataset.toolAction,
        });
        return;
      }
      if (target.dataset.run) {
        event.stopPropagation();
        const taskEl = target.closest('[data-task]');
        vscode.postMessage({
          type: 'run',
          command: target.dataset.run,
          taskId: taskEl ? taskEl.dataset.task : undefined,
        });
        return;
      }
      if (target.dataset.section) {
        collapsed[target.dataset.section] = !collapsed[target.dataset.section];
        render();
        return;
      }
      if (target.dataset.tool) {
        return;
      }
      vscode.postMessage({ type: 'select', taskId: target.dataset.task });
    });
    treeEl.addEventListener('contextmenu', (event) => {
      const toolEl = event.target.closest('[data-tool]');
      if (toolEl) {
        event.preventDefault();
        event.stopPropagation();
        showMenu(toolEl, event.clientX, event.clientY);
        return;
      }
      const taskEl = event.target.closest('[data-task]');
      if (!taskEl) {
        hideMenu();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      vscode.postMessage({ type: 'select', taskId: taskEl.dataset.task });
      showMenu(taskEl, event.clientX, event.clientY);
    });
    menuEl.addEventListener('contextmenu', (event) => {
      event.preventDefault();
    });
    menuEl.addEventListener('click', (event) => {
      const toolBtn = event.target.closest('[data-tool-action]');
      if (toolBtn) {
        event.stopPropagation();
        hideMenu();
        vscode.postMessage({
          type: 'tool',
          id: toolBtn.dataset.tool,
          action: toolBtn.dataset.toolAction,
        });
        return;
      }
      const target = event.target.closest('[data-run]');
      if (!target) {
        return;
      }
      event.stopPropagation();
      hideMenu();
      vscode.postMessage({
        type: 'run',
        command: target.dataset.run,
        taskId: target.dataset.task,
      });
    });
    window.addEventListener('pointerdown', (event) => {
      if (event.button === 2) {
        return;
      }
      if (!menuEl.classList.contains('hidden') && !menuEl.contains(event.target)) {
        hideMenu();
      }
    }, true);
    window.addEventListener('blur', () => {
      hideMenu();
      hideTip();
    });
    treeEl.addEventListener('scroll', () => {
      hideMenu();
      hideTip();
    });
    function hideTip() {
      hoverTipEl.classList.add('hidden');
    }
    function showTip(anchor, text) {
      const content = String(text || '').trim();
      if (!content) {
        hideTip();
        return;
      }
      hoverTipEl.textContent = content;
      hoverTipEl.classList.remove('hidden');
      hoverTipEl.style.left = '0px';
      hoverTipEl.style.top = '0px';
      const r = anchor.getBoundingClientRect();
      const tip = hoverTipEl.getBoundingClientRect();
      let left = r.left;
      let top = r.bottom + 6;
      if (left + tip.width > window.innerWidth - 4) {
        left = Math.max(4, r.right - tip.width);
      }
      if (left < 4) {
        left = 4;
      }
      if (top + tip.height > window.innerHeight - 4) {
        top = Math.max(4, r.top - tip.height - 6);
      }
      hoverTipEl.style.left = left + 'px';
      hoverTipEl.style.top = top + 'px';
    }
    treeEl.addEventListener('mouseover', (event) => {
      const info = event.target.closest('[data-tip]');
      if (info && treeEl.contains(info)) {
        showTip(info, ui().toolsHint);
      }
    });
    treeEl.addEventListener('mouseout', (event) => {
      const info = event.target.closest('[data-tip]');
      if (!info) {
        return;
      }
      const next = event.relatedTarget;
      if (!next || !info.contains(next)) {
        hideTip();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        hideMenu();
        hideTip();
      }
    });
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  return { html };
}
