import { spawn } from 'node:child_process';
import path from 'node:path';
import * as vscode from 'vscode';
import type { GitStatusSummary } from '../types';
import { assertReadonlyGitArgs, GIT_LOG_FORMAT, GIT_TIMEOUT_MS } from './gitCommands';
import {
  parseGitLog,
  parsePorcelainZ,
  toGitStatusSummary,
  unavailableGitSummary,
  type ParsedCommit,
} from './gitParse';
import { discoverGitRoots } from './gitRoots';

export interface GitReadOptions {
  since?: string;
  afterHash?: string;
  startGitRoot?: string;
}

export interface GitReadResult {
  gitRoot?: string;
  headHash?: string;
  branch?: string;
  isDetached?: boolean;
  summary: GitStatusSummary;
  commits: ParsedCommit[];
}

export class GitReader {
  constructor(private readonly log?: (message: string) => void) {}

  async read(
    workspacePath: string,
    includeChangedPaths: boolean,
    options: GitReadOptions = {},
  ): Promise<GitReadResult> {
    if (!workspacePath) {
      return { summary: unavailableGitSummary(), commits: [] };
    }

    let gitPath = 'git';
    let apiResult: GitReadResult | undefined;
    let apiRoots: string[] = [];
    try {
      const api = await this.gitApi();
      if (api?.git?.path) {
        gitPath = api.git.path;
      }
      apiResult = await this.readFromApi(api, workspacePath, includeChangedPaths);
      apiRoots = (api?.repositories ?? [])
        .map((repo) => repo.rootUri.fsPath)
        .filter(
          (root) => isPathInside(root, workspacePath) || isPathInside(workspacePath, root),
        );
    } catch (error) {
      this.log?.(`Git API 降级：${errorMessage(error)}`);
    }

    const searchDirs = extraSearchPaths();
    const cliRoots = discoverGitRoots(apiResult?.gitRoot || workspacePath, searchDirs);
    const roots = uniquePaths([...apiRoots, ...cliRoots]);
    const currentRoot =
      pickPrimaryRoot(roots, searchDirs) || apiResult?.gitRoot || roots[0];
    const startedRoot = options.startGitRoot;
    const commitRoot =
      (startedRoot &&
        roots.find(
          (root) =>
            root.replace(/\\/g, '/').toLowerCase() === startedRoot.replace(/\\/g, '/').toLowerCase(),
        )) ||
      currentRoot;
    this.log?.(
      `Git 仓库：${currentRoot || '未找到'}（候选 ${roots.join(' | ') || '-'}）；git=${gitPath}；since=${options.since ?? '-'} after=${options.afterHash ?? '-'}`,
    );

    let cliStatus: GitReadResult | undefined;
    if (currentRoot) {
      try {
        cliStatus = await this.readStatusFromCli(gitPath, currentRoot, includeChangedPaths);
      } catch (error) {
        this.log?.(`Git CLI 状态失败：${errorMessage(error)}`);
      }
    }

    const commits = await this.readPeriodCommits(gitPath, commitRoot ? [commitRoot] : [], options);
    this.log?.(`本任务期间提交 ${commits.length} 条（${commitRoot || '-'}）`);

    const base = cliStatus?.summary.available ? cliStatus : apiResult;
    if (!base?.summary.available) {
      try {
        return {
          ...(await this.readFromCli(gitPath, currentRoot || workspacePath, includeChangedPaths, options)),
          gitRoot: currentRoot,
          commits,
        };
      } catch (error) {
        this.log?.(`Git CLI 不可用：${errorMessage(error)}`);
        return { summary: unavailableGitSummary(), gitRoot: currentRoot, commits };
      }
    }

    return {
      ...base,
      gitRoot: currentRoot || base.gitRoot,
      commits,
    };
  }

  private async gitApi(): Promise<GitApi | undefined> {
    const extension = vscode.extensions.getExtension('vscode.git');
    if (!extension) {
      return undefined;
    }
    const exports = await Promise.race([
      extension.activate(),
      delay(GIT_TIMEOUT_MS).then(() => undefined),
    ]);
    return (exports as { getAPI?(version: number): GitApi | undefined } | undefined)?.getAPI?.(1);
  }

