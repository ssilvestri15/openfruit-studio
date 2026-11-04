export interface SdkRegistration { version: string; path: string; selected: boolean; usable: boolean }
export interface EnvironmentSnapshot {
  cliPath: string; home: string; cachePath: string; sdks: SdkRegistration[];
  git: { binary: string; name: string; email: string; version: string };
}
export type EnvironmentAction = 'sdk-select' | 'sdk-remove' | 'sdk-download' | 'sdk-catalog' | 'doctor' | 'auth-login' | 'cache-status';
export interface EnvironmentResult { success: boolean; output: string; error?: string; cancelled?: boolean }
