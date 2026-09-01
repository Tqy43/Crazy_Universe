import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { setTimeout, clearTimeout } from 'node:timers';
import { URL, URLSearchParams } from 'node:url';
import type { ChildProcess } from 'node:child_process';
import { CDP_PORT, WORKLOG_BOARD_URL, WORKLOG_HOST_HINT } from './constants';
import { debuggerUrl, openCdp, type CdpClient } from './cdp';
import { portOpen, resolveChromePath, worklogProfileDir } from './chrome';

export interface CapturedWorklogAuth {
  key: string;
  userId?: string;
  apiUrl?: string;
}

export class CaptureError extends Error {
  constructor(
    message: string,
    readonly kind: 'chrome' | 'timeout' | 'cdp',
  ) {
    super(message);
  }
}

export async function captureWorklogAuth(options: {
  headful: boolean;
  log: (message: string) => void;
  timeoutMs?: number;
}): Promise<CapturedWorklogAuth> {
  const chromePath = resolveChromePath();
  if (!chromePath) {
    throw new CaptureError('Chrome not found', 'chrome');
  }
  const timeoutMs = options.timeoutMs ?? (options.headful ? 180_000 : 45_000);
  let chromeProc: ChildProcess | undefined;
  const alreadyOpen = await portOpen(CDP_PORT);
  if (!alreadyOpen) {
    const flags = [
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${worklogProfileDir()}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-allow-origins=*',
    ];
    if (!options.headful) {
      flags.push('--headless=new', '--window-size=1280,900');
    }
    options.log(options.headful ? 'launching Chrome (login window)' : 'launching Chrome (headless)');
    chromeProc = spawn(chromePath, [...flags, WORKLOG_BOARD_URL], {
      stdio: 'ignore',
      windowsHide: !options.headful,
      detached: false,
    });
  } else {
    options.log('reusing Chrome debug session');
  }

  const stopSpawnedChrome = () => {
    if (!chromeProc) {
      return;
    }
    try {
      chromeProc.kill();
    } catch {
      /* ignore */
    }
  };

  let cdp: CdpClient;
  try {
    cdp = await openCdp(await debuggerUrl(CDP_PORT));
  } catch (error) {
    stopSpawnedChrome();
    throw new CaptureError(error instanceof Error ? error.message : String(error), 'cdp');
  }

  const urlByRequestId = new Map<string, string>();
  const sessionByRequestId = new Map<string, string>();
  const pendingKeys = new Map<string, string>();
  const sessions = new Set<string>();
  let userId: string | undefined;
  let apiUrl: string | undefined;
  let capturedKey: string | undefined;

  const result = await new Promise<CapturedWorklogAuth>((resolve, reject) => {
    let settled = false;
    let userIdWait: ReturnType<typeof setTimeout> | undefined;
    const finish = (auth: CapturedWorklogAuth | undefined, error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      if (userIdWait) {
        clearTimeout(userIdWait);
      }
      const complete = () => {
        cdp.close();
        if (!options.headful || auth) {
          stopSpawnedChrome();
        }
        if (error) {
          reject(error);
          return;
        }
        if (!auth) {
          reject(new CaptureError('timed out waiting for x-worklog-key', 'timeout'));
          return;
        }
        resolve({ ...auth, userId: auth.userId ?? userId, apiUrl: auth.apiUrl ?? apiUrl });
      };
      if (auth && options.headful) {
        void closeBoardPages(cdp).finally(complete);
        return;
      }
      complete();
    };

    const settleAuth = () => {
      if (!capturedKey || !userId) {
        return;
      }
      clearTimeout(timer);
      if (userIdWait) {
        clearTimeout(userIdWait);
      }
      finish({ key: capturedKey, userId, apiUrl });
    };

    const takeUserId = (value: unknown) => {
      const found = typeof value === 'string' ? scanForUserId(value) : findUserId(value);
      if (found && found !== userId) {
        userId = found;
        options.log('captured user_id');
        settleAuth();
      }
    };

    const scrapeUserId = async () => {
      for (const session of sessions) {
        if (settled || userId) {
          return;
        }
        try {
          const evaluated = (await cdp.send(
            'Runtime.evaluate',
            { expression: USER_ID_SCRIPT, returnByValue: true, awaitPromise: true },
            session || undefined,
          )) as { result?: { value?: unknown } };
          takeUserId(evaluated.result?.value);
        } catch {
          /* target gone */
        }
      }
    };

    const waitForUserIdThenFinish = () => {
      if (userIdWait || !capturedKey) {
        return;
      }
      options.log('waiting for user_id');
      void scrapeUserId();
      userIdWait = setTimeout(() => {
        void scrapeUserId().finally(() => {
          if (!settled && capturedKey) {
            clearTimeout(timer);
            finish({ key: capturedKey, userId, apiUrl });
          }
        });
      }, 12_000);
    };

    const timer = setTimeout(() => {
      if (capturedKey) {
        void scrapeUserId().finally(() => {
          if (!settled) {
            finish({ key: capturedKey as string, userId, apiUrl });
          }
        });
        return;
      }
      finish(undefined, new CaptureError('timed out waiting for x-worklog-key', 'timeout'));
    }, timeoutMs);

    const rememberApi = (url: string) => {
      if (!url.includes(WORKLOG_HOST_HINT)) {
        return;
      }
      try {
        const parsed = new URL(url);
        apiUrl = `${parsed.origin}/api/worklogs`;
      } catch {
        /* ignore */
      }
    };

    const inspectWorklogRequest = (rid: string, url: string, sessionId?: string, postData?: string) => {
      if (!url.includes(WORKLOG_HOST_HINT)) {
        takeUserId(queryUserId(url));
        return;
      }
      rememberApi(url);
      takeUserId(queryUserId(url));
      if (postData) {
        takeUserId(postData);
      }
      if (!rid) {
        return;
      }
      void cdp
        .send('Network.getRequestPostData', { requestId: rid }, sessionId)
        .then((body) => takeUserId(String(asRecord(body).postData ?? '')))
        .catch(() => undefined);
    };

    const inspectWorklogResponse = (rid: string, url: string, sessionId?: string) => {
      if (!rid || !url.includes(WORKLOG_HOST_HINT)) {
        return;
      }
      void cdp
        .send('Network.getResponseBody', { requestId: rid }, sessionId)
        .then((body) => {
          const record = asRecord(body);
          const text = String(record.body ?? '');
          takeUserId(record.base64Encoded ? Buffer.from(text, 'base64').toString('utf8') : text);
        })
        .catch(() => undefined);
    };

    const onKey = (key: string, url: string, requestId?: string) => {
      if (!url && requestId) {
        pendingKeys.set(requestId, key);
        return;
      }
      takeUserId(queryUserId(url));
      if (!isValidKeyUrl(url)) {
        options.log(`skipped x-worklog-key (${url.slice(0, 80) || 'no url'})`);
        return;
      }
      rememberApi(url);
      if (capturedKey === key && userId) {
        settleAuth();
        return;
      }
      capturedKey = key;
      options.log(`captured x-worklog-key (${url.slice(0, 80)})`);
      if (userId) {
        settleAuth();
        return;
      }
      waitForUserIdThenFinish();
    };

    const flushPending = (requestId: string, url: string) => {
      const pending = pendingKeys.get(requestId);
      if (pending) {
        pendingKeys.delete(requestId);
        onKey(pending, url, requestId);
      }
    };

    cdp.onEvent((method, params, sessionId) => {
      if (method === 'Target.attachedToTarget') {
        const nextSession = String(params.sessionId ?? sessionId ?? '');
        if (nextSession) {
          sessions.add(nextSession);
        }
        void armSession(cdp, nextSession).then(() => {
          const info = asRecord(params.targetInfo);
          const type = String(info.type ?? '');
          if (type === 'page') {
            void refreshBoard(cdp, nextSession, String(info.url ?? ''));
          }
          if (capturedKey && !userId) {
            void scrapeUserId();
          }
        });
        return;
      }
      if (method === 'Network.requestWillBeSent') {
        const request = asRecord(params.request);
        const rid = String(params.requestId ?? '');
        const url = String(request.url ?? params.documentURL ?? '');
        if (rid && url) {
          urlByRequestId.set(rid, url);
        }
        if (rid && sessionId) {
          sessionByRequestId.set(rid, sessionId);
        }
        inspectWorklogRequest(rid, url, sessionId, String(request.postData ?? ''));
        const key = headerValue(request.headers);
        if (key) {
          onKey(key, url, rid);
        }
        if (rid && url) {
          flushPending(rid, url);
        }
        return;
      }
      if (method === 'Network.requestWillBeSentExtraInfo' || method === 'Network.responseReceivedExtraInfo') {
        const rid = String(params.requestId ?? '');
        const url = urlByRequestId.get(rid) ?? '';
        const key = headerValue(params.headers);
        takeUserId(headerMap(params.headers).cookie ?? headerMap(params.headers).Cookie);
        if (key) {
          onKey(key, url, rid);
        }
        return;
      }
      if (method === 'Network.responseReceived') {
        const rid = String(params.requestId ?? '');
        const response = asRecord(params.response);
        const url = String(response.url ?? urlByRequestId.get(rid) ?? '');
        if (rid && url) {
          urlByRequestId.set(rid, url);
        }
        if (rid && sessionId) {
          sessionByRequestId.set(rid, sessionId);
        }
        return;
      }
      if (method === 'Network.loadingFinished') {
        const rid = String(params.requestId ?? '');
        const url = urlByRequestId.get(rid) ?? '';
        inspectWorklogResponse(rid, url, sessionId || sessionByRequestId.get(rid));
      }
    });

    void (async () => {
      try {
        await cdp.send('Target.setAutoAttach', {
          autoAttach: true,
          waitForDebuggerOnStart: true,
          flatten: true,
        });
        await attachExistingTargets(cdp);
        await openOrReloadBoard(cdp);
        options.log(`opened board, waiting up to ${Math.round(timeoutMs / 1000)}s`);
      } catch (error) {
        clearTimeout(timer);
        finish(undefined, error instanceof Error ? error : new Error(String(error)));
      }
    })();
  });

  return result;
}

