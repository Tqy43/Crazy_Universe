export interface FeishuRef {
  text: string;
  href?: string;
}

/** 帆软飞书项目空间。跳转规则对齐油猴脚本：m→story、f→issue、g→assignment。 */
export const FEISHU_PROJECT_HOST = 'https://project.feishu.cn/b2rl2h';

export const FEISHU_PREFIX_API: Record<string, string> = {
  m: 'story',
  f: 'issue',
  g: 'assignment',
};

export const DEFAULT_FEISHU_STORY_BASE = `${FEISHU_PROJECT_HOST}/story/detail`;

const URL_RE = /https?:\/\/[^\s<>"']+(?:feishu\.cn|larksuite\.com)[^\s<>"']*/i;
const HASH_RE = /飞书\s*#([^\s#]+)/i;
/** `m-6987718013` / `#g-1234567890`：前缀 + 10 位数字 */
const TAGGED_ID_RE = /#?([a-zA-Z][a-zA-Z0-9]*)-(\d{10})\b/g;
const LONG_ID_RE = /#(\d{8,})\b/g;
const PATH_PREFIX: Record<string, string> = {
  story: 'm',
  issue: 'f',
  assignment: 'g',
};

export function feishuWorkItemHref(prefix: string, id: string): string {
  const api = FEISHU_PREFIX_API[prefix.toLowerCase()] ?? prefix.toLowerCase();
  return `${FEISHU_PROJECT_HOST}/${api}/detail/${encodeURIComponent(id)}`;
}

function lastCapture(text: string, re: RegExp): string | undefined {
  re.lastIndex = 0;
  let last: string | undefined;
  for (const match of text.matchAll(re)) {
    last = match[1];
  }
  return last;
}

function lastTagged(text: string): FeishuRef | undefined {
  TAGGED_ID_RE.lastIndex = 0;
  let last: FeishuRef | undefined;
  for (const match of text.matchAll(TAGGED_ID_RE)) {
    const prefix = match[1];
    const id = match[2];
    if (!prefix || !id) {
      continue;
    }
    last = {
      text: `#${prefix}-${id}`,
      href: feishuWorkItemHref(prefix, id),
    };
  }
  return last;
}

function fromBareId(id: string): FeishuRef {
  return { text: `#${id}`, href: feishuWorkItemHref('m', id) };
}

export function findFeishuRef(...texts: Array<string | undefined>): FeishuRef {
  for (const text of texts) {
    if (!text) {
      continue;
    }
    const url = text.match(URL_RE)?.[0]?.replace(/[),.;]+$/, '');
    if (url) {
      const path = url.match(/\/(story|issue|assignment|task|workitem)\/detail\/(\d{6,})/i);
      if (path?.[1] && path[2]) {
        const letter = PATH_PREFIX[path[1].toLowerCase()] ?? 'm';
        return { text: `#${letter}-${path[2]}`, href: url };
      }
      const guid = url.match(/guid=([\w-]+)/i)?.[1];
      if (guid) {
        const tagged = lastTagged(`#${guid}`);
        if (tagged) {
          return tagged;
        }
        return { text: `#${guid}`, href: url };
      }
      return { text: '#link', href: url };
    }
    const tagged = lastTagged(text);
    if (tagged) {
      return tagged;
    }
    const hash = text.match(HASH_RE)?.[1];
    if (hash && hash.toLowerCase() !== 'none') {
      if (/^https?:\/\//i.test(hash)) {
        return findFeishuRef(hash);
      }
      const fromHash = lastTagged(hash.startsWith('#') ? hash : `#${hash}`);
      if (fromHash) {
        return fromHash;
      }
      if (/^\d{6,}$/.test(hash)) {
        return fromBareId(hash);
      }
    }
  }
  return { text: '#none' };
}

/** 提交说明：前缀+10 位数字（m/f/g），否则回退长数字编号（按需求页）。 */
export function findCommitFeishuRef(subject: string | undefined): FeishuRef {
  const fromText = findFeishuRef(subject);
  if (fromText.text !== '#none') {
    return fromText;
  }
  if (!subject) {
    return { text: '#none' };
  }
  const last = lastCapture(subject, LONG_ID_RE);
  if (!last) {
    return { text: '#none' };
  }
  return fromBareId(last);
}
