import fs from 'node:fs';
import path from 'node:path';

function absolute(value: string) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0')) throw new Error('Percorso assoluto non valido');
  return path.resolve(value);
}
function inside(root: string, target: string) {
  const relative = path.relative(root, target);
  return !relative || relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}
// Resolve existing ancestors too: a new file under an escaping junction is outside.
function canonical(value: string): string {
  let current = value;
  const suffix: string[] = [];
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) throw new Error('Percorso non disponibile');
    suffix.unshift(path.basename(current)); current = parent;
  }
  return path.join(fs.realpathSync(current), ...suffix);
}

export class WorkspaceAccess {
  private grants = new Map<string, string>();
  private roots: Array<{ lexical: string; canonical: string }> = [];
  private opening = 0;
  private files = new Map<string,string>();
  grantFile(value:string) { const file=absolute(value);this.files.set(file,canonical(file));return file; }
  grantedFiles() {return [...this.files.keys()];}
  activePath = '';
  constructor(defaultProjects: string) { this.grant(defaultProjects); }
  grant(value: string) {
    const root = absolute(value);
    this.grants.set(root, canonical(root));
  }
  assertGranted(value: string) {
    const target = absolute(value), real = canonical(target);
    if (![...this.grants].some(([root, realRoot]) => inside(root, target) && inside(realRoot, real))) {
      throw new Error('Cartella non autorizzata: selezionala con Sfoglia o Apri progetto');
    }
    return target;
  }
  beginOpen(value: string) {
    const target = this.assertGranted(value), sequence = ++this.opening;
    return { target, current: () => sequence === this.opening };
  }
  activate(value: string, repository?: string) {
    const target = this.assertGranted(value);
    this.activePath = target;
    this.roots = [target, ...(repository ? [absolute(repository)] : [])].map(lexical => ({ lexical, canonical: canonical(lexical) }));
  }
  clear() { this.opening++; this.roots = []; this.files.clear(); this.activePath = ''; }
  assert(value: string, allowRoot = false) {
    const target = absolute(value), real = canonical(target);
    const matching = this.roots.filter(root => inside(root.lexical, target) && inside(root.canonical, real));
    if (!matching.length && this.files.get(target) === real) return target;
    if (!matching.length) throw new Error('Operazione fuori dal workspace aperto');
    if (!allowRoot && this.roots.some(root => inside(target, root.lexical) || inside(real, root.canonical))) {
      throw new Error('Operazione non consentita sulla cartella radice');
    }
    return target;
  }
}
