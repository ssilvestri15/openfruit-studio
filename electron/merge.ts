import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execGit } from './git';
import { revision } from './fileStore';
import { MAX_TEXT_BYTES } from './workspace';
import type { FileSnapshot, MergeResult } from '../shared/files';

export async function mergeContents(base: string, expected: string, local: string, disk: FileSnapshot): Promise<MergeResult> {
  if (typeof base !== 'string' || typeof local !== 'string' || [base, local, disk.content].some(s => Buffer.byteLength(s) > MAX_TEXT_BYTES)) throw new Error('Contenuto del merge non valido o superiore a 2 MB');
  if (revision(base) !== expected) throw new Error('Versione originale non disponibile: usa il confronto manuale');
  const tempRoot = await fs.realpath(os.tmpdir());
  const directory = await fs.mkdtemp(path.join(tempRoot, 'openfruit-merge-'));
  try {
    const names = ['editor', 'base', 'disk'].map(name => path.join(directory, name));
    await Promise.all([local, base, disk.content].map((content, i) => fs.writeFile(names[i], content.replace(/\r\n/g, '\n'), { mode: 0o600 })));
    const result = await execGit(directory, ['merge-file', '-p', '--diff3', '-L', 'Editor', '-L', 'Base', '-L', 'Disco', ...names]);
    if (result.code < 0 || result.code > 127) throw new Error(result.stderr || 'Merge non riuscito');
    let content = result.stdout;
    if (local.includes('\r\n')) content = content.replace(/\n/g, '\r\n');
    if (Buffer.byteLength(content) > MAX_TEXT_BYTES) throw new Error('Risultato del merge superiore a 2 MB');
    return { content, conflicts: result.code, disk };
  } finally {
    const target = path.resolve(directory);
    if (path.dirname(target) !== tempRoot || !path.basename(target).startsWith('openfruit-merge-')) throw new Error('Percorso temporaneo non valido');
    await fs.rm(target, { recursive: true, force: true });
  }
}
