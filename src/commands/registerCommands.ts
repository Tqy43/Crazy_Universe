import * as vscode from 'vscode';
import { COMMANDS, CONFIG, VIEWS } from '../constants';
import { noteKinds } from '../domain/notes';
import { IllegalTransitionError } from '../domain/stateMachine';
import type { TaskService } from '../domain/TaskService';
import { getLocale, resolveLocale, setLocale, t } from '../i18n';
import type { TaskStore } from '../store/TaskStore';
import type { TaskListViewProvider } from '../views/TaskListViewProvider';
import type { TimelineViewProvider } from '../views/TimelineViewProvider';
import { isTaskItem } from '../views/taskTreeNodes';

export function registerCommands(
  context: vscode.ExtensionContext,
  deps: {
    service: TaskService;
    store: TaskStore;
    taskList: TaskListViewProvider;
    timelineProvider: TimelineViewProvider;
  },
): void {
  const { service, store, taskList, timelineProvider } = deps;

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.newTask, async () => {
      const title = await vscode.window.showInputBox({
        prompt: t('prompt.title'),
        placeHolder: t('prompt.titlePlaceholder'),
        ignoreFocusOut: false,
        validateInput: (value) => (value.trim() ? undefined : t('prompt.titleRequired')),
      });
      if (title === undefined) {
        return;
      }
      try {
        const task = await service.createTask(title);
        await delay(50);
        await taskList.reveal(task.id);
      } catch (error) {
        showError(t('error.create'), error);
      }
    }),
    vscode.commands.registerCommand(COMMANDS.renameTask, async (item?: unknown) => {
      const taskId = resolveTaskId(taskList, item);
      if (!taskId) {
        void vscode.window.showWarningMessage(t('warn.selectTask'));
        return;
      }
      const current = store.getTask(taskId);
      if (!current) {
        void vscode.window.showWarningMessage(t('warn.missingTask'));
        return;
      }
      const title = await vscode.window.showInputBox({
        prompt: t('prompt.rename'),
        value: current.title,
        ignoreFocusOut: false,
        validateInput: (value) => (value.trim() ? undefined : t('prompt.titleRequired')),
      });
      if (title === undefined) {
        return;
      }
      try {
        await service.rename(taskId, title);
        await delay(50);
        await taskList.reveal(taskId);
      } catch (error) {
        showError(t('error.rename'), error);
      }
    }),
    vscode.commands.registerCommand(COMMANDS.deleteTask, async (item?: unknown) => {
      const taskId = resolveTaskId(taskList, item);
      if (!taskId) {
        void vscode.window.showWarningMessage(t('warn.selectTask'));
        return;
      }
      const current = store.getTask(taskId);
      if (!current) {
        void vscode.window.showWarningMessage(t('warn.missingTask'));
        return;
      }
      const deleteAction = t('confirm.deleteAction');
      const confirmed = await vscode.window.showWarningMessage(
        t('confirm.delete', { title: current.title }),
        { modal: true },
        deleteAction,
      );
      if (confirmed !== deleteAction) {
        return;
      }
      try {
        await service.delete(taskId);
      } catch (error) {
        showError(t('error.delete'), error);
      }
    }),
    vscode.commands.registerCommand(COMMANDS.filterTasks, () => taskList.toggleSearch()),
    vscode.commands.registerCommand(COMMANDS.toggleLanguage, () => pickLanguage()),
    vscode.commands.registerCommand(COMMANDS.filterTimeline, () => timelineProvider.pickFilter()),
    vscode.commands.registerCommand(COMMANDS.startTask, async (item?: unknown) => {
      const taskId = resolveTaskId(taskList, item);
      if (!taskId) {
        void vscode.window.showWarningMessage(t('warn.selectTask'));
        return;
      }
      await runLifecycle(store, taskList, taskId, t('error.start'), async (task) => {
        const { pausedTitle } = await service.start(task.id);
        if (pausedTitle) {
          void vscode.window.showInformationMessage(
            t('info.pausedAndStarted', { paused: pausedTitle, started: task.title }),
          );
        }
      });
    }),
    vscode.commands.registerCommand(COMMANDS.pauseTask, async (item?: unknown) => {
      const taskId =
        resolveTaskId(taskList, item) ??
        store.getTasks().find((task) => task.status === 'in_progress')?.id;
      if (!taskId) {
        void vscode.window.showWarningMessage(t('warn.startFirst'));
        return;
      }
      const current = store.getTask(taskId);
      if (!current) {
        void vscode.window.showWarningMessage(t('warn.missingTask'));
        return;
      }
      if (current.status !== 'in_progress') {
        void vscode.window.showWarningMessage(t('warn.pauseOnlyActive'));
        return;
      }
      const nextPlan = await skippableInput(t('prompt.nextPlan'), t('prompt.nextPlanPlaceholder'));
      await runLifecycle(store, taskList, taskId, t('error.pause'), () =>
        service.pause(taskId, nextPlan),
      );
    }),
    vscode.commands.registerCommand(COMMANDS.resumeTask, async (item?: unknown) => {
      const taskId = resolveTaskId(taskList, item);
      if (!taskId) {
        void vscode.window.showWarningMessage(t('warn.selectCompleted'));
        return;
      }
      const current = store.getTask(taskId);
      if (!current) {
        void vscode.window.showWarningMessage(t('warn.missingTask'));
        return;
      }
      if (current.status !== 'completed') {
        void vscode.window.showWarningMessage(t('warn.resumeOnlyCompleted'));
        return;
      }
      await runLifecycle(store, taskList, taskId, t('error.resume'), async (task) => {
        await service.resume(task.id);
        void vscode.window.showInformationMessage(t('info.resumed', { title: task.title }));
      });
    }),
    vscode.commands.registerCommand(COMMANDS.completeTask, async (item?: unknown) => {
      const taskId = resolveTaskId(taskList, item);
      if (!taskId) {
        void vscode.window.showWarningMessage(t('warn.selectTask'));
        return;
      }
      const current = store.getTask(taskId);
      if (!current) {
        void vscode.window.showWarningMessage(t('warn.missingTask'));
        return;
      }
      if (current.status !== 'in_progress' && current.status !== 'paused') {
        void vscode.window.showWarningMessage(t('warn.completeNeedStart'));
        return;
      }
      const comment = await skippableInput(t('prompt.completeNote'));
      await runLifecycle(store, taskList, taskId, t('error.complete'), () =>
        service.complete(taskId, comment),
      );
    }),
    vscode.commands.registerCommand(COMMANDS.addNote, async (item?: unknown) => {
      const taskId = resolveTaskId(taskList, item);
      if (!taskId) {
        void vscode.window.showWarningMessage(t('warn.selectTask'));
        return;
      }
      const current = store.getTask(taskId);
      if (!current) {
        void vscode.window.showWarningMessage(t('warn.missingTask'));
        return;
      }
      if (current.status === 'completed') {
        void vscode.window.showWarningMessage(t('warn.noteNeedActive'));
        return;
      }
      const picked = await vscode.window.showQuickPick(
        noteKinds().map((item) => ({
          label: item.label,
          noteKind: item.id,
        })),
        { placeHolder: t('prompt.noteKind'), ignoreFocusOut: true },
      );
      if (!picked) {
        return;
      }
      const body = await vscode.window.showInputBox({
        prompt: t('prompt.noteBody'),
        placeHolder: t('timeline.bodyPlaceholder'),
        ignoreFocusOut: true,
      });
      if (body === undefined) {
        return;
      }
      try {
        await service.addNote(taskId, picked.noteKind, body);
        await delay(50);
        await taskList.reveal(taskId);
        await vscode.commands.executeCommand(`${VIEWS.timeline}.focus`);
      } catch (error) {
        showError(t('error.note'), error);
      }
    }),
    vscode.commands.registerCommand(COMMANDS.openTimeline, async (item?: unknown) => {
      const taskId = resolveTaskId(taskList, item);
      if (taskId) {
        await taskList.reveal(taskId);
      }
      await vscode.commands.executeCommand(`${VIEWS.timeline}.focus`);
    }),
    vscode.commands.registerCommand(COMMANDS.focus, async () => {
      await vscode.commands.executeCommand(`${VIEWS.tasks}.focus`);
    }),
    vscode.commands.registerCommand(COMMANDS.statusBarPick, async () => {
      const current = store.getTasks().find((task) => task.status === 'in_progress');
      if (current) {
        const picked = await vscode.window.showQuickPick(
          [
            { label: `$(debug-pause) ${t('action.pause')}`, action: 'pause' as const },
            { label: `$(note) ${t('action.note')}`, action: 'note' as const },
            { label: `$(check) ${t('action.complete')}`, action: 'complete' as const },
            { label: `$(history) ${t('action.timeline')}`, action: 'timeline' as const },
            { label: `$(add) ${t('action.new')}`, action: 'new' as const },
          ],
          { placeHolder: t('statusBar.pickActive', { title: current.title }) },
        );
        if (!picked) {
          return;
        }
        const item = { kind: 'task' as const, task: current };
        if (picked.action === 'pause') {
          await vscode.commands.executeCommand(COMMANDS.pauseTask, item);
        } else if (picked.action === 'note') {
          await vscode.commands.executeCommand(COMMANDS.addNote, item);
        } else if (picked.action === 'complete') {
          await vscode.commands.executeCommand(COMMANDS.completeTask, item);
        } else if (picked.action === 'timeline') {
          await vscode.commands.executeCommand(COMMANDS.openTimeline, item);
        } else {
          await vscode.commands.executeCommand(COMMANDS.newTask);
        }
        return;
      }

      const paused = store
        .getTasks()
        .filter((task) => task.status === 'paused')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const notStarted = store
        .getTasks()
        .filter((task) => task.status === 'not_started')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const picked = await vscode.window.showQuickPick(
        [
          ...paused.map((task) => ({
            label: task.title,
            description: t('status.paused'),
            action: 'start' as const,
            task,
          })),
          ...notStarted.map((task) => ({
            label: task.title,
            description: t('status.not_started'),
            action: 'start' as const,
            task,
          })),
          { label: `$(add) ${t('action.new')}`, description: '', action: 'new' as const, task: undefined },
        ],
        { placeHolder: t('statusBar.pickStart') },
      );
      if (!picked) {
        return;
      }
      if (picked.action === 'new' || !picked.task) {
        await vscode.commands.executeCommand(COMMANDS.newTask);
        return;
      }
      await vscode.commands.executeCommand(COMMANDS.startTask, { kind: 'task', task: picked.task });
    }),
  );
}

