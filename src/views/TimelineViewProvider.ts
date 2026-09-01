import * as vscode from 'vscode';
import { COMMANDS, CONFIG, CONTEXT } from '../constants';
import type { NoteKind, Task } from '../types';
import type { TaskService } from '../domain/TaskService';
import { t, webviewUi } from '../i18n';
import { resolveFsPath } from '../snapshot/paths';
import type { SnapshotCollector } from '../snapshot/SnapshotCollector';
import { snapshotPreviewText } from '../snapshot/SnapshotCollector';
import type { TaskStore } from '../store/TaskStore';
import { renderTimelineShell } from '../webview/timeline.html';
import { buildTimelineViewModel, type TimelineFilter } from '../webview/timelineModel';
import { buildWorkSegments } from '../domain/workSegments';
import type { WorklogService } from '../worklog/WorklogService';
import { normalizeWorkItem, validateWorklogInput } from '../worklog/payload';

const NOTE_KIND_IDS: NoteKind[] = ['change', 'action', 'test', 'commit', 'issue', 'next', 'other'];

export class TimelineViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'crazyUniverse.timeline';

  private view?: vscode.WebviewView;
  private selectedTask: Task | undefined;
  private filter: TimelineFilter = 'all';
  private feedView: 'events' | 'segments' = 'events';
  private gitHintDismissed = false;
  private pushGeneration = 0;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly store: TaskStore,
    private readonly service: TaskService,
    private readonly collector: SnapshotCollector,
    private readonly worklog: WorklogService,
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
    if (!task) {
      this.feedView = 'events';
    }
    this.syncFeedContext(task ? this.feedView : 'none');
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
    this.syncFeedContext(this.selectedTask ? this.feedView : 'none');
    void this.pushState();
  }

  private async onMessage(message: unknown): Promise<void> {
    if (!message || typeof message !== 'object' || !('type' in message)) {
      return;
    }
    const payload = message as Record<string, unknown>;
    switch (payload.type) {
      case 'ready':
        this.syncFeedContext(this.selectedTask ? this.feedView : 'none');
        await this.pushState();
        return;
      case 'feedView':
        if (payload.view === 'events' || payload.view === 'segments' || payload.view === 'none') {
          this.feedView = payload.view === 'segments' ? 'segments' : 'events';
          this.syncFeedContext(payload.view === 'none' ? 'none' : this.feedView);
        }
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
      case 'worklogConfirm':
        await this.confirmWorklogDraft(payload);
        return;
      case 'worklogLogin':
        await this.loginWorklogFromPanel();
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
      worklogMode: this.worklogMode(),
    });
    void this.view.webview.postMessage({
      type: 'state',
      payload: { ...model, gitAvailable, gitHint, ui: webviewUi() },
    });
  }

  private worklogMode(): boolean {
    const config = vscode.workspace.getConfiguration();
    return (
      config.get<boolean>(CONFIG.worklogEnabled, false) === true &&
      config.get<boolean>(CONFIG.worklogRunning, true) === true
    );
  }

  private syncFeedContext(feed: 'events' | 'segments' | 'none'): void {
    void vscode.commands.executeCommand('setContext', CONTEXT.timelineFeed, feed);
  }

  private async loginWorklogFromPanel(): Promise<void> {
    try {
      await this.worklog.login();
      void vscode.window.showInformationMessage(t('worklog.loginResubmit'));
      void this.view?.webview.postMessage({ type: 'worklogLoginResult', ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void this.view?.webview.postMessage({ type: 'worklogLoginResult', ok: false, message });
    }
  }

  private async confirmWorklogDraft(payload: Record<string, unknown>): Promise<void> {
    const days = this.parseWorklogDays(payload);
    if (!days.length) {
      void this.view?.webview.postMessage({
        type: 'worklogResult',
        ok: false,
        message: t('worklog.needSelect'),
        submittedSegmentIds: [],
        submittedDayKeys: [],
      });
      return;
    }

    const task = this.selectedTask;
    for (const day of days) {
      const invalid = validateWorklogInput(day);
      if (invalid) {
        void this.view?.webview.postMessage({
          type: 'worklogResult',
          ok: false,
          message: invalid,
          failedDayKey: day.dayKey,
          submittedSegmentIds: [],
          submittedDayKeys: [],
        });
        return;
      }
    }

    const submittedDayKeys: string[] = [];
    const submittedSegmentIds: string[] = [];
    let failedDayKey = '';
    let failedDayLabel = '';
    let failedMessage = '';

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: t('worklog.submitting') },
      async () => {
        for (let index = 0; index < days.length; index += 1) {
          const day = days[index];
          try {
            const worklogId = await this.worklog.submit({
              workItem: day.workItem,
              startedAt: day.startedAt,
              minutes: day.minutes,
              description: day.description,
            });
            submittedDayKeys.push(day.dayKey);
            const remainingIds = new Set(days.slice(index + 1).flatMap((item) => item.segmentIds));
            const markIds = day.segmentIds.filter((id) => !remainingIds.has(id));
            if (task && markIds.length) {
              await this.markSegmentsSubmitted(task.id, markIds, worklogId);
              submittedSegmentIds.push(...markIds);
            }
          } catch (error) {
            failedDayKey = day.dayKey;
            failedDayLabel = day.dayLabel;
            failedMessage = error instanceof Error ? error.message : String(error);
            return;
          }
        }
      },
    );

    if (task && submittedSegmentIds.length) {
      this.selectedTask = this.store.getTask(task.id);
      await this.pushState();
    }

    if (!failedMessage) {
      void this.view?.webview.postMessage({
        type: 'worklogResult',
        ok: true,
        submittedSegmentIds,
        submittedDayKeys,
      });
      void vscode.window.showInformationMessage(
        days.length > 1 ? t('worklog.successMulti', { count: days.length }) : t('worklog.success'),
      );
      return;
    }

    const message =
      submittedDayKeys.length > 0
        ? t('worklog.partialFail', {
            done: submittedDayKeys.length,
            date: failedDayLabel || failedDayKey,
            message: failedMessage,
          })
        : failedMessage;
    void this.view?.webview.postMessage({
      type: 'worklogResult',
      ok: false,
      message,
      failedDayKey,
      submittedSegmentIds,
      submittedDayKeys,
    });
  }

  private parseWorklogDays(payload: Record<string, unknown>): Array<{
    workItem: string;
    startedAt: string;
    minutes: number;
    description: string;
    segmentIds: string[];
    dayKey: string;
    dayLabel: string;
  }> {
    const raw = Array.isArray(payload.days) ? payload.days : [];
    return raw.map((item) => {
      const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      return {
        workItem: normalizeWorkItem(String(row.workItem ?? '')),
        startedAt: String(row.startedAt ?? '').trim(),
        minutes: Number.isFinite(Number(row.minutes)) ? Math.round(Number(row.minutes)) : 0,
        description: String(row.description ?? ''),
        segmentIds: Array.isArray(row.segmentIds) ? row.segmentIds.map((id) => String(id)) : [],
        dayKey: String(row.dayKey ?? ''),
        dayLabel: String(row.dayLabel ?? ''),
      };
    });
  }

  private async markSegmentsSubmitted(taskId: string, segmentIds: string[], worklogId: string): Promise<void> {
    const ends = new Set(
      buildWorkSegments(this.store.getEvents(taskId))
        .filter((segment) => segmentIds.includes(segment.id))
        .map((segment) => segment.endEventId)
        .filter((id): id is string => Boolean(id)),
    );
    if (ends.size === 0) {
      return;
    }
    await this.store.commit((draft) => {
      for (const event of draft.events) {
        if (ends.has(event.id)) {
          event.worklogId = worklogId;
        }
      }
    });
  }

  private postError(message: string): void {
    void this.view?.webview.postMessage({ type: 'error', message });
  }
}
