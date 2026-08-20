import * as vscode from 'vscode';
import type { Task, TaskStatus } from '../types';

export class SectionItem extends vscode.TreeItem {
  readonly kind = 'section' as const;

  constructor(
    public readonly sectionId: 'current' | 'active' | 'completed',
    label: string,
    collapsible: vscode.TreeItemCollapsibleState,
  ) {
    super(label, collapsible);
    this.id = `section:${sectionId}`;
    this.contextValue = 'section';
  }
}

export class PlaceholderItem extends vscode.TreeItem {
  readonly kind = 'placeholder' as const;

  constructor(
    id: string,
    label: string,
    options?: {
      description?: string;
      command?: vscode.Command;
      icon?: string;
    },
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.id = id;
    this.contextValue = 'placeholder';
    this.description = options?.description;
    this.command = options?.command;
    if (options?.icon) {
      this.iconPath = new vscode.ThemeIcon(options.icon);
    }
  }
}

export class TaskItem extends vscode.TreeItem {
  readonly kind = 'task' as const;

  constructor(public readonly task: Task, extensionUri: vscode.Uri) {
    super(task.title, vscode.TreeItemCollapsibleState.None);
    this.id = task.id;
    this.contextValue = `task.${task.status}`;
    this.description = describeTask(task);
    this.tooltip = tooltipFor(task);
    this.iconPath = vscode.Uri.joinPath(extensionUri, 'resources', `status-${task.status}.svg`);
  }
}

export type TaskTreeNode = SectionItem | PlaceholderItem | TaskItem;

export function isTaskItem(value: unknown): value is TaskItem {
  return value instanceof TaskItem || (isRecord(value) && value.kind === 'task' && isRecord(value.task));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function describeTask(task: Task): string {
  const status = statusLabel(task.status);
  const branch = task.lastContext?.branch;
  return branch ? `${status} · ${branch}` : status;
}

function tooltipFor(task: Task): string {
  const lines = [task.title, statusLabel(task.status)];
  if (task.lastContext?.branch) {
    lines.push(task.lastContext.branch);
  }
  if (task.lastContext?.workspacePath) {
    lines.push(task.lastContext.workspacePath);
  }
  return lines.join('\n');
}

export function statusLabel(status: TaskStatus): string {
  switch (status) {
    case 'not_started':
      return '未开始';
    case 'in_progress':
      return '进行中';
    case 'paused':
      return '已暂停';
    case 'completed':
      return '已完成';
    default:
      return status;
  }
}
