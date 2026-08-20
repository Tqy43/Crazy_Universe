import path from 'node:path';

export function isFsInside(child: string, parent: string): boolean {
  if (!child || !parent) {
    return false;
  }
  const left = path.resolve(child).replace(/\\/g, '/').toLowerCase();
  const right = path.resolve(parent).replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');
  return left === right || left.startsWith(`${right}/`);
}

export function scopedRelativeFiles(files: string[], root: string): string[] {
  const result: string[] = [];
  if (!root) {
    return result;
  }
  for (const file of files) {
    if (!isFsInside(file, root)) {
      continue;
    }
    const relative = toRelativePath(file, root);
    if (relative && !result.includes(relative)) {
      result.push(relative);
    }
  }
  return result;
}

export function toRelativePath(fsPath: string, workspacePath: string): string {
  if (!fsPath) {
    return '';
  }
  if (!path.isAbsolute(fsPath)) {
    return fsPath.replace(/\\/g, '/');
  }
  if (!workspacePath) {
    return fsPath.replace(/\\/g, '/');
  }
  const rel = path.relative(workspacePath, fsPath);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    return fsPath.replace(/\\/g, '/');
  }
  return rel.replace(/\\/g, '/');
}

export function resolveFsPath(relativeOrAbs: string, workspacePath: string): string {
  if (!relativeOrAbs) {
    return '';
  }
  if (path.isAbsolute(relativeOrAbs)) {
    return relativeOrAbs;
  }
  if (!workspacePath) {
    return relativeOrAbs;
  }
  return path.join(workspacePath, relativeOrAbs);
}

export function projectRootFor(fsPath: string, workspacePath: string, gitRoot?: string): string {
  if (gitRoot) {
    const rel = toRelativePath(fsPath, gitRoot);
    if (rel && !rel.startsWith('..') && rel.replace(/\\/g, '/') !== fsPath.replace(/\\/g, '/')) {
      return gitRoot;
    }
    if (!path.isAbsolute(fsPath)) {
      return gitRoot;
    }
  }
  return workspacePath;
}
