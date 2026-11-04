export interface ProjectSettings {
  bundleId: string;
  displayName: string;
  teamId: string;
  certificatePath: string;
  provisioningProfilePath: string;
  configuration: string;
  scheme: string;
  targetId: string;
  targetProject: string;
  sdkVersion: string;
  jobs: number;
}
export const defaultProjectSettings: ProjectSettings = {
  bundleId: '', displayName: '', teamId: '', certificatePath: '', provisioningProfilePath: '',
  configuration: 'debug', scheme: '', targetId: '', targetProject: '', sdkVersion: '', jobs: 0
};
export interface ProjectSettingsSnapshot {
  settings: ProjectSettings;
  revision: string | null;
  manifests: string[];
  xcodeProjects: string[];
  workspaces?: Array<{path:string;projects:string[];warnings:string[]}>;
  schemes?: Array<{name:string;path:string;container:string;configurations:string[]}>;
  buildTargets?: Array<{id:string;project:string;name:string;configurations:string[]}>;
}
export interface ProjectSettingsBridge {
  readProjectSettings(root: string): Promise<ProjectSettingsSnapshot>;
  saveProjectSettings(root: string, settings: ProjectSettings, revision: string | null): Promise<ProjectSettingsSnapshot>;
}
export function validateProjectSettings(value: unknown): ProjectSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Configurazione progetto non valida');
  const result = { ...defaultProjectSettings, ...value } as ProjectSettings;
  for (const key of ['bundleId', 'displayName', 'teamId', 'certificatePath', 'provisioningProfilePath', 'sdkVersion', 'scheme', 'targetId', 'targetProject', 'configuration'] as const) {
    if (typeof result[key] !== 'string' || result[key].length > 4096 || /[\x00-\x1f]/.test(result[key])) throw new Error(`Valore non valido: ${key}`);
    result[key] = result[key].trim();
  }
  if (result.bundleId && !/^([A-Za-z0-9-]+\.)+[A-Za-z0-9-]+$/.test(result.bundleId)) throw new Error('Bundle ID non valido');
  if (result.teamId && !/^[A-Z0-9]{10}$/.test(result.teamId)) throw new Error('Il Team ID deve contenere 10 caratteri maiuscoli o numeri');
  if (result.sdkVersion && !/^\d+(?:\.\d+){0,2}$/.test(result.sdkVersion)) throw new Error('Versione SDK non valida');
  if (!result.configuration || result.configuration.length > 256 || result.scheme && result.targetId || result.targetId && !result.targetProject || result.targetProject && !result.targetId) throw new Error('Configurazione build non valida');
  if (!Number.isInteger(result.jobs) || result.jobs < 0 || result.jobs > 256) throw new Error('Processi paralleli: scegli un numero da 0 a 256');
  // Keep the persisted schema explicit; never accept arbitrary command arguments.
  return Object.fromEntries(Object.keys(defaultProjectSettings).map(key => [key, result[key as keyof ProjectSettings]])) as unknown as ProjectSettings;
}
export function projectBuildArgs(root: string, settings: ProjectSettings, nativeXcode = false) {
  const s = validateProjectSettings(settings);
  const args = ['build', root, '--configuration', s.configuration, '--diagnostics=json'];
  if (!nativeXcode) {
    if (s.bundleId) args.push('--bundle-id', s.bundleId);
    if (s.displayName) args.push('--display-name', s.displayName);
  }
  for (const [flag, value] of [['--p12', s.certificatePath], ['--provision', s.provisioningProfilePath], ['--sdk-version', s.sdkVersion]]) if (value) args.push(flag, value);
  if (s.scheme) args.push('--scheme', s.scheme);
  if (s.targetId) args.push('--target-id', s.targetId, '--target-project', s.targetProject);
  if (s.jobs) args.push('-j', String(s.jobs));
  return args;
}
