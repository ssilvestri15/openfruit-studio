import fs from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { retrySharingViolation } from './persistence';
import { readTextFile, MAX_TEXT_BYTES } from './workspace';
import type { FileSnapshot, SaveFileResult } from '../shared/files';

export const revision = (content: string) => createHash('sha256').update(content, 'utf8').digest('hex');
export async function readSnapshot(file: string): Promise<FileSnapshot> {
  const content = await readTextFile(file);
  return { content, revision: revision(content) };
}
const saves = new Map<string, Promise<SaveFileResult>>();
export function saveSnapshot(file: string, content: string, expected: string | undefined, authorize = () => {}, atomic = true): Promise<SaveFileResult> {
  if (typeof content !== 'string' || !expected) return Promise.resolve({ success: false, conflict: true, error: 'Riapri il file per verificarne la versione prima di salvarlo' });
  if (Buffer.byteLength(content) > MAX_TEXT_BYTES) return Promise.resolve({ success: false, error: 'Il contenuto supera il limite di 2 MB' });
  let target: string;
  try { target = realpathSync(path.resolve(file)); }
  catch { return Promise.resolve({ success: false, conflict: true, error: 'File spostato o eliminato: le modifiche nell’editor sono state conservate' }); }
  const key = process.platform === 'win32' ? target.toLowerCase() : target;
  const previous = saves.get(key) || Promise.resolve({ success: true });
  const next = previous.catch(() => ({ success: false })).then(async (): Promise<SaveFileResult> => {
    try {
      authorize();
      let current: FileSnapshot;
      try { current = await readSnapshot(target); }
      catch { return { success: false, conflict: true, error: 'Il file non è più leggibile: le modifiche nell’editor sono state conservate' }; }
      if (current.revision !== expected) return { success: false, conflict: true, disk: current, error: 'File modificato sul disco: confronta le versioni prima di salvare' };
      authorize();
      if (atomic) {
        const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`);
        try {
          const mode = (await fs.stat(target)).mode;
          const handle = await fs.open(temporary, 'wx', mode);
          try { await handle.writeFile(content, 'utf8'); await handle.sync(); } finally { await handle.close(); }
          authorize();
          const latest = await readSnapshot(target);
          if (latest.revision !== expected) return { success: false, conflict: true, disk: latest, error: 'File modificato durante il salvataggio: ricarica il progetto' };
          await retrySharingViolation(() => { authorize(); return fs.rename(temporary, target); });
        } finally { await fs.rm(temporary, { force: true }); }
      } else await fs.writeFile(target, content, 'utf8');
      return { success: true, revision: revision(content) };
    } catch (error: any) { return { success: false, error: error.message }; }
  });
  saves.set(key, next);
  next.then(() => { if (saves.get(key) === next) saves.delete(key); });
  return next;
}

export async function drainFileSaves() { await Promise.allSettled([...saves.values()]); }
