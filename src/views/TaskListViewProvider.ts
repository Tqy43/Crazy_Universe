import * as vscode from 'vscode';
import { CONTEXT, CONFIG } from '../constants';
import { t, webviewUi } from '../i18n';
import type { Task } from '../types';
import type { TaskStore } from '../store/TaskStore';
import { describeTask } from './taskTreeNodes';
import { renderTaskListShell } from '../webview/taskList.html';

export class TaskListViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'crazyUniverse.tasks';

  private view?: vscode.WebviewView;
  private searchOpen = false;
  private searchNeedle = '';
  private focusSearch = false;
  private selectedTaskId: string | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly store: TaskStore,
    private readonly onSelect: (task: Task | undefined) => void,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };
    webviewView.webview.onDidReceiveMessage((message: unknown) => {
      void this.onMessage(message);
    });
    webviewView.webview.html = renderTaskListShell(webviewView.webview.cspSource).html;
    webviewView.title = t('view.tasks');
    this.syncBadge();
  }

  getSelectedTaskId(): string | undefined {
    return this.selectedTaskId;
  }

  toggleSearch(): void {
    this.searchOpen = !this.searchOpen;
    if (!this.searchOpen) {
      this.searchNeedle = '';
    }
    this.focusSearch = this.searchOpen;
    this.pushState();
    void vscode.commands.executeCommand(`${TaskListViewProvider.viewType}.focus`);
  }

  closeSearch(): void {
    if (!this.searchOpen && !this.searchNeedle) {
      return;
    }
    this.searchOpen = false;
    this.searchNeedle = '';
    this.focusSearch = false;
    this.pushState();
  }

  async setWorklog(next: { visible?: boolean; running?: boolean }): Promise<void> {
    const config = vscode.workspace.getConfiguration();
    if (next.visible !== undefined) {
      await config.update(CONFIG.worklogEnabled, next.visible, vscode.ConfigurationTarget.Global);
    }
    if (next.running !== undefined) {
      await config.update(CONFIG.worklogRunning, next.running, vscode.ConfigurationTarget.Global);
    }
  }

  async reveal(taskId: string): Promise<void> {
    this.selectTask(taskId);
    this.pushState();
    await vscode.commands.executeCommand(`${TaskListViewProvider.viewType}.focus`);
  }

  refresh(): void {
    if (this.selectedTaskId && !this.store.getTask(this.selectedTaskId)) {
      this.selectTask(undefined);
    }
    if (this.view) {
      this.view.title = t('view.tasks');
    }
    this.syncBadge();
    this.pushState();
  }

  private async onMessage(message: unknown): Promise<void> {
    if (!message || typeof message !== 'object' || !('type' in message)) {
      return;
    }
    const payload = message as Record<string, unknown>;
    switch (payload.type) {
      case 'ready':
        this.pushState();
        return;
      case 'query':
        this.searchNeedle = String(payload.text ?? '');
        this.focusSearch = false;
        this.pushState();
        return;
      case 'closeSearch':
        this.closeSearch();
        return;
      case 'tool': {
        const id = String(payload.id ?? '');
        const action = String(payload.action ?? '');
        if (id !== 'worklog') {
          return;
        }
        if (action === 'start') {
          await this.setWorklog({ visible: true, running: true });
        } else if (action === 'end') {
          await this.setWorklog({ visible: true, running: false });
        } else if (action === 'hide') {
          await this.setWorklog({ visible: false, running: false });
        }
        return;
      }
      case 'select':
        this.selectTask(String(payload.taskId ?? '') || undefined);
        this.pushState();
        return;
      case 'run': {
        const command = String(payload.command ?? '');
        const taskId = String(payload.taskId ?? '');
        const task = taskId ? this.store.getTask(taskId) : undefined;
        if (task) {
          this.selectTask(task.id);
          this.pushState();
        }
        await vscode.commands.executeCommand(command, task ? { kind: 'task', task } : undefined);
        return;
      }
      default:
        return;
    }
  }

  private selectTask(taskId: string | undefined): void {
    const task = taskId ? this.store.getTask(taskId) : undefined;
    this.selectedTaskId = task?.id;
    void vscode.commands.executeCommand('setContext', CONTEXT.hasSelection, Boolean(task));
    void vscode.commands.executeCommand(
      'setContext',
      CONTEXT.selectionStatus,
      task?.status,
    );
    this.onSelect(task);
  }

  private pushState(): void {
    if (!this.view) {
      return;
    }
    const tasks = this.store.getTasks();
    this.view.webview.postMessage({
      type: 'state',
      state: {
        searchOpen: this.searchOpen,
        searchNeedle: this.searchNeedle,
        focusSearch: this.focusSearch,
        selectedTaskId: this.selectedTaskId ?? '',
        empty: tasks.length === 0 && !this.worklogVisible(),
        sections: this.sections(tasks),
        ui: webviewUi(),
      },
    });
    this.focusSearch = false;
  }

  private sections(tasks: Task[]) {
    const needle = this.searchOpen ? this.searchNeedle.trim().toLowerCase() : '';
    const toolItems = this.toolItems(needle);
    if (needle) {
      const hits = [
        ...tasks.filter((task) => task.status === 'in_progress'),
        ...activeTasks(tasks),
        ...completedTasks(tasks),
      ].filter((task) => task.title.toLowerCase().includes(needle));
      const items = [
        ...hits.map((task) => this.item(task)),
        ...toolItems,
      ];
      return [
        {
          id: 'search',
          title: t('section.search'),
          items: items.length > 0 ? items : [
            { placeholder: true, title: t('empty.noMatch') },
          ],
        },
      ];
    }
    const current = tasks.find((task) => task.status === 'in_progress');
    return [
      {
        id: 'tools',
        title: t('section.tools'),
        items: toolItems.length > 0 ? toolItems : [{ placeholder: true, title: t('empty.noTools') }],
      },
      {
        id: 'current',
        title: t('section.current'),
        items: current
          ? [this.item(current)]
          : [{ placeholder: true, title: t('empty.noInProgress') }],
      },
      {
        id: 'active',
        title: t('section.active'),
        items: activeTasks(tasks).map((task) => this.item(task)),
      },
      {
        id: 'completed',
        title: t('section.completed'),
        items: completedTasks(tasks).map((task) => this.item(task)),
      },
    ];
  }

  private toolItems(needle: string) {
    if (!this.worklogVisible()) {
      return [];
    }
    const title = t('tools.bar');
    if (needle && !title.toLowerCase().includes(needle) && !t('tools.worklog').toLowerCase().includes(needle)) {
      return [];
    }
    const running = this.worklogRunning();
    return [
      {
        id: 'worklog',
        kind: 'tool' as const,
        title,
        description: running ? t('tools.running') : t('tools.stopped'),
        status: running ? 'running' : 'stopped',
      },
    ];
  }

  private worklogVisible(): boolean {
    return vscode.workspace.getConfiguration().get<boolean>(CONFIG.worklogEnabled, false);
  }

  private worklogRunning(): boolean {
    if (!this.worklogVisible()) {
      return false;
    }
    return vscode.workspace.getConfiguration().get<boolean>(CONFIG.worklogRunning, true);
  }

  private item(task: Task) {
    return {
      id: task.id,
      title: task.title,
      description: describeTask(task),
      status: task.status,
      icon: this.view?.webview
        .asWebviewUri(
          vscode.Uri.joinPath(this.context.extensionUri, 'resources', `status-${task.status}.svg`),
        )
        .toString() ?? '',
    };
  }

  private syncBadge(): void {
    if (!this.view) {
      return;
    }
    const current = this.store.getTasks().find((task) => task.status === 'in_progress');
    this.view.badge = current
      ? { tooltip: t('badge.inProgress', { title: current.title }), value: 1 }
      : undefined;
  }
}

function activeTasks(tasks: Task[]): Task[] {
  const paused = tasks
    .filter((task) => task.status === 'paused')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const notStarted = tasks
    .filter((task) => task.status === 'not_started')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return [...paused, ...notStarted];
}

function completedTasks(tasks: Task[]): Task[] {
  return tasks
    .filter((task) => task.status === 'completed')
    .sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt));
}
