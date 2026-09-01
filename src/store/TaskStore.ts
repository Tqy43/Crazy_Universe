import { Buffer } from 'node:buffer';
import { watch } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { setTimeout, clearTimeout } from 'node:timers';
import * as vscode from 'vscode';
import { t } from '../i18n';
import type { Event, Task } from '../types';
import {
  assertInvariants,
  emptyStore,
  SCHEMA_VERSION,
  type MetaFile,
  type StoreFile,
} from './schema';

export class StoreVersionError extends Error {
  constructor(public readonly foundVersion: number) {
    super(t('error.storeTooNew', { version: foundVersion }));
  }
}

export class TaskStore implements vscode.Disposable {
  private data: StoreFile;
  private mtimeMs = 0;
  private writing = false;
  private watcher: FSWatcher | undefined;
  private reloadTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly didChange = new vscode.EventEmitter<void>();

  readonly onDidChange = this.didChange.event;

  private constructor(
    readonly storageDir: string,
    private readonly tasksPath: string,
    private readonly metaPath: string,
    data: StoreFile,
    mtimeMs: number,
  ) {
    this.data = data;
    this.mtimeMs = mtimeMs;
  }

  static async open(context: vscode.ExtensionContext): Promise<TaskStore> {
    const storageDir = path.join(context.globalStorageUri.fsPath, 'crazy-universe');
    await fs.mkdir(storageDir, { recursive: true });
    const tasksPath = path.join(storageDir, 'tasks.json');
    const metaPath = path.join(storageDir, 'meta.json');
    const { data, mtimeMs } = await readTasksFile(tasksPath);
    const store = new TaskStore(storageDir, tasksPath, metaPath, data, mtimeMs);
    await store.writeMeta();
    store.watch();
    return store;
  }

  getTasks(): Task[] {
    return this.data.tasks;
  }

  getTask(id: string): Task | undefined {
    return this.data.tasks.find((task) => task.id === id);
  }

  getEvents(taskId?: string): Event[] {
    if (!taskId) {
      return this.data.events;
    }
    return this.data.events.filter((event) => event.taskId === taskId);
  }

  async commit(mutate: (draft: StoreFile) => void): Promise<void> {
    await this.reloadIfChanged();
    const draft = structuredClone(this.data);
    mutate(draft);
    assertInvariants(draft);
    await this.atomicWrite(draft);
    this.data = draft;
    this.didChange.fire();
  }

  dispose(): void {
    this.watcher?.close();
    this.watcher = undefined;
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
    }
    this.didChange.dispose();
  }

  private async writeMeta(): Promise<void> {
    const meta: MetaFile = {
      schemaVersion: SCHEMA_VERSION,
      lastOpenedAt: new Date().toISOString(),
    };
    await fs.writeFile(this.metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  }

  private async atomicWrite(data: StoreFile): Promise<void> {
    const tmpPath = `${this.tasksPath}.tmp`;
    this.writing = true;
    try {
      await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
      await fs.rm(this.tasksPath, { force: true });
      await fs.rename(tmpPath, this.tasksPath);
      this.mtimeMs = (await fs.stat(this.tasksPath)).mtimeMs;
    } finally {
      this.writing = false;
    }
  }

  private async reloadIfChanged(): Promise<void> {
    try {
      const stat = await fs.stat(this.tasksPath);
      if (stat.mtimeMs <= this.mtimeMs) {
        return;
      }
      const { data, mtimeMs } = await readTasksFile(this.tasksPath);
      this.data = data;
      this.mtimeMs = mtimeMs;
    } catch (error) {
      if (isNotFound(error)) {
        return;
      }
      throw error;
    }
  }

  private watch(): void {
    this.watcher = watch(this.storageDir, (_event: string, filename: string | Buffer | null) => {
      const name = filename?.toString();
      if (name && name !== 'tasks.json' && name !== 'tasks.json.tmp') {
        return;
      }
      if (this.writing) {
        return;
      }
      if (this.reloadTimer) {
        clearTimeout(this.reloadTimer);
      }
      this.reloadTimer = setTimeout(() => {
        void this.reloadFromDisk();
      }, 120);
    });
  }

  private async reloadFromDisk(): Promise<void> {
    if (this.writing) {
      return;
    }
    try {
      const before = this.mtimeMs;
      await this.reloadIfChanged();
      if (this.mtimeMs !== before) {
        this.didChange.fire();
      }
    } catch {
      // 另一窗口写到一半时忽略，下次再读
    }
  }
}

async function readTasksFile(tasksPath: string): Promise<{ data: StoreFile; mtimeMs: number }> {
  try {
    const raw = await fs.readFile(tasksPath, 'utf8');
    const stat = await fs.stat(tasksPath);
    const parsed: unknown = JSON.parse(raw);
    return { data: parseStoreFile(parsed), mtimeMs: stat.mtimeMs };
  } catch (error) {
    if (isNotFound(error)) {
      return { data: emptyStore(), mtimeMs: 0 };
    }
    throw error;
  }
}

function parseStoreFile(value: unknown): StoreFile {
  if (!value || typeof value !== 'object') {
    throw new Error(t('error.storeRoot'));
  }
  const record = value as Partial<StoreFile>;
  const version = record.schemaVersion ?? SCHEMA_VERSION;
  if (typeof version !== 'number') {
    throw new Error(t('error.storeVersion'));
  }
  if (version > SCHEMA_VERSION) {
    throw new StoreVersionError(version);
  }
  if (!Array.isArray(record.tasks) || !Array.isArray(record.events)) {
    throw new Error(t('error.storeArrays'));
  }
  const data: StoreFile = {
    schemaVersion: SCHEMA_VERSION,
    tasks: record.tasks as Task[],
    events: record.events as Event[],
  };
  assertInvariants(data);
  return data;
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'ENOENT'
  );
}
