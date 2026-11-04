import path from 'node:path';
import { getOpenFruitBinaryPath, parseEngineEvent, runOpenFruit } from './openfruit';
import { execGit } from './git';
import type { EnvironmentAction, EnvironmentSnapshot, SdkRegistration } from '../shared/environment';

export function parseSdkInventory(output: string): SdkRegistration[] {
  const event = output.split(/\r?\n/).map(parseEngineEvent).find(event => event?.kind === 'sdk.list.snapshot');
  if (!event || !Array.isArray(event.data.entries)) throw new Error('Inventario SDK non disponibile nel formato del motore');
  return event.data.entries.map((item: any) => {
    if (typeof item.version !== 'string' || typeof item.path !== 'string') throw new Error('Registrazione SDK non valida');
    return { version: item.version, path: item.path, selected: item.selected === true, usable: item.layout?.usable === true };
  });
}
export async function environmentSnapshot(): Promise<EnvironmentSnapshot> {
  const home = process.env.OPENFRUIT_HOME || path.join(process.env.LOCALAPPDATA || '', 'OPENFRUIT');
  const [sdk, name, email, version, binary] = await Promise.all([
    runOpenFruit(['sdk', 'list', '--diagnostics=json'], { signal: AbortSignal.timeout(15000) }),
    execGit(process.cwd(), ['config', '--global', '--get', 'user.name']),
    execGit(process.cwd(), ['config', '--global', '--get', 'user.email']),
    execGit(process.cwd(), ['--version']),
    execGit(process.cwd(), ['--exec-path'])
  ]);
  if (!sdk.success) throw new Error(sdk.stderr || 'Inventario SDK non leggibile');
  return { cliPath: getOpenFruitBinaryPath(), home, cachePath: path.join(process.env.OPENFRUIT_USER_STATE || path.join(process.env.USERPROFILE || '', '.openfruit'), 'cache'),
    sdks: parseSdkInventory(sdk.stdout), git: { binary: binary.stdout.trim(), name: name.stdout.trim(), email: email.stdout.trim(), version: version.stdout.trim() } };
}
export function environmentArguments(action: EnvironmentAction, value?: string): string[] {
  if (['sdk-select', 'sdk-remove', 'sdk-download'].includes(action)) {
    if (typeof value !== 'string' || !/^\d+(?:\.\d+){0,2}$/.test(value)) throw new Error('Versione SDK/Xcode non valida');
    return ['sdk', action.slice(4), value, '--diagnostics=json'];
  }
  const args: Partial<Record<EnvironmentAction, string[]>> = {
    'sdk-catalog': ['sdk', 'catalog'], doctor: ['doctor'], 'auth-login': ['auth', 'login'], 'cache-status': ['cache', 'status']
  };
  if (!args[action]) throw new Error('Operazione ambiente non supportata');
  return [...args[action]!, '--diagnostics=json'];
}
