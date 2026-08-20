import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { t } from '../i18n';
import type { Task } from '../types';
import type { TaskStore } from '../store/TaskStore';
import {
  PlaceholderItem,
  SectionItem,
  TaskItem,
  type TaskTreeNode,
} from './taskTreeNodes';

export class TaskTreeProvider implements vscode.TreeDataProvider<TaskTreeNode> {
  private readonly didChangeTreeData = new vscode.EventEmitter<
    TaskTreeNode | undefined | void
  >();

  readonly onDidChangeTreeData = this.didChangeTreeData.event;

  constructor(
    private readonly store: TaskStore,
    private readonly extensionUri: vscode.Uri,
  ) {}

  refresh(): void {
    this.didChangeTreeData.fire();
  }

  getTreeItem(element: TaskTreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TaskTreeNode): vscode.ProviderResult<TaskTreeNode[]> {
    if (!element) {
      if (this.store.getTasks().length === 0) {
        return [
          new PlaceholderItem('placeholder:empty.hint', t('empty.hint')),
          new PlaceholderItem('placeholder:empty.create', t('action.new'), {
            icon: 'add',
            command: { command: COMMANDS.newTask, title: t('action.new') },
          }),
        ];
      }
      return [
        new SectionItem('current', t('section.current'), vscode.TreeItemCollapsibleState.Expanded),
        new SectionItem('active', t('section.active'), vscode.TreeItemCollapsibleState.Expanded),
        new SectionItem('completed', t('section.completed'), vscode.TreeItemCollapsibleState.Collapsed),
      ];
    }

    if (element.kind !== 'section') {
      return [];
    }

    const tasks = this.store.getTasks();
    if (element.sectionId === 'current') {
      const current = tasks.find((task) => task.status === 'in_progress');
      return current
        ? [new TaskItem(current, this.extensionUri)]
        : [new PlaceholderItem('placeholder:current', t('empty.noInProgress'))];
    }

    if (element.sectionId === 'active') {
      return this.activeTasks(tasks).map((task) => new TaskItem(task, this.extensionUri));
    }

    return this.completedTasks(tasks).map((task) => new TaskItem(task, this.extensionUri));
  }

  getParent(element: TaskTreeNode): vscode.ProviderResult<TaskTreeNode> {
    if (element.kind === 'section') {
      return undefined;
    }
    if (element.kind === 'placeholder') {
      if (element.id?.startsWith('placeholder:empty')) {
        return undefined;
      }
      return new SectionItem('current', t('section.current'), vscode.TreeItemCollapsibleState.Expanded);
    }
    if (element.task.status === 'completed') {
      return new SectionItem('completed', t('section.completed'), vscode.TreeItemCollapsibleState.Collapsed);
    }
    if (element.task.status === 'in_progress') {
      return new SectionItem('current', t('section.current'), vscode.TreeItemCollapsibleState.Expanded);
    }
    return new SectionItem('active', t('section.active'), vscode.TreeItemCollapsibleState.Expanded);
  }

  asTaskItem(taskId: string): TaskItem | undefined {
    const task = this.store.getTask(taskId);
    return task ? new TaskItem(task, this.extensionUri) : undefined;
  }

  private activeTasks(tasks: Task[]): Task[] {
    const paused = tasks
      .filter((task) => task.status === 'paused')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const notStarted = tasks
      .filter((task) => task.status === 'not_started')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return [...paused, ...notStarted];
  }

  private completedTasks(tasks: Task[]): Task[] {
    return tasks
      .filter((task) => task.status === 'completed')
      .sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt));
  }
}
