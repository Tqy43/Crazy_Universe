import type { NoteKind } from '../types';
import { t, type MessageKey } from '../i18n';

export const NOTE_KIND_IDS: readonly NoteKind[] = [
  'change',
  'action',
  'test',
  'commit',
  'issue',
  'next',
  'other',
];

const NOTE_KEYS: Record<NoteKind, MessageKey> = {
  change: 'note.change',
  action: 'note.action',
  test: 'note.test',
  commit: 'note.commit',
  issue: 'note.issue',
  next: 'note.next',
  other: 'note.other',
};

export function noteKinds(): ReadonlyArray<{ id: NoteKind; label: string }> {
  return NOTE_KIND_IDS.map((id) => ({ id, label: t(NOTE_KEYS[id]) }));
}

export function noteKindLabel(kind?: NoteKind): string {
  return t(kind ? NOTE_KEYS[kind] : 'note.other');
}
