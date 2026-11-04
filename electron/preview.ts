import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import type { WebContents } from 'electron';
import { getOpenFruitBinaryPath, lineReader, terminateProcess } from './openfruit';

// One live preview stream per window: `openfruit device preview` relays the
// preview agent's binary H.264 stream on stdout; status lines come on stderr.
export class PreviewSessions {
  private sessions = new Map<number, ChildProcess>();

  start(owner: WebContents, udid: string) {
    if (typeof udid !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(udid)) throw new Error('UDID non valido');
    this.stop(owner.id);
    const bin = getOpenFruitBinaryPath();
    if (!fs.existsSync(bin)) throw new Error(`OpenFruit executable non trovato in: ${bin}`);
    const proc = spawn(bin, ['device', 'preview', '--udid', udid], { shell: false, windowsHide: true });
    this.sessions.set(owner.id, proc);
    const send = (channel: string, value: unknown) => { if (!owner.isDestroyed()) owner.send(channel, value); };
    proc.stdout.on('data', (chunk: Buffer) => send('preview-data', chunk));
    proc.stderr.setEncoding('utf8');
    const status = lineReader(line => { if (line.trim()) send('preview-status', line.replace(/^OPENFRUIT preview:\s*/, '')); });
    proc.stderr.on('data', (chunk: string) => status.write(chunk));
    proc.once('error', error => send('preview-status', error.message));
    proc.once('close', code => {
      status.end();
      if (this.sessions.get(owner.id) === proc) this.sessions.delete(owner.id);
      send('preview-ended', { code });
    });
    owner.once('destroyed', () => this.stop(owner.id));
  }

  stop(ownerId: number) {
    const proc = this.sessions.get(ownerId);
    if (!proc) return;
    this.sessions.delete(ownerId);
    terminateProcess(proc);
  }
}
