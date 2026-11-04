import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'openfruit-review-'));
const output = path.join(scratch, 'review.mjs');
await build({ stdin: { contents: "export * from './electron/workspace'; export * from './electron/git'; export * from './electron/lsp'; export * from './electron/persistence'; export * from './src/utils/editorState'; export * from './src/utils/workspaceRequests';", resolveDir: process.cwd() },
  outfile: output, platform: 'node', format: 'esm', bundle: true });
const { scanDirectoryTree, readTextFile, containedPath, validateProjectName, execGit, execRepositoryGit, gitRoot, parseGitStatus, LspReader, markSaved, fileUri, inPath, filePathFromUri, expandReplacement, writeJsonAtomic, readJson, removeJson, drainPersistence, WorkspaceRequests } = await import(pathToFileURL(output).href);
after(async () => { await drainPersistence(); await fs.rm(scratch, { force: true, recursive: true }); });

test('tree is metadata only, ignores build output and does not follow junction cycles', async () => {
  const root = path.join(scratch, 'tree');
  await fs.mkdir(path.join(root, 'build'), { recursive: true });
  await fs.writeFile(path.join(root, 'empty.swift'), '');
  await fs.writeFile(path.join(root, 'image.png'), Buffer.from([1, 0, 2]));
  await fs.writeFile(path.join(root, 'large.txt'), Buffer.alloc(2 * 1024 * 1024 + 1, 65));
  await fs.symlink(root, path.join(root, 'loop'), process.platform === 'win32' ? 'junction' : 'dir');
  const tree = await scanDirectoryTree(root);
  assert.equal(tree.children.length, 3);
  assert.ok(tree.children.every(node => node.content === undefined));
  assert.equal(await readTextFile(path.join(root, 'empty.swift')), '');
  await assert.rejects(readTextFile(path.join(root, 'image.png')));
  await assert.rejects(readTextFile(path.join(root, 'large.txt')));
});

test('destructive paths reject traversal, root and sibling prefixes', () => {
  const root = path.join(scratch, 'project');
  assert.throws(() => containedPath(root, '..'));
  assert.throws(() => containedPath(root, root));
  assert.throws(() => containedPath(root, path.join(scratch, 'project-copy', 'file')));
  assert.equal(containedPath(root, 'src/file'), path.join(root, 'src/file'));
  assert.throws(() => validateProjectName('../escape'));
  assert.throws(() => validateProjectName('Bad"Name'));
});

