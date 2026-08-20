import * as vscode from 'vscode';
import { COMMANDS, CONFIG } from '../constants';
import type { NoteKind, Task } from '../types';
import type { TaskService } from '../domain/TaskService';
import { t, webviewUi } from '../i18n';
import { resolveFsPath } from '../snapshot/paths';
import type { SnapshotCollector } from '../snapshot/SnapshotCollector';
import { snapshotPreviewText } from '../snapshot/SnapshotCollector';
import type { TaskStore } from '../store/TaskStore';
import { renderTimelineShell } from '../webview/timeline.html';
import { buildTimelineViewModel, type TimelineFilter } from '../webview/timelineModel';

const NOTE_KIND_IDS: NoteKind[] = ['change', 'action', 'test', 'commit', 'issue', 'next', 'other'];

export class TimelineViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'crazyUniverse.timeline';

  private view?: vscode.WebviewView;
  private selectedTask: Task | undefined;
  private filter: TimelineFilter = 'all';
  private gitHintDismissed = false;
  private pushGeneration = 0;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly store: TaskStore,
    private readonly service: TaskService,
    private readonly collector: SnapshotCollector,
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
    webviewView.webview.html = renderTimelineShell().html;
    webviewView.title = t('view.timeline');
  }

  setSelectedTask(task: Task | undefined): void {
    this.selectedTask = task;
    void this.pushState();
  }

  async pickFilter(): Promise<void> {
    const picked = await vscode.window.showQuickPick(
      [
        { label: t('filter.all'), description: t('filter.allDesc'), filter: 'all' as const },
        { label: t('filter.status'), description: t('filter.statusDesc'), filter: 'status' as const },
        { label: t('filter.notes'), description: t('filter.notesDesc'), filter: 'notes' as const },
      ].map((item) => ({
        ...item,
        picked: item.filter === this.filter,
      })),
      { placeHolder: t('filter.placeholder'), ignoreFocusOut: false },
    );
    if (!picked) {
      return;
    }
    this.filter = picked.filter;
    await this.pushState();
  }

  refresh(): void {
    if (this.view) {
      this.view.title = t('view.timeline');
    }
    if (this.selectedTask) {
      this.selectedTask = this.store.getTask(this.selectedTask.id);
    }
    void this.pushState();
  }

  private async onMessage(message: unknown): Promise<void> {
    if (!message || typeof message !== 'object' || !('type' in message)) {
      return;
    }
    const payload = message as Record<string, unknown>;
    switch (payload.type) {
      case 'ready':
        await this.pushState();
        return;
      case 'setFilter':
        if (payload.filter === 'all' || payload.filter === 'status' || payload.filter === 'notes') {
          this.filter = payload.filter;
          await this.pushState();
        }
        return;
      case 'run':
        await this.runCommand(String(payload.command));
        return;
      case 'toggleNote':
        await this.runCommand('note');
        return;
      case 'addNote':
        await this.addNote(payload.noteKind, payload.body);
        return;
      case 'dismissGitHint':
        this.gitHintDismissed = true;
        await this.pushState();
        return;
      case 'copyPath': {
        const path = this.selectedTask?.lastContext?.workspacePath;
        if (path) {
          await vscode.env.clipboard.writeText(path);
        }
        return;
      }
      case 'openFile':
        await this.openFile(String(payload.path ?? ''), String(payload.workspacePath ?? ''));
        return;
      case 'openUrl': {
        const url = String(payload.url ?? '');
        if (url) {
          await vscode.env.openExternal(vscode.Uri.parse(url));
        }
        return;
      }
      default:
        return;
    }
  }

  private async runCommand(command: string): Promise<void> {
    const map: Record<string, string> = {
      start: COMMANDS.startTask,
      pause: COMMANDS.pauseTask,
      complete: COMMANDS.completeTask,
      resume: COMMANDS.resumeTask,
      note: COMMANDS.addNote,
    };
    const id = map[command];
    if (!id) {
      return;
    }
    const task = this.selectedTask;
    await vscode.commands.executeCommand(id, task ? { kind: 'task', task } : undefined);
  }

  private async openFile(relativeOrAbs: string, workspacePath: string): Promise<void> {
    const root = workspacePath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const fsPath = resolveFsPath(relativeOrAbs, root);
    if (!fsPath) {
      return;
    }
    try {
      const uri = vscode.Uri.file(fsPath);
      await vscode.window.showTextDocument(uri, { preview: true, preserveFocus: false });
    } catch {
      void vscode.window.showWarningMessage(t('warn.openFile', { path: relativeOrAbs }));
    }
  }

  private async addNote(noteKind: unknown, body: unknown): Promise<void> {
    const task = this.selectedTask;
    if (!task) {
      this.postError(t('warn.selectTask'));
      return;
    }
    const kind = NOTE_KIND_IDS.includes(noteKind as NoteKind) ? (noteKind as NoteKind) : 'other';
    try {
      await this.service.addNote(task.id, kind, String(body ?? ''));
      this.selectedTask = this.store.getTask(task.id);
      await this.pushState();
      void this.view?.webview.postMessage({ type: 'noteSaved' });
    } catch (error) {
      this.postError(error instanceof Error ? error.message : String(error));
    }
  }

  private async pushState(): Promise<void> {
    if (!this.view) {
      return;
    }
    const generation = (this.pushGeneration += 1);
    const includeOpenFiles = vscode.workspace
      .getConfiguration()
      .get<boolean>(CONFIG.includeOpenFiles, true);
    const includeChangedPaths = vscode.workspace
      .getConfiguration()
      .get<boolean>(CONFIG.includeChangedPaths, true);
    const snapshot = await this.collector.capture();
    if (generation !== this.pushGeneration || !this.view) {
      return;
    }
    const gitAvailable = snapshot.gitStatusSummary.available;
    const gitHint =
      !gitAvailable && snapshot.context.workspacePath && !this.gitHintDismissed
        ? t('git.hint')
        : '';
    const model = buildTimelineViewModel({
      task: this.selectedTask,
      events: this.selectedTask ? this.store.getEvents(this.selectedTask.id) : [],
      filter: this.filter,
      includeOpenFiles,
      includeChangedPaths,
      snapshotPreview: snapshotPreviewText(snapshot, includeOpenFiles),
      currentWorkspacePath: snapshot.context.workspacePath,
    });
    void this.view.webview.postMessage({
      type: 'state',
      payload: { ...model, gitAvailable, gitHint, ui: webviewUi() },
    });
  }

  private postError(message: string): void {
    void this.view?.webview.postMessage({ type: 'error', message });
  }
}
