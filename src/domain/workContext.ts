import * as vscode from 'vscode';
import type { WorkContext } from '../types';

export function captureLightContext(): WorkContext {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return {
    workspacePath: folder?.uri.fsPath ?? '',
    projectName: folder?.name ?? '',
    recordedAt: new Date().toISOString(),
  };
}