test('Git preserves literal shell characters and UTF-8 paths; status parses renames', async () => {
  const root = path.join(scratch, 'git repo');
  await fs.mkdir(root);
  assert.equal((await execGit(root, ['init'])).code, 0);
  const name = 'città & file.txt';
  await fs.writeFile(path.join(root, name), 'one\n');
  const untracked = parseGitStatus((await execGit(root, ['status', '--porcelain=v1', '-z'])).stdout);
  assert.equal(untracked.unstagedFiles[0].filename, name);
  await execGit(root, ['add', '--', name]);
  const message = 'literal "quotes" & echo SHOULD_NOT_RUN';
  const commit = await execGit(root, ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', message]);
  assert.equal(commit.code, 0, commit.stderr);
  assert.equal((await execGit(root, ['log', '-1', '--format=%s'])).stdout.trim(), message);
  const renamed = 'renamed file.txt';
  await execGit(root, ['mv', '--', name, renamed]);
  const status = parseGitStatus((await execGit(root, ['status', '--porcelain=v1', '-z'])).stdout);
  assert.equal(status.stagedFiles.length, 1);
  assert.equal(status.stagedFiles[0].filename, renamed);
  const missing = await execGit(path.join(root, 'missing'), ['status']);
  assert.notEqual(missing.code, 0);
});

test('LSP decodes fragmented Unicode messages by byte length and preserves consecutive frames', () => {
  const messages = [];
  const reader = new LspReader(message => messages.push(message));
  const body = JSON.stringify({ method: 'textDocument/publishDiagnostics', params: { message: 'città 🌱' } });
  const frame = Buffer.from(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  for (const byte of frame) reader.write(Buffer.from([byte]));
  reader.write(Buffer.concat([frame, frame]));
  assert.equal(messages.length, 3);
  assert.equal(messages[0].params.message, 'città 🌱');
  assert.throws(() => new LspReader(() => {}).write(Buffer.from('Content-Length: 999999999\r\n\r\n')));
});

test('save completion never clears newer edits or a renamed tab; paths respect boundaries and URI encoding', () => {
  const tab = { id: 'a', path: 'C:/Project/File.swift', content: 'old', isDirty: true };
  assert.equal(markSaved([{ ...tab, content: 'new' }], [tab])[0].isDirty, true);
  assert.equal(markSaved([{ ...tab, path: 'renamed.swift' }], [tab])[0].isDirty, true);
  assert.equal(markSaved([tab], [tab])[0].isDirty, false);
  assert.equal(inPath('C:/Project-copy/File', 'C:/Project'), false);
  assert.equal(inPath('C:\\Project\\Sub\\File', 'C:/Project'), true);
  assert.equal(fileUri('C:\\Città #1\\File.swift'), pathToFileURL('C:\\Città #1\\File.swift').href);
  assert.equal(filePathFromUri(fileUri('C:/Città #1/File.swift')), 'C:/Città #1/File.swift');
});

test('regex replacements preserve captures, literal dollars and unmatched tokens', () => {
  assert.equal(expandReplacement('$2-$1-$$-$&', ['ab', 'a', 'b']), 'b-a-$-ab');
  assert.equal(expandReplacement('$12', ['a', 'a']), 'a2');
  assert.equal(expandReplacement('$1', null), '$1');
});

test('repository operations from nested projects resolve paths against the actual Git root', async () => {
  const root = path.join(scratch, 'nested git');
  const project = path.join(root, 'Apps', 'Sample');
  await fs.mkdir(project, { recursive: true });
  await execGit(root, ['init']);
  await fs.writeFile(path.join(project, 'View.swift'), 'let value = 1\n');
  await fs.writeFile(path.join(root, 'root.txt'), 'root\n');
  assert.equal(await fs.realpath(await gitRoot(project)), await fs.realpath(root));
  await execRepositoryGit(project, ['add', '--', 'Apps/Sample/View.swift']);
  const status = parseGitStatus((await execRepositoryGit(project, ['status', '--porcelain=v1', '-z'])).stdout);
  assert.deepEqual(status.stagedFiles.map(file => file.filename), ['Apps/Sample/View.swift']);
  assert.deepEqual(status.unstagedFiles.map(file => file.filename), ['root.txt']);
});

test('atomic JSON writes stay valid for readers and retain request order; removal shares the queue', async () => {
  const file = path.join(scratch, 'persist', 'session.json');
  await writeJsonAtomic(file, { version: 0 });
  const pending = Array.from({ length: 20 }, (_, index) => writeJsonAtomic(file, { version: index + 1, content: 'x'.repeat(20000) }));
  for (let i = 0; i < 30; i++) assert.ok(Number.isInteger(JSON.parse(await fs.readFile(file, 'utf8')).version));
  await Promise.all(pending);
  assert.equal((await readJson(file)).version, 20);
  const circular = {}; circular.self = circular;
  assert.throws(() => writeJsonAtomic(file, circular));
  assert.equal((await readJson(file)).version, 20);
  await Promise.all([writeJsonAtomic(file, { version: 21 }), removeJson(file), writeJsonAtomic(file, { version: 22 })]);
  assert.equal((await readJson(file)).version, 22);
  await Promise.all([writeJsonAtomic(file, { version: 23 }), removeJson(file)]);
  assert.equal(await readJson(file), null);
  assert.deepEqual(await fs.readdir(path.dirname(file)), []);
  await writeJsonAtomic(file, { version: 24 });
  await assert.rejects(writeJsonAtomic(path.join(file, 'not-a-directory.json'), { version: 25 }));
  assert.equal((await readJson(file)).version, 24);
});

test('workspace generations reject late results even when reopening the same path', () => {
  const requests = new WorkspaceRequests();
  requests.switchTo('C:/Project');
  const oldGit = requests.ticket('git');
  const tree = requests.ticket('tree');
  const newGit = requests.ticket('git');
  assert.equal(oldGit(), false); assert.equal(newGit(), true); assert.equal(tree(), true);
  requests.switchTo('C:/Other');
  requests.switchTo('C:/Project');
  assert.equal(newGit(), false); assert.equal(tree(), false);
  assert.equal(requests.matches('c:\\Project'), true);
  assert.equal(requests.matches('C:/Project-copy'), false);
});
