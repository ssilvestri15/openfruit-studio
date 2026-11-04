import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'openfruit-merge-test-'));
const output = path.join(scratch, 'contracts.mjs');
await build({ stdin: { contents: "export * from './electron/merge'; export * from './electron/fileStore'; export * from './src/utils/merge'; export * from './src/utils/editorState';", resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', outfile: output });
const { mergeContents, revision, assertMergeResolved, markSaved, saveSnapshot } = await import(pathToFileURL(output).href);
after(() => fs.rm(scratch, { recursive: true, force: true }));
const snapshot = content => ({ content, revision: revision(content) });

test('three-way merge combines independent edits and keeps the disk revision without writing sources', async () => {
  const base = 'one\ntwo\nthree\nfour\nfive\n';
  const disk = snapshot(base.replace('five', 'DISK'));
  const result = await mergeContents(base, revision(base), base.replace('one', 'LOCAL'), disk);
  assert.equal(result.conflicts, 0);
  assert.equal(result.content, 'LOCAL\ntwo\nthree\nfour\nDISK\n');
  assert.deepEqual(result.disk, disk);
  assert.deepEqual(await fs.readdir(scratch), ['contracts.mjs']);
});
test('overlapping changes produce diff3 markers and cannot be saved or built until resolved', async () => {
  const base = 'let value = 1\n';
  const result = await mergeContents(base, revision(base), 'let value = 2\n', snapshot('let value = 3\n'));
  assert.ok(result.conflicts > 0);
  for (const marker of ['<<<<<<< Editor', '||||||| Base', '=======', '>>>>>>> Disco']) assert.ok(result.content.includes(marker));
  assert.throws(() => assertMergeResolved({ content: result.content, unresolvedMerge: true }), /marcatori/);
  assert.doesNotThrow(() => assertMergeResolved({ content: 'let value = 4\n', unresolvedMerge: true }));
});
test('merge handles equal edits, deletion, insertion and preserves local CRLF', async () => {
  const base = 'one\ntwo\nthree\nfour\nfive\n';
  const local = base.replace('one\n', '').replace('three', 'THREE');
  const equal = await mergeContents(base, revision(base), local, snapshot(local));
  assert.equal(equal.conflicts, 0); assert.equal(equal.content, local);
  const crlf = await mergeContents(base, revision(base), base.replace('one', 'LOCAL').replace(/\n/g, '\r\n'), snapshot(base + 'new\n'));
  assert.equal(crlf.conflicts, 0); assert.equal(crlf.content, 'LOCAL\r\ntwo\r\nthree\r\nfour\r\nfive\r\nnew\r\n');
});
test('merge rejects mismatched baselines and oversized data; later disk changes still block saving', async () => {
  await assert.rejects(mergeContents('base', revision('other'), 'local', snapshot('disk')), /originale/);
  await assert.rejects(mergeContents('base', revision('base'), 'x'.repeat(2 * 1024 * 1024 + 1), snapshot('disk')), /2 MB/);
  const base = 'a\nb\nc\nd\ne\n', disk = snapshot(base.replace('e', 'disk'));
  const result = await mergeContents(base, revision(base), base.replace('a', 'local'), disk);
  const file = path.join(scratch, 'source.swift'); await fs.writeFile(file, 'changed again');
  assert.equal((await saveSnapshot(file, result.content, result.disk.revision)).conflict, true);
  assert.equal(await fs.readFile(file, 'utf8'), 'changed again');
});
test('save completion advances the merge baseline but preserves newer editor changes', () => {
  const tab = { id: '1', path: 'source.swift', content: 'newer', revision: 'old', baseContent: 'base', isDirty: true, unresolvedMerge: true };
  const [result] = markSaved([tab], [{ ...tab, content: 'saved', revision: 'new' }]);
  assert.equal(result.baseContent, 'saved'); assert.equal(result.content, 'newer'); assert.equal(result.isDirty, true); assert.equal(result.unresolvedMerge, true);
});