async function attachExistingTargets(cdp: CdpClient): Promise<void> {
  try {
    const listed = (await cdp.send('Target.getTargets')) as {
      targetInfos?: Array<{ targetId: string; type: string; url?: string }>;
    };
    for (const info of listed.targetInfos ?? []) {
      if (info.type === 'page' || info.type === 'iframe' || info.type === 'webview') {
        try {
          await cdp.send('Target.attachToTarget', { targetId: info.targetId, flatten: true });
        } catch {
          /* already attached or gone */
        }
      }
    }
  } catch {
    /* older chrome */
  }
}

async function openOrReloadBoard(cdp: CdpClient): Promise<void> {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const board = await findBoardPage(cdp);
    if (board) {
      try {
        await cdp.send('Target.activateTarget', { targetId: board.targetId });
      } catch {
        /* ignore */
      }
      return;
    }
    await delay(250);
  }
  await cdp.send('Target.createTarget', { url: WORKLOG_BOARD_URL });
}

async function findBoardPage(cdp: CdpClient): Promise<{ targetId: string } | undefined> {
  try {
    const listed = (await cdp.send('Target.getTargets')) as {
      targetInfos?: Array<{ targetId: string; type: string; url?: string }>;
    };
    return (listed.targetInfos ?? []).find(
      (info) => info.type === 'page' && isBoardUrl(String(info.url ?? '')),
    );
  } catch {
    return undefined;
  }
}

