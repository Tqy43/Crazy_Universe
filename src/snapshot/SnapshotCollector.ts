import * as vscode from 'vscode';
import path from 'node:path';
import { CONFIG } from '../constants';
import { displayGitShort, t } from '../i18n';
import type { AutoSnapshot, WorkContext } from '../types';
import { GitReader, type GitReadOptions } from './GitReader';
import { unavailableGitSummary } from './gitParse';
import { scopedRelativeFiles } from './paths';

export const MAX_OPEN_FILES = 30;

export class SnapshotCollector {
  constructor(private readonly gitReader: GitReader) {}

  async capture(options: GitReadOptions = {}): Promise<AutoSnapshot> {
    const includeOpenFiles = vscode.workspace.getConfiguration().get<boolean>(
      CONFIG.includeOpenFiles,
      true,
    );
    const includeChangedPaths = vscode.workspace.getConfiguration().get<boolean>(
      CONFIG.includeChangedPaths,
      true,
    );
    const folder = vscode.workspace.workspaceFolders?.[0];
    const workspacePath = folder?.uri.fsPath ?? '';
    const recordedAt = new Date().toISOString();

    const git = await this.gitReader.read(workspacePath, includeChangedPaths, options);
    const projectRoot = git.gitRoot || workspacePath;
    const context: WorkContext = {
      workspacePath,
      projectName: git.gitRoot ? path.basename(git.gitRoot) : (folder?.name ?? ''),
      gitRoot: git.gitRoot,
      headHash: git.headHash,
      branch: git.branch,
      isDetached: git.isDetached,
      recordedAt,
    };

    const open = includeOpenFiles
      ? collectOpenFiles(projectRoot)
      : { openFiles: [] as string[], activeFile: undefined };

    return {
      context,
      openFiles: open.openFiles,
      activeFile: includeOpenFiles ? open.activeFile : undefined,
      gitStatusSummary: git.summary.available ? git.summary : unavailableGitSummary(),
      recentCommits: git.commits,
    };
  }
}

export function collectOpenFiles(projectRoot: string): {
  openFiles: string[];
  activeFile?: string;
} {
  const candidates = openFilePaths();
  const openFiles = scopedRelativeFiles(candidates, projectRoot).slice(0, MAX_OPEN_FILES);
  const active = vscode.window.activeTextEditor?.document;
  const activePath =
    active && isCaptureDocument(active) ? active.uri.fsPath : activeFilePathFromTabs();
  const activeFile =
    activePath && projectRoot
      ? scopedRelativeFiles([activePath], projectRoot)[0]
      : undefined;

  return { openFiles, activeFile };
}

export function snapshotPreviewText(
  snapshot: AutoSnapshot,
  includeOpenFiles: boolean,
): string {
  const bits = [
    snapshot.context.branch,
    snapshot.gitStatusSummary.available
      ? displayGitShort(snapshot.gitStatusSummary.shortText)
      : snapshot.context.workspacePath
        ? t('git.missing')
        : undefined,
    snapshot.recentCommits[0]?.hash,
  ].filter(Boolean);
  let head = t('preview.prefix', { bits: bits.join(' · ') || t('preview.workspace') });
  if (!includeOpenFiles) {
    head += t('preview.filesOff');
  } else if (snapshot.openFiles.length > 0) {
    head += t('preview.openFiles', { count: snapshot.openFiles.length });
  }
  return head;
}

function isCaptureDocument(document: vscode.TextDocument): boolean {
  if (document.uri.scheme !== 'file' || document.isUntitled) {
    return false;
  }
  const pathName = document.uri.path.toLowerCase();
  return !pathName.includes('/output/') && !pathName.includes('/debug/');
}

function openFilePaths(): string[] {
  const fromTabs = tabFilePaths();
  if (fromTabs.length > 0) {
    return fromTabs;
  }
  const fromEditors = vscode.window.visibleTextEditors
    .map((editor) => editor.document)
    .filter(isCaptureDocument)
    .map((document) => document.uri.fsPath);
  if (fromEditors.length > 0) {
    return fromEditors;
  }
  return vscode.workspace.textDocuments.filter(isCaptureDocument).map((document) => document.uri.fsPath);
}

function tabFilePaths(): string[] {
  const files: string[] = [];
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      const uri = fileUriFromTab(tab);
      if (!uri || uri.scheme !== 'file') {
        continue;
      }
      if (!files.includes(uri.fsPath)) {
        files.push(uri.fsPath);
      }
    }
  }
  return files;
}

function activeFilePathFromTabs(): string | undefined {
  const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
  return tab ? fileUriFromTab(tab)?.fsPath : undefined;
}

function fileUriFromTab(tab: vscode.Tab): vscode.Uri | undefined {
  const input = tab.input;
  if (input instanceof vscode.TabInputText) {
    return input.uri;
  }
  if (input instanceof vscode.TabInputTextDiff) {
    return input.modified;
  }
  if (input instanceof vscode.TabInputCustom) {
    return input.uri;
  }
  return undefined;
}
