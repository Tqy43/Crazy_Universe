import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { statusLabel } from '../domain/stateMachine';
import type { TaskStore } from '../store/TaskStore';

export class StatusBarController implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly timers: ReturnType<typeof setTimeout>[] = [];

  constructor(
    private readonly store: TaskStore,
    private readonly log?: (message: string) => void,
  ) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.name = 'Crazy Universe 当前任务';
    this.item.command = COMMANDS.statusBarPick;
    this.item.accessibilityInformation = {
      label: 'Crazy Universe 当前任务',
    };
    this.refresh();
    this.item.show();
    this.log?.('Status Bar 已创建（左侧，靠近源代码管理）');
    for (const wait of [300, 1500, 4000]) {
      this.timers.push(
        setTimeout(() => {
          this.item.show();
        }, wait),
      );
    }
  }

  refresh(): void {
    const current = this.store.getTasks().find((task) => task.status === 'in_progress');
    if (!current) {
      this.item.text = '$(circle-outline) 无当前任务';
      this.item.tooltip = 'Crazy Universe：点击开始或新建任务';
    } else {
      this.item.text = `$(circle-filled) ${truncate(current.title)} · ${statusLabel(current.status)}`;
      this.item.tooltip = [
        current.title,
        statusLabel(current.status),
        current.lastContext?.branch,
        current.lastContext?.projectName,
        '点击暂停 / 标记 / 完成',
      ]
        .filter(Boolean)
        .join('\n');
    }
    this.item.show();
  }

  dispose(): void {
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.item.dispose();
  }
}

function truncate(title: string, max = 16): string {
  return title.length > max ? `${title.slice(0, max - 1)}…` : title;
}
