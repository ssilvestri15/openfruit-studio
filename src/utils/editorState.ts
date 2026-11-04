import type { TabItem } from '../types';

export function fileUri(file: string): string {
  if (file.startsWith('file:')) return file;
  const normalized = file.replace(/\\/g, '/');
  if (normalized.startsWith('//')) return 'file:' + normalized.split('/').map(encodeURIComponent).join('/');
  return 'file:///' + normalized.replace(/^\/+/, '').split('/').map((part, i) =>
    i === 0 && /^[A-Za-z]:$/.test(part) ? part : encodeURIComponent(part)).join('/');
}

export function samePath(a: string, b: string): boolean {
  return a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase();
}

export function filePathFromUri(uri: string): string {
  if (!uri.startsWith('file:')) return uri;
  const url = new URL(uri);
  const pathname = decodeURIComponent(url.pathname);
  return url.hostname ? `//${url.hostname}${pathname}` : pathname.replace(/^\/([A-Za-z]:)/, '$1');
}

export function inPath(file: string, directory: string): boolean {
  const f = file.replace(/\\/g, '/').toLowerCase();
  const d = directory.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
  return f === d || f.startsWith(d + '/');
}

export function markSaved(current: TabItem[], snapshots: TabItem[]) {
  const saved = new Map(snapshots.map(tab => [tab.id, tab]));
  return current.map(tab => {
    const snapshot = saved.get(tab.id);
    if (!snapshot || snapshot.path !== tab.path) return tab;
    return { ...tab, baseContent: snapshot.content, unresolvedMerge: snapshot.content === tab.content ? false : tab.unresolvedMerge,
      revision: snapshot.revision ?? tab.revision, isDirty: snapshot.content === tab.content ? false : tab.isDirty };
  });
}

export function expandReplacement(template: string, captures?: string[] | null): string {
  if (!captures) return template;
  return template.replace(/\$(\$|&|[1-9]\d?)/g, (token, key: string) => {
    if (key === '$') return '$';
    if (key === '&') return captures[0];
    const index = Number(key);
    if (index < captures.length) return captures[index] || '';
    const first = Number(key[0]);
    return key.length === 2 && first < captures.length ? (captures[first] || '') + key[1] : token;
  });
}
