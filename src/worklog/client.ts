import { DEFAULT_WORKLOG_API } from './constants';

export interface WorklogPostResult {
  ok: boolean;
  status: number;
  id?: string;
  message: string;
}

export async function postWorklog(options: {
  apiUrl?: string;
  key: string;
  payload: Record<string, unknown>;
}): Promise<WorklogPostResult> {
  const url = options.apiUrl || DEFAULT_WORKLOG_API;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/plain, */*',
      'content-type': 'application/json',
      'x-worklog-key': options.key,
    },
    body: JSON.stringify(options.payload),
  });
  const text = await response.text();
  const json = tryJson(text);
  const id = pickId(json);
  const message = pickMessage(json, text) || response.statusText;
  return {
    ok: response.ok,
    status: response.status,
    id,
    message,
  };
}

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function pickId(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  for (const key of ['id', 'worklog_id', 'workLogId']) {
    const item = record[key];
    if (typeof item === 'string' && item) {
      return item;
    }
    if (typeof item === 'number') {
      return String(item);
    }
  }
  if (record.data && typeof record.data === 'object') {
    return pickId(record.data);
  }
  return undefined;
}

function pickMessage(value: unknown, fallback: string): string {
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['message', 'msg', 'error']) {
      const item = record[key];
      if (typeof item === 'string' && item.trim()) {
        return item.trim();
      }
    }
  }
  return fallback.trim();
}
