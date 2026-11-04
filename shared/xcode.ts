export type BuildSetting = string | string[];
export interface XcodeConfiguration {
  id: string; name: string; settings: Record<string, BuildSetting>; baseConfiguration?: string;
}
export interface XcodeTarget {
  id: string; name: string; kind: string; configurations: XcodeConfiguration[];
  dependencies: string[]; packages: string[];
  phases: Array<{ id: string; name: string; files: string[] }>;
}
export interface XcodeProjectSnapshot {
  path: string; file: string; revision: string; name: string;
  project: XcodeTarget; targets: XcodeTarget[];
  graph?: XcodeGraph;
}
export interface XcodeEdit { configurationId: string; key: string; value: BuildSetting | null }
export interface XcodeBridge {
  mutateXcodeProject(path: string, revision: string, operation: XcodeOperation): Promise<XcodeProjectSnapshot>;
  readXcodeProject(path: string): Promise<XcodeProjectSnapshot>;
  saveXcodeProject(path: string, revision: string, edits: XcodeEdit[]): Promise<XcodeProjectSnapshot>;
}

export type XcodeOperation =
  | { kind:'create-target'; name:string; bundleId:string; productType:'application'|'framework'|'app-extension' }
  | { kind:'duplicate-target'; targetId:string; name:string; bundleId:string }
  | { kind:'remove-target'; targetId:string }
  | { kind:'phase-order'; targetId:string; phaseIds:string[] }
  | { kind: 'add-file'; filePath:string; targetId:string; phase:'sources'|'resources'|'frameworks' }
  | { kind: 'remove-file-reference'; fileId:string }
  | { kind: 'file-membership'; fileId:string; targetId:string; phase:'sources'|'resources'|'frameworks'; remove?:boolean }
  | { kind: 'add-package'; url: string; requirement: 'upToNextMajorVersion' | 'exactVersion' | 'branch' | 'revision'; version: string; product: string; targetId: string }
  | { kind: 'remove-package'; packageId: string }
  | { kind: 'target-dependency'; targetId: string; dependencyId: string; remove?: boolean }
  | { kind: 'duplicate-configuration'; configurationId: string; name: string }
  | { kind: 'remove-configuration'; configurationId: string }
  | { kind: 'add-script'; targetId: string; name: string; script: string }
  | { kind: 'update-script'; targetId: string; phaseId: string; name: string; script: string }
  | { kind: 'remove-phase'; targetId: string; phaseId: string };
export interface XcodePackage { id: string; url: string; requirement: Record<string,string> }
export interface XcodeGraph {
  files?: Array<{id:string;path:string;name:string;memberships:Array<{targetId:string;phaseId:string}>}>;
  packages: XcodePackage[];
  targets: Array<{id:string;name:string;dependencies:Array<{id:string;targetId:string;name:string}>;phases:Array<{id:string;name:string;kind:string;script?:string}>}>;
}
