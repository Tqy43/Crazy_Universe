import * as vscode from 'vscode';
import { COMMANDS, VIEWS } from '../constants';
import { NOTE_KINDS } from '../domain/notes';
import { IllegalTransitionError } from '../domain/stateMachine';
import type { TaskService } from '../domain/TaskService';
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
        prompt: '任务标题',
        placeHolder: '例如：实现登录页',
        ignoreFocusOut: false,
        validateInput: (value) => (value.trim() ? undefined : '请输入标题'),
      });
      if (title === undefined) {
        return;
      }
      try {
        const task = await service.createTask(title);
        await delay(50);
        await taskList.reveal(task.id);
      } catch (error) {
        showError('创建任务失败', error);
      }
    }),
    vscode.commands.registerCommand(COMMANDS.renameTask, async (item?: unknown) => {
      const taskId = resolveTaskId(taskList, item);
      if (!taskId) {
        void vscode.window.showWarningMessage('请先选中一个任务。');
        return;
      }
      const current = store.getTask(taskId);
      if (!current) {
        void vscode.window.showWarningMessage('任务不存在。');
        return;
      }
      const title = await vscode.window.showInputBox({
        prompt: '重命名任务',
        value: current.title,
        ignoreFocusOut: false,
        validateInput: (value) => (value.trim() ? undefined : '请输入标题'),
      });
      if (title === undefined) {
        return;
      }
      try {
        await service.rename(taskId, title);
        await delay(50);
        await taskList.reveal(taskId);
      } catch (error) {
        showError('重命名失败', error);
      }
    }),
    vscode.commands.registerCommand(COMMANDS.deleteTask, async (item?: unknown) => {
      const taskId = resolveTaskId(taskList, item);
      if (!taskId) {
        void vscode.window.showWarningMessage('请先选中一个任务。');
        return;
      }
      const current = store.getTask(taskId);
      if (!current) {
        void vscode.window.showWarningMessage('任务不存在。');
        return;
      }
      const confirmed = await vscode.window.showWarningMessage(
        `删除任务「${current.title}」？此操作仅在本机生效，且不可撤销。`,
        { modal: true },
        '删除',
      );
      if (confirmed !== '删除') {
        return;
      }
      try {
        await service.delete(taskId);
      } catch (error) {
        showError('删除失败', error);
      }
    }),
    vscode.commands.registerCommand(COMMANDS.filterTasks, () => taskList.toggleSearch()),
    vscode.commands.registerCommand(COMMANDS.filterTimeline, () => timelineProvider.pickFilter()),
    vscode.commands.registerCommand(COMMANDS.startTask, async (item?: unknown) => {
      const taskId = resolveTaskId(taskList, item);
      if (!taskId) {
        void vscode.window.showWarningMessage('请先选中一个任务。');
        return;
      }
      await runLifecycle(store, taskList, taskId, '开始任务失败', async (task) => {
        const { pausedTitle } = await service.start(task.id);
        if (pausedTitle) {
          void vscode.window.showInformationMessage(
            `已暂停「${pausedTitle}」，并开始「${task.title}」。`,
          );
        }
      });
    }),
    vscode.commands.registerCommand(COMMANDS.pauseTask, async (item?: unknown) => {
      const taskId =
        resolveTaskId(taskList, item) ??
        store.getTasks().find((task) => task.status === 'in_progress')?.id;
      if (!taskId) {
        void vscode.window.showWarningMessage('请先开始一个任务。');
        return;
      }
      const current = store.getTask(taskId);
      if (!current) {
        void vscode.window.showWarningMessage('任务不存在。');
        return;
      }
      if (current.status !== 'in_progress') {
        void vscode.window.showWarningMessage('只有进行中的任务可以暂停。');
        return;
      }
      const nextPlan = await skippableInput('下一步计划（可跳过）', '回来后第一件要做的事');
      await runLifecycle(store, taskList, taskId, '暂停任务失败', () =>
        service.pause(taskId, nextPlan),
      );
    }),
    vscode.commands.registerCommand(COMMANDS.resumeTask, async (item?: unknown) => {
      const taskId = resolveTaskId(taskList, item);
      if (!taskId) {
        void vscode.window.showWarningMessage('请先选中一个已完成的任务。');
        return;
      }
      const current = store.getTask(taskId);
      if (!current) {
        void vscode.window.showWarningMessage('任务不存在。');
        return;
      }
      if (current.status !== 'completed') {
        void vscode.window.showWarningMessage('只有已完成的任务可以恢复到活动列表。已暂停的任务请直接开始。');
        return;
      }
      await runLifecycle(store, taskList, taskId, '恢复任务失败', async (task) => {
        await service.resume(task.id);
        void vscode.window.showInformationMessage(`已将「${task.title}」恢复到活动任务。`);
      });
    }),
    vscode.commands.registerCommand(COMMANDS.completeTask, async (item?: unknown) => {
      const taskId = resolveTaskId(taskList, item);
      if (!taskId) {
        void vscode.window.showWarningMessage('请先选中一个任务。');
        return;
      }
      const current = store.getTask(taskId);
      if (!current) {
        void vscode.window.showWarningMessage('任务不存在。');
        return;
      }
      if (current.status !== 'in_progress' && current.status !== 'paused') {
        void vscode.window.showWarningMessage('未开始的任务无法完成。');
        return;
      }
      const comment = await skippableInput('完成说明（可跳过）');
      await runLifecycle(store, taskList, taskId, '完成任务失败', () =>
        service.complete(taskId, comment),
      );
    }),
    vscode.commands.registerCommand(COMMANDS.addNote, async (item?: unknown) => {
      const taskId = resolveTaskId(taskList, item);
      if (!taskId) {
        void vscode.window.showWarningMessage('请先选中一个任务。');
        return;
      }
      const current = store.getTask(taskId);
      if (!current) {
        void vscode.window.showWarningMessage('任务不存在。');
        return;
      }
      if (current.status === 'completed') {
        void vscode.window.showWarningMessage('已完成任务请先恢复到活动再添加标记。');
        return;
      }
      const picked = await vscode.window.showQuickPick(
        NOTE_KINDS.map((item) => ({
          label: item.label,
          noteKind: item.id,
        })),
        { placeHolder: '选择标记类型', ignoreFocusOut: true },
      );
      if (!picked) {
        return;
      }
      const body = await vscode.window.showInputBox({
        prompt: '标记正文',
        placeHolder: '记下修改意图、问题或下一步',
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
        showError('添加标记失败', error);
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
            { label: '$(debug-pause) 暂停', action: 'pause' as const },
            { label: '$(note) 添加标记', action: 'note' as const },
            { label: '$(check) 完成', action: 'complete' as const },
            { label: '$(history) 打开时间线', action: 'timeline' as const },
            { label: '$(add) 新建任务', action: 'new' as const },
          ],
          { placeHolder: `${current.title} · 进行中` },
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
            description: '已暂停',
            action: 'start' as const,
            task,
          })),
          ...notStarted.map((task) => ({
            label: task.title,
            description: '未开始',
            action: 'start' as const,
            task,
          })),
          { label: '$(add) 新建任务', description: '', action: 'new' as const, task: undefined },
        ],
        { placeHolder: '开始一个任务' },
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

async function runLifecycle(
  store: TaskStore,
  taskList: TaskListViewProvider,
  taskId: string,
  errorPrefix: string,
  action: (task: NonNullable<ReturnType<TaskStore['getTask']>>) => Promise<void>,
): Promise<void> {
  const task = store.getTask(taskId);
  if (!task) {
    void vscode.window.showWarningMessage('任务不存在。');
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
  void vscode.window.showErrorMessage(`${prefix}：${message}`);
}
