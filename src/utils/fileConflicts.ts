import type { FileSnapshot } from '../../shared/files';
import type { TabItem } from '../types';

export function defaultCopyName(name: string) {
  // A recovery copy must not become a second compiled Swift/C source by default.
  return `${name}.editor-copy`;
}
export function siblingCopyPath(source: string, name: string) {
  if (!name || name !== name.trim() || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) ||
      /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) throw new Error('Nome della copia non valido');
  const normalized = source.replace(/\\/g, '/');
  const directory = normalized.slice(0, normalized.lastIndexOf('/') + 1);
  const target = directory + name;
  if (target.toLowerCase() === normalized.toLowerCase()) throw new Error('Scegli un nome diverso dal file originale');
  return target;
}
export function reloadUnchanged(tabs: TabItem[], original: TabItem, snapshot: FileSnapshot) {
  return tabs.map(tab => tab.id === original.id && tab.path === original.path && tab.content === original.content
    ? { ...tab, ...snapshot, baseContent: snapshot.content, unresolvedMerge: false, isDirty: false } : tab);
}
