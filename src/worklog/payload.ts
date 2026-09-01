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
  const match = raw.trim().replace(/^#/, '').match(/^([a-zA-Z]+)-(\d+)$/);
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
    throw new Error('invalid work item');
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
    work_item_name: description || input.workItem.trim(),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
