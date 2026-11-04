import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, writeFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const scratch = mkdtempSync(path.join(os.tmpdir(), 'openfruit-ide-'));
const modulePath = path.join(scratch, 'protocol.mjs');
await build({ stdin: { contents: "export * from './electron/openfruit'; export * from './src/engineProtocol';", resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'esm', outfile: modulePath });
const { lineReader, parseEngineEvent, normalizeDevices, runOpenFruit, getOpenFruitBinaryPath, eventLog, eventProblem, eventProgress, eventArtifacts } = await import(pathToFileURL(modulePath).href);
after(() => rmSync(scratch, { recursive: true, force: true }));

test('split CRLF records, multiple lines, final unterminated record and unknown schemas', () => {
  const records = [];
  const reader = lineReader(line => records.push(line));
  reader.write('{"schema_version":1,"kind":"future.event","data":{"message":"città"}}\r');
  reader.write('\nplain\n{"schema_version":2,"kind":"future.event","data":{}}');
  reader.end();
  assert.equal(records.length, 3);
  assert.equal(parseEngineEvent(records[0]).data.message, 'città');
  assert.equal(parseEngineEvent(records[1]), undefined);
  assert.equal(parseEngineEvent(records[2]), undefined);
});

test('compiler diagnostics retain Windows paths and one-based positions; unknown events retain metadata', () => {
  const event = { schema_version: 1, kind: 'diagnostic', severity: 'warning', producer_id: 'a', producer_sequence: 3,
    data: { file: 'C:\\Project with spaces\\Città.swift', message: 'warning message', line: 9, column: 4 } };
  assert.deepEqual(eventProblem(event), { id: 'build-a-3', source: 'build', filePath: event.data.file,
    fileName: 'Città.swift', message: 'warning message', severity: 'warning', line: 9, column: 4 });
  assert.equal(eventLog(event).event, event);
  assert.equal(eventProblem({ ...event, kind: 'task.completed' }), undefined);
});

test('device identity, network transport and unknown OS version come from CLI', () => {
  assert.deepEqual(normalizeDevices([{ udid: '123', name: 'Phone', connection: 'Network' }]), [
    { udid: '123', name: 'Phone', connection: 'network', model: 'iPhone', iosVersion: '', connected: true }
  ]);
  assert.deepEqual(normalizeDevices([]), []);
  assert.throws(() => normalizeDevices({ error: 'failed' }));
});

test('pipe decoding preserves fragmented UTF-8 and abort ends a running process', async () => {
  const previous = process.env.OPENFRUIT_BIN;
  process.env.OPENFRUIT_BIN = process.execPath;
  try {
    const lines = [];
    const result = await runOpenFruit(['-e', `const b=Buffer.from('città\\n'); process.stdout.write(b.subarray(0,5)); setTimeout(()=>process.stdout.write(b.subarray(5)),30);`], {
      onOutput: line => lines.push(line)
    });
    assert.equal(result.success, true);
    assert.deepEqual(lines.map(line => line.text), ['città']);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const cancelled = await runOpenFruit(['-e', "console.log('started'); setInterval(()=>{},1000)"], {
        signal: controller.signal,
        onOutput: () => controller.abort()
      });
      assert.equal(cancelled.success, false);
      assert.equal(cancelled.cancelled, true);
    } finally { clearTimeout(timeout); }
    await assert.rejects(runOpenFruit(['-e', ''], { cwd: path.join(scratch, 'missing-directory') }));
  } finally {
    if (previous === undefined) delete process.env.OPENFRUIT_BIN; else process.env.OPENFRUIT_BIN = previous;
  }
});

test('installed CLI capabilities, devices, success and failure streams reach the IDE consumer',
  { skip: !existsSync(getOpenFruitBinaryPath()) }, async () => {
    const capabilities = await runOpenFruit(['capabilities']);
    assert.equal(capabilities.success, true);
    assert.equal(JSON.parse(capabilities.stdout).schema_version, 2);
    const devices = await runOpenFruit(['devices', '--json']);
    assert.equal(devices.success, true);
    assert.ok(Array.isArray(normalizeDevices(JSON.parse(devices.stdout))));

    // Production compiler-proxy interface: exercise UTF-8 decoding and real diagnostics.
    const swiftRoot = path.join(process.env.LOCALAPPDATA || '', 'OPENFRUIT', 'toolchains', 'swift');
    const clang = existsSync(swiftRoot) ? readdirSync(swiftRoot).map(version => path.join(swiftRoot, version, 'usr', 'bin', 'clang.exe')).find(existsSync) : undefined;
    const oldState = process.env.OPENFRUIT_USER_STATE;
    const oldProxy = process.env.OPENFRUIT_COMPILER_PROXY_REAL;
    process.env.OPENFRUIT_USER_STATE = path.join(scratch, 'state');
    if (clang) process.env.OPENFRUIT_COMPILER_PROXY_REAL = clang;
    try {
      for (const valid of [true, false]) {
        const file = path.join(scratch, 'probe with spaces.c');
        writeFileSync(file, valid ? 'int value = 1;\n' : 'int value = ;\n');
        const output = [];
        const args = clang ? ['-x', 'c', '-fsyntax-only', file] : [valid ? 'version' : 'unknown-ide-test-command'];
        const result = await runOpenFruit([...args, '--diagnostics=json'], { onOutput: line => output.push(line) });
        assert.equal(result.success, valid);
        const events = output.flatMap(line => line.event ? [line.event] : []);
        assert.ok(events.some(event => event.kind === 'task.completed' && event.data.name === 'cli.command'));
        assert.ok(events.every(event => event.producer_id && event.producer_sequence > 0));
        if (clang && !valid) {
          const problems = events.map(eventProblem).filter(Boolean);
          assert.ok(problems.some(problem => problem.filePath === file && problem.line === 1));
        }
        assert.ok(output.filter(line => line.stream === 'stdout').every(line => line.event), 'stdout must be JSON Lines');
      }
    } finally {
      if (oldState === undefined) delete process.env.OPENFRUIT_USER_STATE; else process.env.OPENFRUIT_USER_STATE = oldState;
      if (oldProxy === undefined) delete process.env.OPENFRUIT_COMPILER_PROXY_REAL; else process.env.OPENFRUIT_COMPILER_PROXY_REAL = oldProxy;
    }
  });

test('build progress follows stage and install events; artifacts come from the build completion', () => {
  const event = (kind, data) => ({ schema_version: 1, kind, severity: 'info', data });
  const compiling = eventProgress(event('build.progress', { active_stage: 'compile', percent: 57, state: 'running' }));
  assert.deepEqual(compiling, { stage: 'Compilazione', percent: 57, state: 'running' });
  const installing = eventProgress(event('deploy.progress', { completed: 40, planned: 100 }), compiling);
  assert.equal(installing.stage, 'Installazione 40%');
  assert.equal(installing.percent, 57);
  assert.equal(eventProgress(event('diagnostic', {})), undefined);
  const done = eventArtifacts(event('task.completed', { name: 'build', state: 'succeeded', signed_ipa: 'C:/w/App-signed.ipa', unsigned_ipa: '', bundle_id: 'com.example.app', deployed: true }));
  assert.deepEqual(done, { signedIpa: 'C:/w/App-signed.ipa', unsignedIpa: '', bundleId: 'com.example.app', deployed: true });
  assert.equal(eventArtifacts(event('task.completed', { name: 'build', state: 'failed' })), undefined);
  assert.equal(eventArtifacts(event('task.completed', { name: 'sdk', state: 'succeeded' })), undefined);
});
