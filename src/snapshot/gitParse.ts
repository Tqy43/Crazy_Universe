import type { GitStatusSummary } from '../types';

export const MAX_CHANGED_PATHS = 50;
export const MAX_COMMITS = 30;
export const DISPLAY_COMMITS = 3;

export interface ParsedGitStatus {
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
  changedPaths: string[];
}

export interface ParsedCommit {
  hash: string;
  subject: string;
  authorTime: string;
}

export function parsePorcelainZ(data: string): ParsedGitStatus {
  const tokens = data.split('\0').filter((token) => token.length > 0);
  let stagedCount = 0;
  let unstagedCount = 0;
  let untrackedCount = 0;
  const changedPaths: string[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token || !isStatusRecord(token)) {
      continue;
    }
    const x = token[0];
    const y = token[1];
    let path = token.slice(3);
    if ((x === 'R' || x === 'C' || y === 'R' || y === 'C') && index + 1 < tokens.length) {
      const next = tokens[index + 1];
      if (next && !isStatusRecord(next)) {
        path = next;
        index += 1;
      }
    }
    if (x === '!' && y === '!') {
      continue;
    }
    if (x === '?' && y === '?') {
      untrackedCount += 1;
      pushPath(changedPaths, path);
      continue;
    }
    if (x !== ' ') {
      stagedCount += 1;
    }
    if (y !== ' ' && y !== '?') {
      unstagedCount += 1;
    }
    pushPath(changedPaths, path);
  }

  return { stagedCount, unstagedCount, untrackedCount, changedPaths };
}

export function parseGitLog(stdout: string): ParsedCommit[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .slice(0, MAX_COMMITS)
    .map((line) => {
      const [hash = '', subject = '', authorTime = ''] = line.split('\t');
      return { hash, subject, authorTime };
    })
    .filter((commit) => commit.hash.length > 0);
}

export function formatGitShortText(status: ParsedGitStatus): string {
  const modified = status.stagedCount + status.unstagedCount;
  if (modified === 0 && status.untrackedCount === 0) {
    return '干净';
  }
  const parts: string[] = [];
  if (modified > 0) {
    parts.push(`${modified} 个已改`);
  }
  if (status.untrackedCount > 0) {
    parts.push(`${status.untrackedCount} 个新文件`);
  }
  return parts.join('，');
}

export function formatGitDetailText(status: ParsedGitStatus): string {
  const modified = status.stagedCount + status.unstagedCount;
  if (modified === 0 && status.untrackedCount === 0) {
    return '没有未提交改动';
  }
  const parts: string[] = [];
  if (modified > 0) {
    parts.push(`${modified} 个已改未提交`);
  }
  if (status.untrackedCount > 0) {
    parts.push(`${status.untrackedCount} 个新文件（尚未 git add）`);
  }
  return parts.join('，');
}

export function filterCommitsInPeriod(
  commits: ParsedCommit[],
  sinceIso: string,
  untilIso: string,
): ParsedCommit[] {
  const since = Date.parse(sinceIso);
  const until = Date.parse(untilIso);
  if (Number.isNaN(since) || Number.isNaN(until)) {
    return commits.slice(0, MAX_COMMITS);
  }
  const untilWithSlack = until + 60_000;
  const kept: ParsedCommit[] = [];
  for (const commit of commits) {
    const time = Date.parse(commit.authorTime);
    if (Number.isNaN(time)) {
      kept.push(commit);
    } else if (time >= since && time <= untilWithSlack) {
      kept.push(commit);
    }
    if (kept.length >= MAX_COMMITS) {
      break;
    }
  }
  return kept;
}

export function toGitStatusSummary(
  status: ParsedGitStatus,
  includeChangedPaths: boolean,
): GitStatusSummary {
  const modified = status.stagedCount + status.unstagedCount;
  return {
    available: true,
    dirty: modified + status.untrackedCount > 0,
    stagedCount: status.stagedCount,
    unstagedCount: status.unstagedCount,
    untrackedCount: status.untrackedCount,
    shortText: formatGitShortText(status),
    changedPaths: includeChangedPaths ? status.changedPaths : undefined,
  };
}

export function unavailableGitSummary(): GitStatusSummary {
  return {
    available: false,
    dirty: false,
    stagedCount: 0,
    unstagedCount: 0,
    untrackedCount: 0,
    shortText: '',
  };
}

function isStatusRecord(token: string): boolean {
  return token.length >= 3 && token[2] === ' ' && /[ MADRCU?!]/.test(token[0] ?? '');
}

function pushPath(paths: string[], path: string): void {
  if (path && paths.length < MAX_CHANGED_PATHS && !paths.includes(path)) {
    paths.push(path);
  }
}
