import fs from 'node:fs/promises';
import path from 'node:path';

export const MAX_TEXT_BYTES = 2 * 1024 * 1024;
export const ignored = new Set(['.git', '.build', 'DerivedData', 'node_modules', '.openfruit_cache', 'build', 'dist', 'dist-electron']);

// Tree metadata stays small; file contents are loaded only when the user opens one.
export async function scanDirectoryTree(root: string) {
  let visited = 0;
  async function scan(current: string, depth: number, entry?: import('node:fs').Dirent): Promise<any> {
    if (++visited > 50000 || depth > 100) throw new Error('Progetto troppo grande: limita la cartella aperta');
    const stat = entry || await fs.lstat(current);
    if (stat.isSymbolicLink()) return null; // No junction cycles or traversal outside the project.
    const node: any = { id: current, path: current, name: path.basename(current), type: stat.isDirectory() ? 'folder' : 'file' };
    if (stat.isDirectory() && current.toLowerCase().endsWith('.xcodeproj')) {
      node.packageType = 'xcodeproject';
      return node;
    }
    if (!stat.isDirectory()) {
      node.extension = path.extname(current).slice(1);
      return stat.isFile() ? node : null;
    }
    const children = [];
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const child = await scan(path.join(current, entry.name), depth + 1, entry);
      if (child) children.push(child);
    }
    children.sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1);
    node.children = children;
    return node;
  }
  return scan(path.resolve(root), 0);
}

export async function readTextFile(file: string): Promise<string> {
  const handle = await fs.open(file, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_TEXT_BYTES) throw new Error('File non testuale o superiore a 2 MB');
    const buffer = Buffer.alloc(Math.min(stat.size + 1, MAX_TEXT_BYTES + 1));
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const chunk = await handle.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead);
      if (!chunk.bytesRead) break;
      bytesRead += chunk.bytesRead;
    }
    if (bytesRead > MAX_TEXT_BYTES || buffer.subarray(0, bytesRead).includes(0)) throw new Error('File binario o superiore a 2 MB');
    try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer.subarray(0, bytesRead)); }
    catch { throw new Error('Encoding non UTF-8: il file non verrà convertito automaticamente'); }
  } finally { await handle.close(); }
}

export function containedPath(root: string, file: string): string {
  const absolute = path.resolve(root, file);
  const relative = path.relative(path.resolve(root), absolute);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Percorso esterno al progetto o radice del progetto');
  }
  return absolute;
}

export function validateProjectName(name: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('Usa un nome progetto Swift valido: lettere, numeri e underscore');
}
