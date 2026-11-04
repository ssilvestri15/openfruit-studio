const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..', 'release', 'win-unpacked', 'resources');
const pty = require(path.join(root, 'app.asar', 'node_modules', 'node-pty'));
const terminal = pty.spawn('powershell.exe', ['-NoLogo', '-NoProfile'], {
  cwd: require('node:os').tmpdir(), cols: 80, rows: 24, useConptyDll: true, env: process.env
});
let output = '';
const timeout = setTimeout(() => { console.error('Packaged ConPTY timed out: ' + output); terminal.kill(); process.exitCode = 1; }, 10000);
terminal.onData(data => {
  output += data;
});
terminal.onExit(({ exitCode }) => {
  clearTimeout(timeout);
  terminal.kill();
  terminal._agent._conoutSocketWorker.dispose();
  try { assert.equal(exitCode, 0); assert.ok(output.includes('PACKAGED_PTY_OK')); console.log('PASS: packaged Electron loads unpacked ConPTY DLL, native addon and worker, executes PowerShell and exits'); }
  catch (error) { console.error(error); process.exitCode = 1; }
});
terminal.write("Write-Output ('PACKAGED'+'_PTY_OK'); exit 0\r");