async function closeBoardPages(cdp: CdpClient): Promise<void> {
  try {
    const listed = (await cdp.send('Target.getTargets')) as {
      targetInfos?: Array<{ targetId: string; type: string; url?: string }>;
    };
    for (const info of listed.targetInfos ?? []) {
      const url = String(info.url ?? '');
      if (info.type === 'page' && (isBoardUrl(url) || url.includes('feishu.cn') || url.includes('larkoffice.com'))) {
        try {
          await cdp.send('Target.closeTarget', { targetId: info.targetId });
        } catch {
          /* already gone */
        }
      }
    }
  } catch {
    /* ignore */
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function armSession(cdp: CdpClient, sessionId: string): Promise<void> {
  try {
    await cdp.send(
      'Target.setAutoAttach',
      { autoAttach: true, waitForDebuggerOnStart: true, flatten: true },
      sessionId,
    );
  } catch {
    /* target may not support it */
  }
  try {
    await cdp.send('Runtime.enable', {}, sessionId);
  } catch {
    /* ignore */
  }
  try {
    await cdp.send('Network.enable', { maxPostDataSize: 1_048_576 }, sessionId);
  } catch {
    /* ignore */
  }
  try {
    await cdp.send('Runtime.runIfWaitingForDebugger', {}, sessionId);
  } catch {
    /* ignore */
  }
}

async function refreshBoard(cdp: CdpClient, sessionId: string, url: string): Promise<void> {
  if (!isBoardUrl(url)) {
    return;
  }
  try {
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Page.reload', { ignoreCache: false }, sessionId);
  } catch {
    /* page domain unavailable */
  }
}

function isBoardUrl(url: string): boolean {
  return url.includes('meegoPlg') || url.includes('MII_686B6DA98EC9C002') || url.includes('/b2rl2h/');
}

function isValidKeyUrl(url: string): boolean {
  if (!url) {
    return false;
  }
  try {
    return !new URL(url).pathname.toLowerCase().includes('/login');
  } catch {
    return !url.toLowerCase().includes('/login');
  }
}

function headerValue(headers: unknown): string | undefined {
  if (!headers) {
    return undefined;
  }
  if (Array.isArray(headers)) {
    for (const item of headers) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const row = item as Record<string, unknown>;
      const name = String(row.name ?? row.key ?? '');
      if (name.toLowerCase() === 'x-worklog-key') {
        const value = row.value ?? row.values;
        if (typeof value === 'string' && value.trim()) {
          return value.trim();
        }
      }
    }
    return undefined;
  }
  if (typeof headers !== 'object') {
    return undefined;
  }
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (key.toLowerCase() !== 'x-worklog-key') {
      continue;
    }
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) {
      return value[0].trim();
    }
  }
  return undefined;
}

