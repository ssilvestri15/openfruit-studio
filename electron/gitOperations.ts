import type { GitOperation, GitOperationResult } from '../shared/git';
import type { GitResult } from './git';

export class GitOperations {
  private owners = new Map<number, { operation: GitOperation; controller: AbortController }>();
  private pending = new Set<Promise<GitOperationResult>>();
  run(owner: number, operation: GitOperation, execute: (signal: AbortSignal) => Promise<GitResult>): Promise<GitOperationResult> {
    if (this.owners.has(owner)) return Promise.resolve({ success: false, code: -1, output: '', error: 'Un’operazione Git di rete è già in corso in questa finestra', cancelled: false });
    const controller = new AbortController();
    this.owners.set(owner, { operation, controller });
    const result = (async (): Promise<GitOperationResult> => {
      try {
        const command = await execute(controller.signal);
        const cancelled = controller.signal.aborted || !!command.cancelled;
        return { success: command.code === 0 && !cancelled, code: cancelled ? 130 : command.code,
          output: command.stdout + command.stderr, cancelled };
      } catch (error: any) {
        return { success: false, code: controller.signal.aborted ? 130 : -1, output: '', error: error.message, cancelled: controller.signal.aborted };
      } finally {
        if (this.owners.get(owner)?.controller === controller) this.owners.delete(owner);
      }
    })();
    this.pending.add(result);
    result.then(() => this.pending.delete(result));
    return result;
  }
  cancel(owner: number, operation: GitOperation) {
    const active = this.owners.get(owner);
    if (!active || active.operation !== operation) return false;
    active.controller.abort(); return true;
  }
  cancelOwner(owner: number) { this.owners.get(owner)?.controller.abort(); }
  async closeAll() {
    for (const owner of this.owners.keys()) this.cancelOwner(owner);
    await Promise.all([...this.pending]);
  }
}
