// A result belongs to both a workspace generation and the latest request of its kind.
export class WorkspaceRequests {
  private generation = 0;
  private path = '';
  private requests = new Map<string, number>();
  get currentPath() { return this.path; }
  switchTo(path: string) {
    this.path = path.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
    this.generation++;
    this.requests.clear();
    return this.ticket('workspace');
  }
  matches(path: string) {
    return this.path === path.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
  }
  ticket(kind: string) {
    const generation = this.generation;
    const sequence = (this.requests.get(kind) || 0) + 1;
    this.requests.set(kind, sequence);
    return () => generation === this.generation && sequence === this.requests.get(kind);
  }
}