function headerMap(headers: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!headers) {
    return result;
  }
  if (Array.isArray(headers)) {
    for (const item of headers) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const row = item as Record<string, unknown>;
      const name = String(row.name ?? row.key ?? '');
      const value = row.value ?? row.values;
      if (name && typeof value === 'string') {
        result[name] = value;
      }
    }
    return result;
  }
  if (typeof headers !== 'object') {
    return result;
  }
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (typeof value === 'string') {
      result[key] = value;
    }
  }
  return result;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function tryJson(text: string): unknown {
  if (!text.trim()) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const USER_ID_KEYS = ['user_id', 'userId', 'user_key', 'userKey'];

function isPlausibleUserId(value: unknown): boolean {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 1e9) {
    return true;
  }
  if (typeof value !== 'string') {
    return false;
  }
  const text = value.trim();
  return /^\d{10,24}$/.test(text) || /^ou_[a-zA-Z0-9]+$/.test(text);
}

function asUserId(value: unknown): string | undefined {
  if (typeof value === 'number' && isPlausibleUserId(value)) {
    return String(value);
  }
  if (typeof value === 'string' && isPlausibleUserId(value)) {
    return value.trim();
  }
  return undefined;
}

function queryUserId(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    for (const key of USER_ID_KEYS) {
      const found = asUserId(parsed.searchParams.get(key));
      if (found) {
        return found;
      }
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function scanForUserId(text: string): string | undefined {
  if (!text.trim()) {
    return undefined;
  }
  const direct = asUserId(text.trim());
  if (direct) {
    return direct;
  }
  const parsed = tryJson(text);
  if (parsed !== undefined) {
    const fromJson = findUserId(parsed, 1);
    if (fromJson) {
      return fromJson;
    }
  }
  const fromQuery = queryUserId(`https://worklog.invalid/?${text}`);
  if (fromQuery) {
    return fromQuery;
  }
  try {
    const params = new URLSearchParams(text.replace(/;\s*/g, '&'));
    for (const key of USER_ID_KEYS) {
      const found = asUserId(params.get(key));
      if (found) {
        return found;
      }
    }
  } catch {
    /* ignore */
  }
  const match = text.match(/"(?:user_id|userId|user_key|userKey)"\s*:\s*"?(\d{10,24}|ou_[a-zA-Z0-9]+)"?/);
  return match?.[1];
}

function findUserId(value: unknown, depth = 0): string | undefined {
  if (value == null || depth > 8) {
    return undefined;
  }
  if (typeof value === 'string') {
    const direct = asUserId(value);
    if (direct) {
      return direct;
    }
    const parsed = tryJson(value);
    return parsed !== undefined && parsed !== value ? findUserId(parsed, depth + 1) : undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findUserId(item, depth + 1);
      if (nested) {
        return nested;
      }
    }
    return undefined;
  }
  if (typeof value !== 'object') {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  for (const key of USER_ID_KEYS) {
    const found = asUserId(record[key]);
    if (found) {
      return found;
    }
  }
  for (const nested of Object.values(record)) {
    const found = findUserId(nested, depth + 1);
    if (found) {
      return found;
    }
  }
  return undefined;
}

const USER_ID_SCRIPT = `(() => {
  const names = ['user_id', 'userId', 'user_key', 'userKey'];
  const pick = (value) => {
    if (typeof value === 'number' && Number.isFinite(value) && value > 1e9) return String(value);
    const text = String(value ?? '').trim();
    if (/^\\d{10,24}$/.test(text) || /^ou_[a-zA-Z0-9]+$/.test(text)) return text;
    return '';
  };
  const walk = (value, depth) => {
    if (value == null || depth > 6) return '';
    if (typeof value === 'string') {
      const direct = pick(value);
      if (direct) return direct;
      try { value = JSON.parse(value); } catch { return ''; }
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = walk(item, depth + 1);
        if (found) return found;
      }
      return '';
    }
    if (typeof value !== 'object') return pick(value);
    for (const key of names) {
      const found = pick(value[key]);
      if (found) return found;
    }
    for (const nested of [value.user, value.data, value.result, value.payload, value.profile, value.info]) {
      const found = walk(nested, depth + 1);
      if (found) return found;
    }
    return '';
  };
  for (const store of [localStorage, sessionStorage]) {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      const raw = store.getItem(key);
      if (names.includes(key || '')) {
        const found = pick(raw);
        if (found) return found;
      }
      const found = walk(raw, 0);
      if (found) return found;
    }
  }
  return walk(window.__INITIAL_STATE__, 0)
    || walk(window.__APP_DATA__, 0)
    || pick(document.cookie.match(/(?:^|;\\s*)(?:user_id|userId)=([^;]+)/)?.[1])
    || '';
})()`;
