import { spawn } from 'node:child_process';
import path from 'node:path';
import { terminateProcess } from './openfruit';

export interface GitResult { code: number; stdout: string; stderr: string; cancelled?: boolean }
export interface GitOptions { signal?: AbortSignal; input?: string }

export async function gitRoot(cwd: string, options: GitOptions = {}) {
  const result = await execGit(cwd, ['rev-parse', '--show-toplevel'], options);
  if (result.code !== 0 || !result.stdout.trim()) throw new Error(result.stderr || 'Repository Git non trovato');
  return path.resolve(result.stdout.trim());
}

export async function execRepositoryGit(cwd: string, args: string[], options: GitOptions = {}) {
  return execGit(await gitRoot(cwd, options), args, options);
}

export function execGit(cwd: string, args: string[], options: GitOptions = {}): Promise<GitResult> {
  if (options.signal?.aborted) return Promise.resolve({ code: 130, stdout: '', stderr: '', cancelled: true });
  return new Promise(resolve => {
    const proc = spawn('git', args, { cwd, shell: false, windowsHide: true });
    if (options.input !== undefined) { proc.stdin.on('error', () => {}); proc.stdin.end(options.input); }
    let stdout = '', stderr = '';
    let overflow = false;
    let cancelled = false;
    const abort = () => { cancelled = true; terminateProcess(proc); };
    options.signal?.addEventListener('abort', abort, { once: true });
    proc.stdout.setEncoding('utf8'); proc.stderr.setEncoding('utf8');
    proc.stdout.on('data', chunk => {
      stdout += chunk;
      if (stdout.length > 8 * 1024 * 1024 && !overflow) { stdout = stdout.slice(0, 8 * 1024 * 1024); overflow = true; terminateProcess(proc); }
      if (overflow) stdout = stdout.slice(0, 8 * 1024 * 1024);
    });
    proc.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-1024 * 1024); });
    proc.once('error', error => {
      options.signal?.removeEventListener('abort', abort);
      resolve({ code: cancelled ? 130 : -1, stdout, stderr: error.message, cancelled });
    });
    proc.once('close', code => {
      options.signal?.removeEventListener('abort', abort);
      resolve({ code: cancelled ? 130 : overflow ? -1 : code ?? -1, stdout, stderr: overflow ? 'Output Git superiore a 8 MB: limita le modifiche nel repository' : stderr, cancelled });
    });
  });
}

// -z preserves Unicode, spaces, quotes, and renames without Git's quoted-path escaping.
export function parseGitStatus(raw: string) {
  const stagedFiles: any[] = [], unstagedFiles: any[] = [], untrackedFiles: string[] = [];
  const records = raw.split('\0');
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (record.length < 4) continue;
    const [x, y] = record;
    const filename = record.slice(3);
    if (x === 'R' || x === 'C' || y === 'R' || y === 'C') i++; // old path follows the new path in -z.
    if (x === '?' && y === '?') {
      unstagedFiles.push({ filename, status: 'untracked', isStaged: false });
      untrackedFiles.push(filename);
      continue;
    }
    if (x !== ' ' && x !== '?') stagedFiles.push({ filename, status: x === 'A' ? 'added' : x === 'D' ? 'deleted' : 'modified', isStaged: true });
    if (y !== ' ' && y !== '?') unstagedFiles.push({ filename, status: y === 'D' ? 'deleted' : 'modified', isStaged: false });
  }
  return { stagedFiles, unstagedFiles, untrackedFiles };
}
