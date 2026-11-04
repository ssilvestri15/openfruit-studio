import fs from 'node:fs';
import path from 'node:path';
import { ignored } from './workspace';

export interface WorkspaceChange { root: string; paths: string[]; rescan: boolean }
export class WorkspaceEvents {
  private owners = new Map<number, { root: string; close: () => void }>();
  start(owner: number, root: string, send: (event: WorkspaceChange) => void) {
    root = path.resolve(root);
    if (this.owners.get(owner)?.root === root) return;
    this.stop(owner);
    const paths = new Set<string>(); let timer: ReturnType<typeof setTimeout> | undefined, rescan = false, closed = false;
    const flush = () => { timer = undefined; if (!closed) send({ root, paths: [...paths], rescan }); paths.clear(); rescan = false; };
    const schedule = () => { if (!timer) timer = setTimeout(flush, 200); };
    const watcher = fs.watch(root, { recursive: true, persistent: false }, (_event, filename) => {
      if (!filename) { rescan = true; schedule(); return; }
      const parts = filename.toString().split(/[\\/]/);
      if (parts[0] === '.git') { if (/^(?:HEAD|index|packed-refs|refs[\\/])/.test(parts.slice(1).join('/'))) { rescan = true; schedule(); } return; }
      if (parts.some(part => ignored.has(part)) || parts.at(-1)?.endsWith('.tmp')) return;
      const file = path.resolve(root, filename.toString()), relative = path.relative(root, file);
      if (relative.startsWith('..') || path.isAbsolute(relative)) return;
      if (paths.size < 256) paths.add(file); else rescan = true;
      schedule();
    });
    watcher.on('error', () => { rescan = true; schedule(); });
    this.owners.set(owner, { root, close: () => { closed = true; clearTimeout(timer); watcher.close(); } });
  }
  stop(owner: number) { this.owners.get(owner)?.close(); this.owners.delete(owner); }
  closeAll() { for (const owner of this.owners.keys()) this.stop(owner); }
}
