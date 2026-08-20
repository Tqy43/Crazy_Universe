import * as vscode from 'vscode';
import { CONFIG, CONTEXT, OUTPUT_CHANNEL, VIEWS } from './constants';
import { registerCommands } from './commands/registerCommands';
import { TaskService } from './domain/TaskService';
import { GitReader } from './snapshot/GitReader';
import { SnapshotCollector } from './snapshot/SnapshotCollector';
import { StoreVersionError, TaskStore } from './store/TaskStore';
import { StatusBarController } from './views/StatusBarController';
import { TaskListViewProvider } from './views/TaskListViewProvider';
import { TimelineViewProvider } from './views/TimelineViewProvider';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel(OUTPUT_CHANNEL);
  context.subscriptions.push(output);

  let store: TaskStore;
  try {
    store = await TaskStore.open(context);
  } catch (error) {
    const message =
      error instanceof StoreVersionError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    void vscode.window.showErrorMessage(`Crazy Universe 无法打开本地任务库：${message}`);
    output.appendLine(`打开任务库失败：${message}`);
    return;
  }

  context.subscriptions.push(store);
  output.appendLine(`任务库：${store.storageDir}`);

  const collector = new SnapshotCollector(new GitReader((message) => output.appendLine(message)));
  const service = new TaskService(store, (options) => collector.capture(options));
  const timelineProvider = new TimelineViewProvider(context, store, service, collector);
  const taskList = new TaskListViewProvider(context, store, (task) => {
    timelineProvider.setSelectedTask(task);
  });
  const statusBar = new StatusBarController(store, (message) => output.appendLine(message));

  context.subscriptions.push(
    statusBar,
    vscode.window.registerWebviewViewProvider(VIEWS.tasks, taskList, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewViewProvider(VIEWS.timeline, timelineProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.onDidChangeWindowState(() => statusBar.refresh()),
    store.onDidChange(() => {
      taskList.refresh();
      statusBar.refresh();
      syncWorkspaceContext(store);
      timelineProvider.refresh();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration(CONFIG.includeOpenFiles) ||
        event.affectsConfiguration(CONFIG.includeChangedPaths)
      ) {
        timelineProvider.refresh();
      }
    }),
  );

  syncWorkspaceContext(store);
  void vscode.commands.executeCommand('setContext', CONTEXT.hasSelection, false);

  registerCommands(context, { service, store, taskList, timelineProvider });
}

export function deactivate(): void {}

function syncWorkspaceContext(store: TaskStore): void {
  const tasks = store.getTasks();
  void vscode.commands.executeCommand('setContext', CONTEXT.hasTasks, tasks.length > 0);
  void vscode.commands.executeCommand(
    'setContext',
    CONTEXT.hasActiveTask,
    tasks.some((task) => task.status === 'in_progress'),
  );
}
