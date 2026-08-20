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
    .page { display: flex; flex-direction: column; height: 100%; min-height: 0; }
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
    .title {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
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
  </div>
  <script nonce="${cspNonce}">
    const vscode = acquireVsCodeApi();
    const searchEl = document.getElementById('search');
    const inputEl = document.getElementById('q');
    const treeEl = document.getElementById('tree');
    const menuEl = document.getElementById('menu');
    const history = [];
    let historyIndex = -1;
    let collapsed = { completed: true };
    let state = { searchOpen: false, searchNeedle: '', selectedTaskId: '', sections: [], empty: false };

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
    const iconAdd = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M7.2 3h1.6v4.2H13v1.6H8.8V13H7.2V8.8H3V7.2h4.2z"/></svg>';
    const iconRename = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M11.6 2.4 13.6 4.4 6 12H4v-2zM3 13h10v1H3z"/></svg>';
    const iconDelete = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6 2h4l.5 1H13v1H3V3h3.5zm1 4h1v6H7zm3 0h1v6h-1zM4.5 4H12v9.5c0 .8-.7 1.5-1.5 1.5h-5c-.8 0-1.5-.7-1.5-1.5z"/></svg>';

    function actionsFor(status) {
      if (status === 'in_progress') {
        return actionBtn('crazyUniverse.pauseTask', '暂停', iconPause) +
          actionBtn('crazyUniverse.addNote', '添加标记', iconNote);
      }
      if (status === 'completed') {
        return actionBtn('crazyUniverse.resumeTask', '恢复', iconResume);
      }
      return actionBtn('crazyUniverse.startTask', '开始', iconPlay) +
        actionBtn('crazyUniverse.addNote', '添加标记', iconNote);
    }

    function menuItems(status) {
      if (status === 'in_progress') {
        return [
          { command: 'crazyUniverse.pauseTask', label: '暂停', icon: iconPause },
          { command: 'crazyUniverse.addNote', label: '添加标记', icon: iconNote },
          { command: 'crazyUniverse.completeTask', label: '完成', icon: iconCheck },
          { command: 'crazyUniverse.openTimeline', label: '打开时间线', icon: iconHistory },
          { command: 'crazyUniverse.newTask', label: '新建任务', icon: iconAdd },
        ];
      }
      const items = [];
      if (status === 'completed') {
        items.push({ command: 'crazyUniverse.resumeTask', label: '恢复', icon: iconResume });
      } else {
        items.push({ command: 'crazyUniverse.startTask', label: '开始', icon: iconPlay });
        if (status === 'paused') {
          items.push({ command: 'crazyUniverse.completeTask', label: '完成', icon: iconCheck });
        }
        items.push({ command: 'crazyUniverse.addNote', label: '添加标记', icon: iconNote });
      }
      items.push(
        { command: 'crazyUniverse.openTimeline', label: '打开时间线', icon: iconHistory },
        { command: 'crazyUniverse.renameTask', label: '重命名任务', icon: iconRename },
        { command: 'crazyUniverse.deleteTask', label: '删除任务', icon: iconDelete },
      );
      return items;
    }

    function hideMenu() {
      menuEl.classList.add('hidden');
      menuEl.innerHTML = '';
    }

    function showMenu(taskEl, x, y) {
      const status = taskEl.dataset.status;
      const taskId = taskEl.dataset.task;
      menuEl.innerHTML = menuItems(status).map((item) => {
        const id = item.command === 'crazyUniverse.newTask' ? '' : taskId;
        return '<button type="button" data-run="' + escapeHtml(item.command) + '"' +
          (id ? ' data-task="' + escapeHtml(id) + '"' : '') + '>' + item.icon +
          '<span>' + escapeHtml(item.label) + '</span></button>';
      }).join('');
      menuEl.classList.remove('hidden');
      menuEl.style.left = x + 'px';
      menuEl.style.top = y + 'px';
      const rect = menuEl.getBoundingClientRect();
      const left = Math.min(x, Math.max(4, window.innerWidth - rect.width - 4));
      const top = Math.min(y, Math.max(4, window.innerHeight - rect.height - 4));
      menuEl.style.left = left + 'px';
      menuEl.style.top = top + 'px';
    }

    function render() {
      searchEl.classList.toggle('open', !!state.searchOpen);
      if (state.searchOpen && inputEl.value !== (state.searchNeedle || '')) {
        inputEl.value = state.searchNeedle || '';
      }
      if (state.empty) {
        treeEl.innerHTML = '<div class="hint">管理多个开发任务上下文，并记录开发工作流。</div>' +
          '<button class="empty-action" type="button" data-run="crazyUniverse.newTask">＋ 新建任务</button>';
        return;
      }
      treeEl.innerHTML = (state.sections || []).map((section) => {
        const isCollapsed = !!collapsed[section.id] && section.id !== 'search';
        const items = isCollapsed ? '' : (section.items || []).map((item) => {
          if (item.placeholder) {
            return '<div class="placeholder">' + escapeHtml(item.title) + '</div>';
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
      const target = event.target.closest('[data-run], [data-section], [data-task]');
      if (!target) {
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
      vscode.postMessage({ type: 'select', taskId: target.dataset.task });
    });
    treeEl.addEventListener('contextmenu', (event) => {
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
    window.addEventListener('blur', () => hideMenu());
    treeEl.addEventListener('scroll', () => hideMenu());
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        hideMenu();
      }
    });
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  return { html };
}