async function pickLanguage(): Promise<void> {
  const current = getLocale();
  const picked = await vscode.window.showQuickPick(
    [
      { label: t('language.en'), locale: 'en' as const, picked: current === 'en' },
      { label: t('language.zh'), locale: 'zh-cn' as const, picked: current === 'zh-cn' },
    ],
    { placeHolder: t('language.pick'), ignoreFocusOut: false },
  );
  if (!picked) {
    return;
  }
  await vscode.workspace.getConfiguration().update(CONFIG.locale, picked.locale, vscode.ConfigurationTarget.Global);
}

export function applyLocaleFromConfig(): void {
  const pref = vscode.workspace.getConfiguration().get<string>(CONFIG.locale, 'auto');
  setLocale(resolveLocale(pref, vscode.env.language));
}

async function runLifecycle(
  store: TaskStore,
  taskList: TaskListViewProvider,
  taskId: string,
  errorPrefix: string,
  action: (task: NonNullable<ReturnType<TaskStore['getTask']>>) => Promise<void>,
): Promise<void> {
  const task = store.getTask(taskId);
  if (!task) {
    void vscode.window.showWarningMessage(t('warn.missingTask'));
    return;
  }
  try {
    await action(task);
    await delay(50);
    await taskList.reveal(taskId);
  } catch (error) {
    if (error instanceof IllegalTransitionError) {
      void vscode.window.showWarningMessage(error.message);
      return;
    }
    showError(errorPrefix, error);
  }
}

async function skippableInput(prompt: string, placeHolder?: string): Promise<string | undefined> {
  const value = await vscode.window.showInputBox({
    prompt,
    placeHolder,
    ignoreFocusOut: false,
  });
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveTaskId(taskList: TaskListViewProvider, item?: unknown): string | undefined {
  if (isTaskItem(item)) {
    return item.task.id;
  }
  return taskList.getSelectedTaskId();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function showError(prefix: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const sep = getLocale() === 'en' ? ': ' : '：';
  void vscode.window.showErrorMessage(`${prefix}${sep}${message}`);
}
