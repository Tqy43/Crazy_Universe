import { t } from '../i18n';
import { WORKLOG_OBJECT_G, WORKLOG_SPACE_ID } from './constants';

export interface WorklogTaskRef {
  prefix: string;
  workItemId: number;
  workObjectId: string;
}

export interface WorklogSubmitInput {
  workItem: string;
  startedAt: string;
  minutes: number;
  description: string;
}

export function parseWorkItem(raw: string): WorklogTaskRef | undefined {
  const match = stripWorkItemHash(raw).match(/^([a-zA-Z]+)-(\d+)$/);
  if (!match?.[1] || !match[2]) {
    return undefined;
  }
  const prefix = match[1].toLowerCase();
  const workItemId = Number(match[2]);
  if (!Number.isSafeInteger(workItemId) || workItemId <= 0) {
    return undefined;
  }
  const workObjectId =
    prefix === 'g' ? WORKLOG_OBJECT_G : prefix === 'f' ? 'issue' : prefix === 'm' ? 'story' : prefix;
  return { prefix, workItemId, workObjectId };
}

export function stripWorkItemHash(raw: string): string {
  return raw.trim().replace(/^[＃#]+/, '').trim();
}

export function normalizeWorkItem(raw: string): string {
  const parsed = parseWorkItem(raw);
  if (!parsed) {
    return stripWorkItemHash(raw);
  }
  return `#${parsed.prefix}-${parsed.workItemId}`;
}

export function validateWorklogInput(input: WorklogSubmitInput): string | undefined {
  if (!parseWorkItem(input.workItem)) {
    return t('worklog.needWorkItem');
  }
  if (!Number.isFinite(input.minutes) || input.minutes <= 0) {
    return t('worklog.needMinutes');
  }
  if (!input.startedAt || Number.isNaN(Date.parse(input.startedAt))) {
    return t('worklog.needStarted');
  }
  return undefined;
}

export function toApiDateStarted(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toISOString();
}

export function buildWorklogPayload(input: WorklogSubmitInput, userId: string): Record<string, unknown> {
  const task = parseWorkItem(input.workItem);
  if (!task) {
    throw new Error(t('worklog.needWorkItem'));
  }
  const description = input.description.trim();
  return {
    work_item_id: task.workItemId,
    work_object_id: task.workObjectId,
    space_id: WORKLOG_SPACE_ID,
    time_spent: Math.round(input.minutes),
    date_started: toApiDateStarted(input.startedAt),
    work_description: {
      doc: JSON.stringify({
        '0': {
          ops: [{ insert: `${description}\n` }],
          zoneId: '0',
          zoneType: 'Z',
        },
      }),
      doc_html: `<div class="ace-line" data-node="true" dir="auto"><span data-string="true" data-leaf="true">${escapeHtml(description)}</span><span data-string="true" data-enter="true" data-leaf="true"></span></div>`,
      doc_text: description,
      is_empty: description.length === 0,
    },
    user_id: userId,
    work_item_name: description || normalizeWorkItem(input.workItem) || input.workItem.trim(),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