  private async readFromApi(
    api: GitApi | undefined,
    workspacePath: string,
    includeChangedPaths: boolean,
  ): Promise<GitReadResult | undefined> {
    if (!api) {
      return undefined;
    }
    const folderUri = vscode.Uri.file(workspacePath);
    const repo = this.pickRepository(api, folderUri);
    if (!repo) {
      return undefined;
    }

    const head = repo.state.HEAD;
    const isDetached = Boolean(head?.commit) && !head?.name;
    const branch = isDetached ? head?.commit?.slice(0, 7) : head?.name;
    const stagedCount = (repo.state.indexChanges ?? []).length;
    let unstagedCount = 0;
    let untrackedCount = 0;
    const changedPaths: string[] = [];
    for (const change of repo.state.workingTreeChanges ?? []) {
      if (change.status === GitStatus.UNTRACKED) {
        untrackedCount += 1;
      } else if (change.status !== GitStatus.IGNORED) {
        unstagedCount += 1;
      }
      pushUnique(changedPaths, vscode.workspace.asRelativePath(change.uri, false));
    }
    for (const change of [...(repo.state.indexChanges ?? []), ...(repo.state.mergeChanges ?? [])]) {
      pushUnique(changedPaths, vscode.workspace.asRelativePath(change.uri, false));
    }

    return {
      gitRoot: repo.rootUri.fsPath,
      headHash: head?.commit,
      branch,
      isDetached,
      summary: toGitStatusSummary(
        {
          stagedCount,
          unstagedCount,
          untrackedCount,
          changedPaths: changedPaths.slice(0, 50),
        },
        includeChangedPaths,
      ),
      commits: [],
    };
  }

  private pickRepository(api: GitApi, folderUri: vscode.Uri): GitRepository | undefined {
    const direct = api.getRepository?.(folderUri);
    if (direct) {
      return direct;
    }
    const active = vscode.window.activeTextEditor?.document.uri;
    if (active?.scheme === 'file') {
      const byActive = api.getRepository?.(active);
      if (byActive) {
        return byActive;
      }
      const nested = api.repositories.find((item) => isPathInside(active.fsPath, item.rootUri.fsPath));
      if (nested) {
        return nested;
      }
    }
    return (
      api.repositories.find((item) => isPathInside(item.rootUri.fsPath, folderUri.fsPath)) ??
      api.repositories.find((item) => isPathInside(folderUri.fsPath, item.rootUri.fsPath))
    );
  }

  private async readPeriodCommits(
    gitPath: string,
    roots: string[],
    options: GitReadOptions,
  ): Promise<ParsedCommit[]> {
    if (roots.length === 0) {
      return [];
    }
    const collected: ParsedCommit[] = [];
    for (const root of roots) {
      const args = logArgsFor(root, options);
      if (!args) {
        continue;
      }
      try {
        const log = await runGit(gitPath, root, args);
        if (log.code !== 0) {
          this.log?.(`git log 失败（${path.basename(root)}）：${log.stderr.trim() || log.code}`);
          const fallback = options.since
            ? await runGit(gitPath, root, [
                'log',
                '-30',
                `--since=${toGitSince(options.since)}`,
                `--format=${GIT_LOG_FORMAT}`,
              ])
            : undefined;
          if (!fallback || fallback.code !== 0) {
            continue;
          }
          for (const commit of parseGitLog(fallback.stdout)) {
            if (!collected.some((item) => item.hash === commit.hash)) {
              collected.push(commit);
            }
          }
          continue;
        }
        for (const commit of parseGitLog(log.stdout)) {
          if (!collected.some((item) => item.hash === commit.hash)) {
            collected.push(commit);
          }
        }
      } catch (error) {
        this.log?.(`git log 异常（${path.basename(root)}）：${errorMessage(error)}`);
      }
    }
    return collected;
  }

  private async readStatusFromCli(
    gitPath: string,
    gitRoot: string,
    includeChangedPaths: boolean,
  ): Promise<GitReadResult> {
    return this.readFromCli(gitPath, gitRoot, includeChangedPaths, {});
  }

