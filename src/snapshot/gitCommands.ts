/** GitReader 只读白名单。code review 时搜 spawn/exec，不得出现 commit/checkout/push 等。 */
export const GIT_TIMEOUT_MS = 2000;

export const GIT_LOG_FORMAT = '%h%x09%s%x09%cI';

export const GIT_READONLY_COMMANDS: ReadonlyArray<readonly string[]> = [
  ['rev-parse', '--show-toplevel'],
  ['rev-parse', '--abbrev-ref', 'HEAD'],
  ['rev-parse', 'HEAD'],
  ['status', '--porcelain=v1', '-z'],
  ['log', '-30', `--format=${GIT_LOG_FORMAT}`],
  ['symbolic-ref', '-q', 'HEAD'],
];

const FORBIDDEN = /\b(commit|checkout|push|pull|reset|merge|rebase|add|stash|clean|tag|fetch|cherry-pick)\b/i;

export function assertReadonlyGitArgs(args: readonly string[]): void {
  if (args.some((arg) => FORBIDDEN.test(arg))) {
    throw new Error('GitReader 拒绝非只读 Git 参数');
  }
  if (isAllowedLog(args)) {
    return;
  }
  const allowed = GIT_READONLY_COMMANDS.some(
    (command) => command.length === args.length && command.every((part, index) => part === args[index]),
  );
  if (!allowed) {
    throw new Error('GitReader 拒绝非白名单命令');
  }
}

function isAllowedLog(args: readonly string[]): boolean {
  if (args[0] !== 'log') {
    return false;
  }
  return args.slice(1).every(
    (arg) =>
      /^-?\d+$/.test(arg) ||
      arg.startsWith('--format=') ||
      arg.startsWith('--since=') ||
      arg.startsWith('--until=') ||
      arg === '-n' ||
      arg.startsWith('-n') ||
      /^[0-9a-fA-F]{4,40}\.\.HEAD$/.test(arg),
  );
}
