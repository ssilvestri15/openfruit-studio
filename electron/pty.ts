import type { PtyOutput } from '../shared/terminal';
import * as pty from 'node-pty';
import { randomUUID } from 'node:crypto';

export class PtyManager {
  private sessions = new Map<string, { process: pty.IPty; token: string; pending: number; paused: boolean; exited: Promise<void>; killed: boolean }>();
  private stopping = new Set<Promise<void>>();
  private key(owner: number, id: string) {
    if (typeof id !== 'string' || !/^[\w-]{1,100}$/.test(id)) throw new Error('Terminale non valido');
    return `${owner}:${id}`;
  }
  open(owner: number, id: string, cwd: string, send: (data: PtyOutput) => void, profile: 'powershell' | 'cmd' = 'powershell') {
    const key = this.key(owner, id);
    if (this.sessions.has(key)) throw new Error('Terminale già aperto');
    if ([...this.sessions.keys()].filter(k => k.startsWith(`${owner}:`)).length >= 10) throw new Error('Limite terminali raggiunto');
    if (!['powershell', 'cmd'].includes(profile)) throw new Error('Profilo terminale non valido');
    const process = pty.spawn(profile === 'cmd' ? 'cmd.exe' : 'powershell.exe', profile === 'cmd' ? [] : ['-NoLogo', '-NoProfile'], {
      useConptyDll: true, cwd, cols: 80, rows: 24, name: 'xterm-256color', env: { ...globalThis.process.env, TERM: 'xterm-256color' }
    });
    let finish!: () => void;
    const exited = new Promise<void>(resolve => { finish = resolve; });
    const session = { process, token: randomUUID(), pending: 0, paused: false, exited, killed: false };
    this.sessions.set(key, session);
    process.onData(data => {
      if (this.sessions.get(key) !== session) return;
      session.pending += data.length;
      if (session.pending > 100000 && !session.paused) { process.pause(); session.paused = true; }
      send({ id, token: session.token, data });
    });
    process.onExit(({ exitCode }) => {
      if (!session.killed) { session.killed = true; process.kill(); }
      // node-pty 1.1.0's DLL path leaves its output worker alive on natural exit.
      // Keep this workaround isolated and covered by the packaged runtime test.
      const agent = (process as pty.IPty & { _agent: { _conoutSocketWorker: { dispose(): void } } })._agent;
      agent._conoutSocketWorker.dispose();
      finish();
      if (this.sessions.get(key) === session) this.sessions.delete(key);
      send({ id, token: session.token, exitCode });
    });
    return session.token;
  }
  private get(owner: number, id: string, token: string) {
    const session = this.sessions.get(this.key(owner, id));
    if (!session || session.token !== token) throw new Error('Sessione terminale terminata');
    return session;
  }
  write(owner: number, id: string, token: string, data: string) {
    if (typeof data !== 'string' || data.length > 65536) throw new Error('Input terminale troppo grande');
    this.get(owner, id, token).process.write(data);
  }
  resize(owner: number, id: string, token: string, cols: number, rows: number) {
    if (![cols, rows].every(n => Number.isInteger(n) && n >= 2 && n <= 500)) throw new Error('Dimensioni terminale non valide');
    this.get(owner, id, token).process.resize(cols, rows);
  }
  ack(owner: number, id: string, token: string, count: number) {
    // xterm's write callback may finish after the shell or tab has closed.
    const session = this.sessions.get(this.key(owner, id));
    if (!session || session.token !== token) return;
    if (!Number.isInteger(count) || count < 0 || count > session.pending) throw new Error('Conferma terminale non valida');
    session.pending -= count;
    if (session.paused && session.pending < 10000) { session.process.resume(); session.paused = false; }
  }
  close(owner: number, id: string, token: string) {
    const session = this.get(owner, id, token);
    this.sessions.delete(this.key(owner, id));
    return this.stop(session);
  }
  private stop(session: { process: pty.IPty; paused: boolean; exited: Promise<void>; killed: boolean }) {
    if (session.paused) session.process.resume();
    session.killed = true; session.process.kill();
    // Keep Electron alive until ConPTY has released its helper and pipe handles.
    const stopped = session.exited;
    this.stopping.add(stopped);
    stopped.then(() => this.stopping.delete(stopped));
    return stopped;
  }
  closeOwner(owner: number) {
    for (const [key, session] of this.sessions) if (key.startsWith(`${owner}:`)) {
      this.sessions.delete(key); this.stop(session);
    }
  }
  async closeAll() {
    for (const key of [...this.sessions.keys()]) this.closeOwner(Number(key.split(':')[0]));
    await Promise.allSettled([...this.stopping]);
  }
}
