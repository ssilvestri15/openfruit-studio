import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface EngineEvent {
  schema_version: number;
  kind: string;
  severity: string;
  timestamp: string;
  build_id: string;
  span_id: string;
  parent_span_id: string;
  producer_id: string;
  producer_sequence: number;
  data: Record<string, any>;
}

export type EngineOutput = { stream: 'stdout' | 'stderr'; text: string; event?: EngineEvent };

export function terminateProcess(proc: ChildProcess) {
  if (process.platform === 'win32' && proc.pid) {
    const killer = spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { windowsHide: true });
    killer.on('error', () => proc.kill());
  } else proc.kill();
}

// A pipe chunk may contain half a UTF-8 character, half a record, or many records.
export function lineReader(consume: (line: string) => void) {
  let pending = '';
  return {
    write(chunk: string) {
      pending += chunk;
      let end: number;
      while ((end = pending.indexOf('\n')) !== -1) {
        consume(pending.slice(0, end).replace(/\r$/, ''));
        pending = pending.slice(end + 1);
      }
      // Bound malformed output without a newline; retain it as ordinary text.
      if (pending.length > 1024 * 1024) { consume(pending); pending = ''; }
    },
    end() { if (pending) consume(pending.replace(/\r$/, '')); pending = ''; }
  };
}

export function parseEngineEvent(line: string): EngineEvent | undefined {
  try {
    const value = JSON.parse(line);
    if (value?.schema_version === 1 && typeof value.kind === 'string' &&
        value.data && typeof value.data === 'object' && !Array.isArray(value.data)) return value;
  } catch { /* Human output and future schemas remain visible as text. */ }
}

export function getOpenFruitBinaryPath(): string {
  if (process.env.OPENFRUIT_BIN) return process.env.OPENFRUIT_BIN;
  const root = process.env.OPENFRUIT_HOME || path.join(process.env.LOCALAPPDATA ||
    path.join(process.env.USERPROFILE || '', 'AppData', 'Local'), 'OPENFRUIT');
  return path.join(root, 'bin', 'openfruit.exe');
}

export async function runOpenFruit(args: string[], options: {
  cwd?: string; onOutput?: (output: EngineOutput) => void; signal?: AbortSignal;
} = {}) {
  const bin = getOpenFruitBinaryPath();
  if (!fs.existsSync(bin)) throw new Error(`OpenFruit executable non trovato in: ${bin}`);
  if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string')) throw new Error('Argomenti OpenFruit non validi');
  if (options.signal?.aborted) throw new Error('Operazione annullata');
  return new Promise<{ success: boolean; code: number | null; stdout: string; stderr: string; output: string; cancelled: boolean }>((resolve, reject) => {
    const proc = spawn(bin, args, { cwd: options.cwd, shell: false, windowsHide: true });
    let stdout = '', stderr = '';
    let cancelled = false;
    const reader = (stream: 'stdout' | 'stderr') => lineReader(text => {
      options.onOutput?.({ stream, text, event: stream === 'stdout' ? parseEngineEvent(text) : undefined });
    });
    const out = reader('stdout'), err = reader('stderr');
    proc.stdout.setEncoding('utf8');
    proc.stderr.setEncoding('utf8');
    proc.stdout.on('data', (chunk: string) => { stdout = (stdout + chunk).slice(-1024 * 1024); out.write(chunk); });
    proc.stderr.on('data', (chunk: string) => { stderr = (stderr + chunk).slice(-1024 * 1024); err.write(chunk); });
    const cancel = () => {
      cancelled = true;
      terminateProcess(proc);
    };
    options.signal?.addEventListener('abort', cancel, { once: true });
    proc.once('error', error => {
      options.signal?.removeEventListener('abort', cancel);
      reject(error);
    });
    proc.once('close', code => {
      options.signal?.removeEventListener('abort', cancel);
      out.end(); err.end();
      resolve({ success: code === 0 && !cancelled, code, stdout, stderr, output: stdout || stderr, cancelled });
    });
  });
}

export function normalizeDevices(value: unknown) {
  if (!Array.isArray(value)) throw new Error('Risposta devices non valida: atteso un array JSON');
  return value.filter(d => d && typeof d === 'object' && typeof (d.udid || d.UniqueDeviceID || d.Identifier) === 'string').map(d => ({
    name: d.name || d.DeviceName || 'iPhone',
    udid: d.udid || d.UniqueDeviceID || d.Identifier,
    connection: /network|wifi/i.test(d.connection || d.ConnectionType || '') ? 'network' : 'usb',
    iosVersion: d.iosVersion || d.ProductVersion || '',
    model: d.model || d.ProductType || 'iPhone',
    connected: d.connected !== false
  }));
}
