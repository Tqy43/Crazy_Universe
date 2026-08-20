import * as vscode from 'vscode';
import { CONTEXT } from '../constants';
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

  async reveal(taskId: string): Promise<void> {
    this.selectTask(taskId);
    this.pushState();
    await vscode.commands.executeCommand(`${TaskListViewProvider.viewType}.focus`);
  }

  refresh(): void {
    if (this.selectedTaskId && !this.store.getTask(this.selectedTaskId)) {
      this.selectTask(undefined);
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
        empty: tasks.length === 0,
        sections: this.sections(tasks),
      },
    });
    this.focusSearch = false;
  }

  private sections(tasks: Task[]) {
    const needle = this.searchOpen ? this.searchNeedle.trim().toLowerCase() : '';
    if (needle) {
      const hits = [
        ...tasks.filter((task) => task.status === 'in_progress'),
        ...activeTasks(tasks),
        ...completedTasks(tasks),
      ].filter((task) => task.title.toLowerCase().includes(needle));
      return [
        {
          id: 'search',
          title: '搜索结果',
          items: hits.length > 0 ? hits.map((task) => this.item(task)) : [
            { placeholder: true, title: '没有匹配的任务' },
          ],
        },
      ];
    }
    const current = tasks.find((task) => task.status === 'in_progress');
    return [
      {
        id: 'current',
        title: '当前任务',
        items: current
          ? [this.item(current)]
          : [{ placeholder: true, title: '没有进行中的任务' }],
      },
      {
        id: 'active',
        title: '活动',
        items: activeTasks(tasks).map((task) => this.item(task)),
      },
      {
        id: 'completed',
        title: '已完成',
        items: completedTasks(tasks).map((task) => this.item(task)),
      },
    ];
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
      ? { tooltip: `进行中：${current.title}`, value: 1 }
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
