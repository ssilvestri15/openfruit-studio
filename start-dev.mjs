import { spawn } from 'node:child_process';
import electron from 'electron';
import { createServer } from 'vite';

await import('./build-electron.mjs');
const server = await createServer();
await server.listen();
const env = { ...process.env, NODE_ENV: 'development' };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ['.'], { stdio: 'inherit', env, windowsHide: false });
let closing = false;
async function close(code = 0) {
  if (closing) return;
  closing = true;
  await server.close();
  if (child.exitCode === null) child.kill();
  process.exitCode = code;
}
child.once('error', error => { console.error(error); close(1); });
child.once('close', code => close(code ?? 0));
process.once('SIGINT', () => close());
process.once('SIGTERM', () => close());
