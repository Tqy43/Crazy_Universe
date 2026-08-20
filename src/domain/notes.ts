import type { NoteKind } from '../types';

export const NOTE_KINDS: ReadonlyArray<{ id: NoteKind; label: string }> = [
  { id: 'change', label: '修改内容' },
  { id: 'action', label: '关键操作' },
  { id: 'test', label: '测试结果' },
  { id: 'commit', label: '提交信息' },
  { id: 'issue', label: '遇到的问题' },
  { id: 'next', label: '下一步计划' },
  { id: 'other', label: '其他' },
];

export function noteKindLabel(kind?: NoteKind): string {
  return NOTE_KINDS.find((item) => item.id === kind)?.label ?? '其他';
}
