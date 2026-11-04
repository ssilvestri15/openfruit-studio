import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'openfruit-resolve-'));
const output = path.join(scratch, 'contracts.mjs');
await build({ stdin: { contents: "export * from './src/utils/fileConflicts'; export * from './electron/fileStore'; export * from './electron/git'; export * from './electron/gitOperations';", resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', outfile: output });
const { defaultCopyName, siblingCopyPath, reloadUnchanged, readSnapshot, saveSnapshot, execGit, GitOperations } = await import(pathToFileURL(output).href);
const operations = new GitOperations();
after(async () => { await operations.closeAll(); await fs.rm(scratch, { recursive: true, force: true }); });

test('recovery copies do not become compiled sources and reject original names, path escape and reserved names', () => {
  assert.equal(defaultCopyName('ContentView.swift'), 'ContentView.swift.editor-copy');
  assert.equal(defaultCopyName('.env'), '.env.editor-copy');
  assert.equal(siblingCopyPath('C:\\Project\\View.swift', 'View.copy.swift'), 'C:/Project/View.copy.swift');
  for (const name of ['view.swift', '../View.swift', 'dir/file', 'dir\\file', 'CON.txt', 'copy.', 'copy\n.swift']) assert.throws(() => siblingCopyPath('C:/Project/View.swift', name));
});

test('reload preserves edits made after the reload request; reconciliation refuses a second external change', async () => {
  const tab = { id: 'file', path: 'File.swift', content: 'local', isDirty: true };
  const disk = { content: 'disk', revision: 'disk-revision' };
  assert.equal(reloadUnchanged([{ ...tab, content: 'new local' }], tab, disk)[0].content, 'new local');
  assert.equal(reloadUnchanged([tab], tab, disk)[0].isDirty, false);
  const file = path.join(scratch, 'Conflict.swift');
  await fs.writeFile(file, 'initial');
  const initial = await readSnapshot(file);
  await fs.writeFile(file, 'external one');
  const first = await saveSnapshot(file, 'local', initial.revision);
  assert.equal(first.disk.content, 'external one');
  await fs.writeFile(file, 'external two');
  const repeated = await saveSnapshot(file, 'reconciled against one', first.disk.revision);
  assert.equal(repeated.conflict, true);
  assert.equal(repeated.disk.content, 'external two');
  assert.equal(await fs.readFile(file, 'utf8'), 'external two');
  assert.equal((await saveSnapshot(file, 'reconciled against two', repeated.disk.revision)).success, true);
});

test('Git cancellation routes by owner and operation and rejects a concurrent network command', async () => {
  const wait = signal => new Promise(resolve => signal.addEventListener('abort', () => resolve({ code: 130, stdout: '', stderr: '', cancelled: true }), { once: true }));
  const first = operations.run(1, 'push', wait);
  let secondCalled = false;
  const busy = await operations.run(1, 'fetch', () => { secondCalled = true; return Promise.resolve({ code: 0, stdout: '', stderr: '' }); });
  assert.equal(busy.success, false); assert.equal(secondCalled, false);
  const other = operations.run(2, 'clone', wait);
  assert.equal(operations.cancel(2, 'push'), false);
  assert.equal(operations.cancel(1, 'fetch'), false);
  assert.equal(operations.cancel(1, 'push'), true);
  assert.equal((await first).cancelled, true);
  assert.equal(operations.cancel(2, 'clone'), true);
  assert.equal((await other).code, 130);
});

test('cancelling an actual Git subprocess ends its waiting helper', { skip: process.platform !== 'win32', timeout: 10000 }, async () => {
  const repo = path.join(scratch, 'git'); await fs.mkdir(repo); await execGit(repo, ['init']);
  const script = path.join(scratch, 'wait.ps1'); await fs.writeFile(script, 'Start-Sleep -Seconds 20\n');
  const quoted = "'" + script.replace(/\\/g, '/').replace(/'/g, "'\\''") + "'";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 500);
  try {
    const result = await execGit(repo, ['-c', `alias.wait=!powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ${quoted}`, 'wait'], { signal: controller.signal });
    assert.equal(result.cancelled, true); assert.equal(result.code, 130);
  } finally { clearTimeout(timer); }
  const aborted = new AbortController(); aborted.abort();
  assert.equal((await execGit(repo, ['status'], { signal: aborted.signal })).cancelled, true);
});
