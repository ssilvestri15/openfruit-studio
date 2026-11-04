import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lineReader, terminateProcess } from './openfruit';

export interface TerminalResult {
  success: boolean;
  code: number;
  stdout: string;
  stderr: string;
  cwd: string;
  cancelled?: boolean;
}

// A persistent, non-interactive PowerShell session. This is deliberately not a PTY.
class PowerShellSession {
  private proc: ChildProcessWithoutNullStreams;
  private pending?: { id: string; resolve: (result: TerminalResult) => void };
  private stdout = '';
  private stderr = '';
  private closed = false;
  private cancelled = false;
  private cwd: string;
  private exitedResolve!: () => void;
  private exited = new Promise<void>(resolve => { this.exitedResolve = resolve; });
  constructor(cwd: string, onClose: () => void) {
    this.cwd = cwd;
    const prefix = `__OPENFRUIT_${randomUUID().replace(/-/g, '')}__`;
    const script = `
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding
$ProgressPreference = 'SilentlyContinue'
function __OpenFruitEmit($kind, $text, $code) {
  $record = @{ kind = $kind; id = $script:__ofRequest.id; text = [string]$text; code = $code; cwd = (Get-Location).Path }
  [Console]::WriteLine('${prefix}' + (ConvertTo-Json -InputObject $record -Compress -Depth 4))
}
while ($null -ne ($__ofLine = [Console]::ReadLine())) {
  try {
    $script:__ofRequest = ConvertFrom-Json -InputObject $__ofLine
    $script:__ofOk = $true
    $script:__ofCommandSucceeded = $true
    $global:LASTEXITCODE = 0
    $script:__ofExpression = $script:__ofRequest.command + [Environment]::NewLine + '$script:__ofCommandSucceeded = $?'
    Invoke-Expression $script:__ofExpression 2>&1 | ForEach-Object {
      if ($_ -is [System.Management.Automation.ErrorRecord]) { $script:__ofOk = $false }
      $_
    } | Out-String -Stream -Width 160 | ForEach-Object { __OpenFruitEmit 'output' $_ 0 }
    $__ofCode = if ($script:__ofOk -and $script:__ofCommandSucceeded -and $LASTEXITCODE -eq 0) { 0 } elseif ($LASTEXITCODE -ne 0) { $LASTEXITCODE } else { 1 }
    __OpenFruitEmit 'done' '' $__ofCode
  } catch {
    __OpenFruitEmit 'error' $_.ToString() 1
    __OpenFruitEmit 'done' '' 1
  }
}
`;
    this.proc = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
      cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']
    });
    const reader = lineReader(line => {
      if (!this.pending) return;
      const index = line.indexOf(prefix);
      if (index === -1) { this.stdout = (this.stdout + line + '\n').slice(-262144); return; }
      if (index) this.stdout = (this.stdout + line.slice(0, index)).slice(-262144);
      try {
        const record = JSON.parse(line.slice(index + prefix.length));
        if (record.id !== this.pending.id) return;
        if (record.kind === 'output') this.stdout = (this.stdout + record.text + '\n').slice(-262144);
        if (record.kind === 'error') this.stderr = (this.stderr + record.text + '\n').slice(-262144);
        if (record.kind === 'done') {
          this.cwd = record.cwd;
          this.finish(record.code);
        }
      } catch { this.stderr = (this.stderr + 'Risposta terminale non valida\n').slice(-262144); }
    });
    this.proc.stdout.setEncoding('utf8'); this.proc.stderr.setEncoding('utf8');
    this.proc.stdout.on('data', chunk => reader.write(chunk));
    this.proc.stderr.on('data', chunk => { this.stderr = (this.stderr + chunk).slice(-262144); });
    this.proc.stdin.on('error', error => { this.stderr = error.message; this.stop(); });
    this.proc.once('error', error => { this.stderr = error.message; this.closed = true; this.finish(-1); this.exitedResolve(); onClose(); });
    this.proc.once('close', code => { reader.end(); this.closed = true; this.finish(code ?? -1); this.exitedResolve(); onClose(); });
  }
  private finish(code: number) {
    const pending = this.pending; this.pending = undefined;
    pending?.resolve({ success: code === 0 && !this.cancelled, code, stdout: this.stdout, stderr: this.stderr, cwd: this.cwd, cancelled: this.cancelled });
  }
  run(command: string): Promise<TerminalResult> {
    if (this.pending || this.closed) return Promise.reject(new Error('Sessione terminale occupata o chiusa'));
    this.stdout = ''; this.stderr = '';
    return new Promise(resolve => {
      const id = randomUUID(); this.pending = { id, resolve };
      this.proc.stdin.write(JSON.stringify({ id, command }) + '\n');
    });
  }
  stop() {
    if (this.closed) return this.exited;
    this.closed = true; this.cancelled = true;
    this.finish(130);
    terminateProcess(this.proc);
    return this.exited;
  }
}

export class TerminalManager {
  private sessions = new Map<number, Map<string, PowerShellSession>>();
  private stopping = new Set<Promise<void>>();
  private track(pending: Promise<void>) {
    this.stopping.add(pending);
    pending.then(() => this.stopping.delete(pending));
    return pending;
  }
  async run(owner: number, terminalId: string, cwd: string, command: string) {
    if (typeof terminalId !== 'string' || terminalId.length > 100 || typeof command !== 'string' || command.length > 65536) throw new Error('Comando terminale non valido');
    let sessions = this.sessions.get(owner);
    if (!sessions) { sessions = new Map(); this.sessions.set(owner, sessions); }
    let session = sessions.get(terminalId);
    if (!session) {
      if (sessions.size >= 10) throw new Error('Massimo 10 terminali per finestra');
      session = new PowerShellSession(cwd, () => { if (sessions!.get(terminalId) === session) sessions!.delete(terminalId); });
      sessions.set(terminalId, session);
    }
    return session.run(command);
  }
  close(owner: number, terminalId: string) {
    const sessions = this.sessions.get(owner);
    const session = sessions?.get(terminalId);
    sessions?.delete(terminalId);
    return this.track(session?.stop() || Promise.resolve());
  }
  closeOwner(owner: number) {
    const sessions = this.sessions.get(owner); this.sessions.delete(owner);
    return this.track(Promise.all([...(sessions?.values() || [])].map(session => session.stop())).then(() => {}));
  }
  async closeAll() {
    for (const owner of [...this.sessions.keys()]) this.closeOwner(owner);
    await Promise.all([...this.stopping]);
  }
}
