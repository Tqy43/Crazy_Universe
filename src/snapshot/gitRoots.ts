import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const SKIP_DIR = new Set([
  '.git',
  'node_modules',
  'dist',
  'out',
  '.venv',
  'vendor',
  '.next',
  '.cursor',
]);

export function discoverGitRoots(workspacePath: string, extraPaths: string[] = []): string[] {
  const found: string[] = [];
  for (const seed of extraPaths) {
    if (!seed) {
      continue;
    }
    const walked = walkUpToGit(seed, workspacePath);
    if (walked) {
      pushUnique(found, walked);
    }
  }
  if (workspacePath) {
    for (const nested of nestedGitRoots(workspacePath, 2)) {
      pushUnique(found, nested);
    }
  }
  return found;
}

export function walkUpToGit(start: string, stopAt?: string): string | undefined {
  let current = start;
  for (let depth = 0; depth < 12; depth += 1) {
    if (stopAt && !isInside(current, stopAt)) {
      break;
    }
    if (hasGit(current)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return undefined;
}

function nestedGitRoots(root: string, maxDepth: number): string[] {
  const result: string[] = [];
  if (hasGit(root)) {
    result.push(root);
  }
  walkChildren(root, maxDepth, result);
  return result;
}

function walkChildren(dir: string, remaining: number, result: string[]): void {
  if (remaining <= 0) {
    return;
  }
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIR.has(name)) {
      continue;
    }
    const full = path.join(dir, name);
    let isDirectory = false;
    try {
      isDirectory = statSync(full).isDirectory();
    } catch {
      continue;
    }
    if (!isDirectory) {
      continue;
    }
    if (hasGit(full)) {
      result.push(full);
      continue;
    }
    walkChildren(full, remaining - 1, result);
  }
}

function hasGit(dir: string): boolean {
  try {
    return existsSync(path.join(dir, '.git'));
  } catch {
    return false;
  }
}

function isInside(child: string, parent: string): boolean {
  const left = child.replace(/\\/g, '/').toLowerCase();
  const right = parent.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');
  return left === right || left.startsWith(`${right}/`);
}

function pushUnique(paths: string[], value: string): void {
  const normalized = value.replace(/\\/g, '/').replace(/\/+$/, '');
  if (
    normalized &&
    !paths.some((item) => item.replace(/\\/g, '/').replace(/\/+$/, '') === normalized)
  ) {
    paths.push(value);
  }
}
