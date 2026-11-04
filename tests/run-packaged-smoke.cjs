const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
async function verify() {
  const { extractFile } = await import('@electron/asar');
  const archive = path.join(root, 'release', 'win-unpacked', 'resources', 'app.asar');
  const inspect = directory => {
    for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) inspect(file);
      else assert.deepEqual(extractFile(archive, file), fs.readFileSync(path.join(root, file)), `Packaged file differs from the current build: ${file}`);
    }
  };
  inspect('dist'); inspect('dist-electron');
  console.log('PASS: packaged frontend, main, preload and maps match the current build');
const result = spawnSync(path.join(root, 'release', 'win-unpacked', 'OpenFruit Studio.exe'), [path.join(__dirname, 'packaged-pty-smoke.cjs')], {
  cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', timeout: 20000, windowsHide: true
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) console.error(result.error);
process.exitCode = result.status ?? 1;
}
verify().catch(error => { console.error(error); process.exitCode = 1; });
