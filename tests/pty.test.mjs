import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'openfruit-pty-test-'));
const output = path.join(scratch, 'pty.cjs');
await build({ entryPoints: ['electron/pty.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: output, plugins: [{ name: 'native-location', setup(build) { build.onResolve({ filter: /^node-pty$/ }, () => ({ path: require.resolve('node-pty'), external: true })); } }] });
const { PtyManager } = require(output);
const manager = new PtyManager();
after(async () => { await manager.closeAll(); await fs.rm(scratch, { recursive: true, force: true }); });
test('native PTY enforces owner, token and dimensions; natural exit releases the node-pty worker', async () => {
  const ports = () => process.getActiveResourcesInfo().filter(name => name === 'MessagePort').length;
  const initial = ports();
  let token, output = '', done;
  const exited = new Promise(resolve => { done = resolve; });
  token = manager.open(1, 'test', scratch, event => {
    if (event.data) { output += event.data; manager.ack(1, 'test', event.token, event.data.length); }
    else done(event.exitCode);
  });
  assert.throws(() => manager.write(2, 'test', token, 'no'));
  assert.throws(() => manager.write(1, 'test', 'wrong', 'no'));
  assert.throws(() => manager.resize(1, 'test', token, 0, 20));
  manager.write(1, 'test', token, "Write-Output ('NATIVE'+'_PTY_OK'); exit 0\r");
  const exitCode = await Promise.race([exited, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('ConPTY exit timeout')), 15000); timer.unref(); })]);
  assert.equal(exitCode, 0);
  assert.ok(output.includes('NATIVE_PTY_OK'), 'PowerShell must execute the command sent through the PTY');
  await new Promise(r => setTimeout(r, 1400));
  assert.equal(ports(), initial, 'A closed shell must not retain its output worker');
  manager.ack(1, 'test', token, 1); // asynchronous xterm acknowledgements after exit are harmless.
});