  private async readFromCli(
    gitPath: string,
    workspacePath: string,
    includeChangedPaths: boolean,
    options: GitReadOptions,
  ): Promise<GitReadResult> {
    const seed =
      extraSearchPaths()[0] ||
      workspacePath;
    const top = await runGit(gitPath, seed, ['rev-parse', '--show-toplevel']);
    if (top.code !== 0) {
      this.log?.('未检测到 Git 仓库');
      return { summary: unavailableGitSummary(), commits: [] };
    }
    const gitRoot = top.stdout.trim();
    const [abbrev, symbolic, status, head] = await Promise.all([
      runGit(gitPath, gitRoot, ['rev-parse', '--abbrev-ref', 'HEAD']),
      runGit(gitPath, gitRoot, ['symbolic-ref', '-q', 'HEAD']),
      runGit(gitPath, gitRoot, ['status', '--porcelain=v1', '-z']),
      runGit(gitPath, gitRoot, ['rev-parse', 'HEAD']),
    ]);
    const isDetached = symbolic.code !== 0 || abbrev.stdout.trim() === 'HEAD';
    const parsed = parsePorcelainZ(status.stdout);
    return {
      gitRoot,
      headHash: head.code === 0 ? head.stdout.trim() : undefined,
      branch: abbrev.stdout.trim() || undefined,
      isDetached,
      summary: toGitStatusSummary(parsed, includeChangedPaths),
      commits: await this.readPeriodCommits(gitPath, [gitRoot], options),
    };
  }
}

interface GitApi {
  git?: { path?: string };
  repositories: GitRepository[];
  getRepository?(uri: vscode.Uri): GitRepository | null;
}

interface GitRepository {
  rootUri: vscode.Uri;
  state: {
    HEAD?: { name?: string; commit?: string };
    indexChanges?: GitChange[];
    workingTreeChanges?: GitChange[];
    mergeChanges?: GitChange[];
  };
}

interface GitChange {
  uri: vscode.Uri;
  status: number;
}

const GitStatus = {
  UNTRACKED: 7,
  IGNORED: 8,
} as const;

function logArgsFor(root: string, options: GitReadOptions): string[] | undefined {
  const format = `--format=${GIT_LOG_FORMAT}`;
  const sameRoot =
    !options.startGitRoot ||
    options.startGitRoot.replace(/\\/g, '/').toLowerCase() === root.replace(/\\/g, '/').toLowerCase();
  if (options.afterHash && sameRoot) {
    return ['log', '-30', `${options.afterHash}..HEAD`, format];
  }
  if (options.since) {
    return ['log', '-30', `--since=${toGitSince(options.since)}`, format];
  }
  return undefined;
}

function toGitSince(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    return iso;
  }
  return new Date(ms - 2_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function extraSearchPaths(): string[] {
  const dirs: string[] = [];
  const active = vscode.window.activeTextEditor?.document;
  if (active?.uri.scheme === 'file') {
    dirs.push(path.dirname(active.uri.fsPath));
  }
  for (const group of vscode.window.tabGroups.all) {
    const activeUri = group.activeTab ? fileUriFromTab(group.activeTab) : undefined;
    if (activeUri?.scheme === 'file') {
      dirs.push(path.dirname(activeUri.fsPath));
    }
    for (const tab of group.tabs) {
      const uri = fileUriFromTab(tab);
      if (uri?.scheme === 'file') {
        dirs.push(path.dirname(uri.fsPath));
      }
    }
  }
  return uniquePaths(dirs);
}

function fileUriFromTab(tab: vscode.Tab): vscode.Uri | undefined {
  const input = tab.input;
  if (input instanceof vscode.TabInputText) {
    return input.uri;
  }
  if (input instanceof vscode.TabInputTextDiff) {
    return input.modified;
  }
  return undefined;
}

function pickPrimaryRoot(roots: string[], searchDirs: string[]): string | undefined {
  for (const dir of searchDirs) {
    const containing = roots.find((root) => isPathInside(dir, root));
    if (containing) {
      return containing;
    }
  }
  return roots[0];
}

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of paths) {
    const key = item.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }
  return result;
}

function isPathInside(child: string, parent: string): boolean {
  const left = child.replace(/\\/g, '/').toLowerCase();
  const right = parent.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');
  return left === right || left.startsWith(`${right}/`);
}

function pushUnique(paths: string[], value: string): void {
  if (value && !paths.includes(value)) {
    paths.push(value);
  }
}

function runGit(
  gitPath: string,
  cwd: string,
  args: readonly string[],
): Promise<{ stdout: string; stderr: string; code: number }> {
  assertReadonlyGitArgs(args);
  return new Promise((resolve, reject) => {
    const child = spawn(gitPath, args.slice(), {
      cwd,
      windowsHide: true,
      timeout: GIT_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_OPTIONAL_LOCKS: '0',
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      reject(error);
    });
    child.on('close', (code) => {
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
