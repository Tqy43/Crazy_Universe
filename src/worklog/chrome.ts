import { existsSync } from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';

export function worklogProfileDir(): string {
  const roaming = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(roaming, 'CrazyUniverse', 'worklog-chrome');
}

export function resolveChromePath(): string | undefined {
  const extra = process.env.CHROME_PATH?.trim();
  const candidates = [
    extra,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ];
  return candidates.find((item) => item && existsSync(item));
}

export function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    const done = (open: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    setTimeout(() => done(false), 400);
  });
}
