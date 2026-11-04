import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// Serialize writes to the same destination, so a slower old write cannot win.
const writes = new Map<string, Promise<void>>();
export async function retrySharingViolation(operation: () => Promise<void>) {
  for (let attempt = 0; ; attempt++) {
    try { await operation(); return; }
    catch (error: any) {
      if (process.platform !== 'win32' || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt >= 5) throw error;
      await new Promise(resolve => setTimeout(resolve, 10 * 2 ** attempt));
    }
  }
}
export function writeJsonAtomic(file: string, value: unknown, backup = false): Promise<void> {
  const target = path.resolve(file);
  const body = JSON.stringify(value, null, 2);
  const previous = writes.get(target) || Promise.resolve();
  const pending = previous.catch(() => {}).then(async () => {
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`);
    try {
      const handle = await fs.open(temporary, 'wx', 0o600);
      try { await handle.writeFile(body, 'utf8'); await handle.sync(); } finally { await handle.close(); }
      if (backup) {
        try { const prior = await fs.readFile(target, 'utf8'); JSON.parse(prior); await fs.copyFile(target, target + '.bak'); }
        catch (error: any) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
      }
      // Windows readers and antivirus may briefly hold a handle without FILE_SHARE_DELETE.
      // Never unlink the valid destination to work around a failed replacement.
      await retrySharingViolation(() => fs.rename(temporary, target));
    } finally { await fs.rm(temporary, { force: true }); }
  });
  writes.set(target, pending);
  // Handle both outcomes without creating an unobserved rejected cleanup promise.
  pending.then(() => { if (writes.get(target) === pending) writes.delete(target); },
    () => { if (writes.get(target) === pending) writes.delete(target); });
  return pending;
}

export async function readJson(file: string) {
  await writes.get(path.resolve(file))?.catch(() => {});
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error: any) { if (error.code === 'ENOENT') return null; throw error; }
}

export async function removeJson(file: string) {
  // Removal shares the same queue as writes: closing a project cannot be undone by a pending save.
  const target = path.resolve(file);
  const pending = (writes.get(target) || Promise.resolve()).catch(() => {}).then(() => retrySharingViolation(() => fs.rm(target, { force: true })));
  writes.set(target, pending);
  pending.then(() => { if (writes.get(target) === pending) writes.delete(target); },
    () => { if (writes.get(target) === pending) writes.delete(target); });
  await pending;
}

export async function drainPersistence() {
  await Promise.allSettled([...writes.values()]);
}

export async function readJsonRecover(file:string){
 try { return {value:await readJson(file),recovered:false}; }
 catch(original){try{const value=await readJson(file+'.bak');if(value)return {value,recovered:true};}catch{}throw original;}
}
