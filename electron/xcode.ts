import { xcodeGraph, mutateXcode } from './xcodeGraph';
import type { XcodeOperation } from '../shared/xcode';
import path from 'node:path';
import { readSnapshot, saveSnapshot } from './fileStore';
import { pbxModel, patchPbx } from './pbxproj';
import type { XcodeEdit, XcodeProjectSnapshot } from '../shared/xcode';

export async function readXcodeProject(project: string, authorize: (file: string) => string): Promise<XcodeProjectSnapshot> {
  if (typeof project !== 'string' || !project.toLowerCase().endsWith('.xcodeproj')) throw new Error('Seleziona un progetto .xcodeproj');
  const file = authorize(path.join(project, 'project.pbxproj'));
  const snapshot = await readSnapshot(file), name = path.basename(project, '.xcodeproj');
  const model = pbxModel(snapshot.content, name);
  return { path: project, file, revision: snapshot.revision, name, project: model.project, targets: model.targets, graph: xcodeGraph(snapshot.content) };
}
export async function saveXcodeProject(project: string, expected: string, edits: XcodeEdit[], authorize: (file: string) => string) {
  if (typeof expected !== 'string' || !expected) throw new Error('Revisione progetto mancante');
  const before = await readXcodeProject(project, authorize);
  if (before.revision !== expected) throw new Error('Progetto modificato sul disco: le modifiche restano nella schermata. Ricarica il progetto prima di salvare.');
  const source = await readSnapshot(authorize(before.file));
  if (source.revision !== expected) throw new Error('Progetto modificato durante la lettura: riprova');
  const content = patchPbx(source.content, edits);
  const result = await saveSnapshot(before.file, content, expected, () => { authorize(before.file); }, true);
  if (!result.success) throw new Error(result.error || 'Salvataggio progetto fallito');
  return readXcodeProject(project, authorize);
}

export async function mutateXcodeProject(project: string, expected: string, operation: XcodeOperation, authorize: (file:string)=>string) {
  const before = await readXcodeProject(project, authorize);
  if (typeof expected !== 'string' || before.revision !== expected) throw new Error('Progetto modificato sul disco: ricarica prima di procedere');
  const source = await readSnapshot(authorize(before.file));
  if (source.revision !== expected) throw new Error('Progetto modificato durante la lettura');
  if (operation?.kind === 'add-file') { const target = authorize(path.resolve(path.dirname(project),operation.filePath)); const stat = await import('node:fs/promises').then(fs=>fs.stat(target)); if(!stat.isFile())throw new Error('Seleziona un file esistente sul disco'); }
  const content = mutateXcode(source.content, operation);
  const result = await saveSnapshot(before.file, content, expected, () => { authorize(before.file); });
  if (!result.success) throw new Error(result.error || 'Salvataggio fallito');
  return readXcodeProject(project, authorize);
}
