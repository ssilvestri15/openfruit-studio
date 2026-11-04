import { readXcodeWorkspace, readXcodeSchemes } from './xcodeWorkspace';
import { pbxModel } from './pbxproj';
import { readTextFile } from './workspace';
import fs from 'node:fs/promises';
import path from 'node:path';
import { readSnapshot, revision } from './fileStore';
import { writeJsonAtomic } from './persistence';
import { scanDirectoryTree } from './workspace';
import { defaultProjectSettings, validateProjectSettings, type ProjectSettings, type ProjectSettingsSnapshot } from '../shared/projectSettings';

const pending = new Map<string, Promise<unknown>>();
const settingsPath = (root: string) => path.join(root, '.openfruit-studio.json');
export async function readProjectSettings(root: string, authorize: (file: string) => string): Promise<ProjectSettingsSnapshot> {
  const file = authorize(settingsPath(root));
  let settings = { ...defaultProjectSettings }, hash: string | null = null;
  try {
    const snapshot = await readSnapshot(file);
    settings = validateProjectSettings(JSON.parse(snapshot.content)); hash = snapshot.revision;
  } catch (error: any) { if (error.code !== 'ENOENT') throw error; }
  const candidates = ['Package.swift', 'Podfile', 'Cartfile'].map(name => path.join(root, name));
  const xcodeProjects: string[] = [], workspacePaths: string[] = [];
  const collect = (node: { path: string; packageType?: string; children?: any[] }) => {
    if (node.packageType === 'xcodeproject') {
      try { authorize(path.join(node.path, 'project.pbxproj')); xcodeProjects.push(node.path); } catch { /* Scope checks apply to discovered projects too. */ }
    }
    if (node.path.toLowerCase().endsWith('.xcworkspace') && !node.path.toLowerCase().includes('.xcodeproj')) workspacePaths.push(node.path);
    for (const child of node.children || []) collect(child);
  };
  collect(await scanDirectoryTree(root));
  const manifests: string[] = [];
  for (const candidate of candidates) {
    try { const file = authorize(candidate); if ((await fs.stat(file)).isFile()) manifests.push(file); }
    catch (error: any) { if (error.code !== 'ENOENT') continue; }
  }
  const workspaces = await Promise.all(workspacePaths.map(p=>readXcodeWorkspace(p,authorize)));
  for (const ws of workspaces) for (const project of ws.projects) if (!xcodeProjects.includes(project)) xcodeProjects.push(project);
  const schemes = (await Promise.all([...workspacePaths,...xcodeProjects].map(p=>readXcodeSchemes(p,authorize)))).flat();
  const buildTargets = (await Promise.all(xcodeProjects.map(async project=>{
    try { const m=pbxModel(await readTextFile(authorize(path.join(project,'project.pbxproj'))),path.basename(project,'.xcodeproj'));
    return m.targets.map(t=>({id:t.id,project,name:t.name,configurations:t.configurations.map(c=>c.name)})); } catch { return []; }
  }))).flat();
  return { settings, revision: hash, manifests, xcodeProjects, workspaces, schemes, buildTargets };
}
export function saveProjectSettings(root: string, value: ProjectSettings, expected: string | null, authorize: (file: string) => string) {
  const file = authorize(settingsPath(root));
  const key = file.toLowerCase();
  const next = (pending.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
    const settings = validateProjectSettings(value);
    if (settings.scheme) authorize(settings.scheme);
    if (settings.targetProject) authorize(settings.targetProject);
    const before = await readProjectSettings(root, authorize);
    if (expected !== before.revision) throw new Error('Configurazione modificata sul disco: riapri la schermata prima di salvare');
    authorize(file);
    await writeJsonAtomic(file, settings);
    return { settings, revision: revision(JSON.stringify(settings, null, 2)), manifests: before.manifests, xcodeProjects: before.xcodeProjects, schemes: before.schemes, workspaces: before.workspaces, buildTargets: before.buildTargets };
  });
  pending.set(key, next);
  next.then(() => { if (pending.get(key) === next) pending.delete(key); }, () => { if (pending.get(key) === next) pending.delete(key); });
  return next;
}
export async function drainProjectSettings() { await Promise.allSettled([...pending.values()]); }
