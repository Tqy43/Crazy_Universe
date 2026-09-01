import * as vscode from 'vscode';
import { CONFIG, CONTEXT, OUTPUT_CHANNEL, VIEWS } from './constants';
import { applyLocaleFromConfig, registerCommands } from './commands/registerCommands';
import { t } from './i18n';
import { TaskService } from './domain/TaskService';
import { GitReader } from './snapshot/GitReader';
import { SnapshotCollector } from './snapshot/SnapshotCollector';
import { StoreVersionError, TaskStore } from './store/TaskStore';
import { StatusBarController } from './views/StatusBarController';
import { TaskListViewProvider } from './views/TaskListViewProvider';
import { TimelineViewProvider } from './views/TimelineViewProvider';
import { WorklogService } from './worklog/WorklogService';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  applyLocaleFromConfig();
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
    void vscode.window.showErrorMessage(t('error.openStore', { message }));
    output.appendLine(t('error.openStore', { message }));
    return;
  }

  context.subscriptions.push(store);
  output.appendLine(`任务库：${store.storageDir}`);

  const collector = new SnapshotCollector(new GitReader((message) => output.appendLine(message)));
  const service = new TaskService(store, (options) => collector.capture(options));
  const worklog = new WorklogService(context, (message) => output.appendLine(message));

  await store.commit((draft) => {
    const demoId = 'crazy-universe-worklog-demo';
    const before = draft.tasks.length;
    draft.tasks = draft.tasks.filter((item) => item.id !== demoId);
    draft.events = draft.events.filter((item) => item.taskId !== demoId);
    if (draft.tasks.length !== before) {
      output.appendLine('已移除工时演示任务。');
    }
  });
  const timelineProvider = new TimelineViewProvider(context, store, service, collector, worklog);
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
      if (event.affectsConfiguration(CONFIG.locale)) {
        applyLocaleFromConfig();
        taskList.refresh();
        statusBar.refresh();
        timelineProvider.refresh();
      }
      if (
        event.affectsConfiguration(CONFIG.worklogEnabled) ||
        event.affectsConfiguration(CONFIG.worklogRunning)
      ) {
        taskList.refresh();
        timelineProvider.refresh();
      }
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
  void vscode.commands.executeCommand('setContext', CONTEXT.timelineFeed, 'none');

  registerCommands(context, { service, store, taskList, timelineProvider, worklog });
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
