export interface FeishuRef {
  text: string;
  href?: string;
}

const URL_RE = /https?:\/\/[^\s<>"']+(?:feishu\.cn|larksuite\.com)[^\s<>"']*/i;
const HASH_RE = /飞书\s*#([^\s#]+)/i;

export function findFeishuRef(...texts: Array<string | undefined>): FeishuRef {
  for (const text of texts) {
    if (!text) {
      continue;
    }
    const url = text.match(URL_RE)?.[0]?.replace(/[),.;]+$/, '');
    if (url) {
      const id =
        url.match(/guid=([\w-]+)/i)?.[1] ??
        url.match(/\/(?:task|workitem)\/(?:[\w-]+\/)?([\w-]+)/i)?.[1] ??
        'link';
      return { text: `#${id}`, href: url };
    }
    const hash = text.match(HASH_RE)?.[1];
    if (hash && hash.toLowerCase() !== 'none') {
      const href = /^https?:\/\//i.test(hash)
        ? hash
        : `https://applink.feishu.cn/client/todo/detail?guid=${encodeURIComponent(hash)}`;
      return { text: `#${hash}`, href };
    }
  }
  return { text: '#none' };
}
