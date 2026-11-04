import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'openfruit-security-'));
const output = path.join(scratch, 'contracts.mjs');
await build({ stdin: { contents: "export * from './electron/workspaceAccess'; export * from './electron/fileStore'; export * from './electron/terminal';", resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', outfile: output });
const { WorkspaceAccess, readSnapshot, saveSnapshot, TerminalManager } = await import(pathToFileURL(output).href);
const terminals = new TerminalManager();
after(async () => { await terminals.closeAll(); await fs.rm(scratch, { recursive: true, force: true }); });

test('file permissions require an open workspace and reject roots, traversal and junction escape', async () => {
  const root = path.join(scratch, 'project'), outside = path.join(scratch, 'outside');
  await fs.mkdir(root); await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'private.txt'), 'private');
  const access = new WorkspaceAccess(path.join(scratch, 'default-projects'));
  assert.throws(() => access.assert(path.join(root, 'file.swift')));
  assert.throws(() => access.beginOpen(root));
  access.grant(root);
  access.activate(root);
  assert.equal(access.assert(path.join(root, 'new', 'File.swift')), path.join(root, 'new', 'File.swift'));
  assert.throws(() => access.assert(root));
  assert.throws(() => access.assert(path.join(root, '..', 'outside', 'private.txt')));
  await fs.symlink(outside, path.join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => access.assert(path.join(root, 'escape', 'private.txt')));
  assert.throws(() => access.assert(path.join(root, 'escape', 'new.txt')));
  await fs.mkdir(path.join(root, 'Apps', 'Subproject'), { recursive: true });
  access.activate(path.join(root, 'Apps', 'Subproject'), root);
  assert.throws(() => access.assert(path.join(root, 'Apps')));
  const first = access.beginOpen(root); access.beginOpen(root);
  assert.equal(first.current(), false);
  access.clear();
  assert.throws(() => access.assert(path.join(root, 'new.swift')));
});

test('saving detects external same-size edits even with unchanged mtime and preserves external contents', async () => {
  const file = path.join(scratch, 'Version.swift');
  await fs.writeFile(file, 'aaaa');
  const initial = await readSnapshot(file), stat = await fs.stat(file);
  await fs.writeFile(file, 'bbbb'); await fs.utimes(file, stat.atime, stat.mtime);
  const conflict = await saveSnapshot(file, 'user edits', initial.revision);
  assert.equal(conflict.conflict, true);
  assert.equal(await fs.readFile(file, 'utf8'), 'bbbb');
  const fresh = await readSnapshot(file);
  const saved = await saveSnapshot(file, 'cccc', fresh.revision);
  assert.equal(saved.success, true);
  assert.equal(saved.revision, (await readSnapshot(file)).revision);
  const noVersion = await saveSnapshot(file, 'unverified', undefined);
  assert.equal(noVersion.success, false);
  await fs.unlink(file);
  assert.equal((await saveSnapshot(file, 'recreate', saved.revision)).conflict, true);
});

test('concurrent editor saves serialize and re-check the revision; revoked access prevents writing', async () => {
  const file = path.join(scratch, 'Concurrent.swift');
  await fs.writeFile(file, 'initial');
  const initial = await readSnapshot(file);
  const [first, second] = await Promise.all([
    saveSnapshot(file, 'first editor', initial.revision),
    saveSnapshot(file, 'second editor', initial.revision)
  ]);
  assert.equal(first.success, true); assert.equal(second.conflict, true);
  assert.equal(await fs.readFile(file, 'utf8'), 'first editor');
  const denied = await saveSnapshot(file, 'denied', first.revision, () => { throw new Error('revoked'); });
  assert.equal(denied.success, false);
  assert.equal(await fs.readFile(file, 'utf8'), 'first editor');
});

test('PowerShell tabs preserve variables, location and Unicode, and report native failures', { skip: process.platform !== 'win32', timeout: 15000 }, async () => {
  const root = path.join(scratch, 'terminal'); await fs.mkdir(path.join(root, 'sub'), { recursive: true });
  const literal = path.join(root, 'sub').replace(/'/g, "''");
  assert.equal((await terminals.run(1, 'one', root, `$OpenFruitTestValue = 42; Set-Location -LiteralPath '${literal}'`)).success, true);
  const retained = await terminals.run(1, 'one', root, "$OpenFruitTestValue; 'città 🌱'");
  assert.equal(retained.success, true);
  assert.match(retained.stdout, /42/); assert.match(retained.stdout, /città 🌱/);
  assert.equal(retained.cwd.toLowerCase(), path.join(root, 'sub').toLowerCase());
  const separate = await terminals.run(1, 'two', root, '$null -eq $OpenFruitTestValue');
  assert.match(separate.stdout, /True/);
  const failure = await terminals.run(1, 'one', root, 'cmd.exe /c exit 7');
  assert.equal(failure.success, false); assert.equal(failure.code, 7);
  const error = await terminals.run(1, 'one', root, 'Write-Error "controlled terminal error"');
  assert.equal(error.success, false);
});

test('cancellation and tab close stop only the selected session; next command uses a fresh session', { skip: process.platform !== 'win32', timeout: 15000 }, async () => {
  const sleeping = terminals.run(2, 'slow', scratch, 'Start-Sleep -Seconds 20');
  const other = await terminals.run(2, 'other', scratch, "'still running'");
  assert.equal(other.success, true);
  await terminals.close(2, 'slow');
  assert.equal((await sleeping).cancelled, true);
  assert.equal((await terminals.run(2, 'slow', scratch, "'new session'")).success, true);
  await terminals.closeOwner(2);
  assert.equal((await terminals.run(1, 'two', scratch, "'other owner unaffected'")).success, true);
});
