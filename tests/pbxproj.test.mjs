import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const require = createRequire(import.meta.url), source = require('./fixtures/xcode.cjs');
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'openfruit-pbx-test-'));
const output = path.join(scratch, 'contracts.mjs');
await build({ stdin: { contents: "export * from './electron/pbxproj'; export * from './electron/xcodeGraph'; export * from './electron/xcodeXml'; export * from './electron/xcodeNavigator'; export * from './electron/xcodeWorkspace'; export * from './electron/xcode'; export * from './electron/workspace'; export * from './electron/workspaceAccess'; export * from './electron/fileStore'; export * from './shared/projectSettings';", resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', outfile: output });
const { parseXcodeXml, logicalProjectTree, readXcodeWorkspace, readXcodeSchemes, mutateXcode, xcodeGraph, parsePbx, pbxModel, patchPbx, readXcodeProject, saveXcodeProject, scanDirectoryTree, WorkspaceAccess, readSnapshot, saveSnapshot, projectBuildArgs, defaultProjectSettings } = await import(pathToFileURL(output).href);
after(() => fs.rm(scratch, { recursive: true, force: true }));

test('PBX parses targets, configurations, arrays, conditional keys, packages, phases and future objects', () => {
  const model = pbxModel(source, 'Demo');
  assert.equal(model.project.name, 'Demo'); assert.equal(model.targets.length, 2);
  const app = model.targets[0];
  assert.equal(app.configurations[0].settings.PRODUCT_BUNDLE_IDENTIFIER, 'com.example.demo.debug');
  assert.deepEqual(app.configurations[0].settings.OTHER_SWIFT_FLAGS, ['$(inherited)', '-DDEBUG']);
  assert.equal(app.configurations[0].settings['CODE_SIGN_IDENTITY[sdk=iphoneos*]'], 'Apple Development');
  assert.equal(app.configurations[0].baseConfiguration, 'Config/Debug.xcconfig');
  assert.deepEqual(app.dependencies, ['Widget']);
  assert.match(app.packages[0], /Collections.*swift-collections/);
  assert.deepEqual(app.phases[0].files, ['Source.swift']);
  assert.deepEqual(app.phases[1].files, ['Collections']);
  assert.equal(patchPbx(source, []), source);
});
test('range edits preserve all unrelated text, comments, UUIDs and CRLF; only the selected configuration changes', () => {
  const original = source.replace(/\n/g, '\r\n');
  const expected = original.replace('= com.example.demo.debug;', '= "com.changed.debug";');
  const changed = patchPbx(original, [{ configurationId: 'APP_DEBUG', key: 'PRODUCT_BUNDLE_IDENTIFIER', value: 'com.changed.debug' }]);
  assert.equal(changed, expected);
  const model = pbxModel(changed, 'Demo');
  assert.equal(model.targets[0].configurations[1].settings.PRODUCT_BUNDLE_IDENTIFIER, 'com.example.demo');
  assert.equal(model.targets[1].configurations[0].settings.PRODUCT_BUNDLE_IDENTIFIER, 'com.example.demo.widget');
});
test('PBX inserts/removes overrides and preserves inherited markers, Unicode and arrays', () => {
  const changed = patchPbx(source, [
    { configurationId: 'APP_RELEASE', key: 'DEVELOPMENT_TEAM', value: 'NEWTEAM001' },
    { configurationId: 'APP_DEBUG', key: 'OTHER_SWIFT_FLAGS', value: ['$(inherited)', '-DCOFFEE', 'caffè "quoted"'] },
    { configurationId: 'APP_DEBUG', key: 'DEVELOPMENT_TEAM', value: null }
  ]);
  const app = pbxModel(changed, 'Demo').targets[0];
  assert.equal(app.configurations[1].settings.DEVELOPMENT_TEAM, 'NEWTEAM001');
  assert.equal(app.configurations[0].settings.DEVELOPMENT_TEAM, undefined);
  assert.deepEqual(app.configurations[0].settings.OTHER_SWIFT_FLAGS, ['$(inherited)', '-DCOFFEE', 'caffè "quoted"']);
  assert.ok(changed.includes('payload = <00 ff 12 ab>'));
});
test('PBX rejects malformed syntax, duplicate keys, missing references and edits outside owned configurations', () => {
  for (const malformed of ['{ a = "unterminated; }', '{ a = b }', '{ a = b; a = c; }', '{ a = /* missing', '{ a = (one two); }', '{ data = <bad>; }']) assert.throws(() => parsePbx(malformed));
  assert.throws(() => pbxModel(source.replace('rootObject = PROJECT;', 'rootObject = MISSING;'), 'Demo'));
  assert.throws(() => patchPbx(source, [{ configurationId: 'FUTURE', key: 'x', value: 'y' }]));
  assert.throws(() => patchPbx(source, [{ configurationId: 'APP_DEBUG', key: 'x', value: 42 }]));
});
test('atomic project saves verify revisions, preserve external edits, remain scoped and hide package internals in navigator', async () => {
  const root = path.join(scratch, 'project'); const project = path.join(root, 'Demo.xcodeproj');
  await fs.mkdir(project, { recursive: true }); const file = path.join(project, 'project.pbxproj'); await fs.writeFile(file, source);
  const access = new WorkspaceAccess(scratch); access.activate(root);
  const authorize = file => access.assert(file);
  const initial = await readXcodeProject(project, authorize);
  const saved = await saveXcodeProject(project, initial.revision, [{ configurationId: 'APP_DEBUG', key: 'DEVELOPMENT_TEAM', value: 'NEWTEAM001' }], authorize);
  assert.equal(saved.targets[0].configurations[0].settings.DEVELOPMENT_TEAM, 'NEWTEAM001');
  await assert.rejects(saveXcodeProject(project, initial.revision, [], authorize), /modificato/);
  const external = (await fs.readFile(file, 'utf8')) + '// External edit\n'; await fs.writeFile(file, external);
  await assert.rejects(saveXcodeProject(project, saved.revision, [], authorize), /modificato/);
  assert.equal(await fs.readFile(file, 'utf8'), external);
  const tree = await scanDirectoryTree(root);
  assert.equal(tree.children[0].packageType, 'xcodeproject'); assert.equal(tree.children[0].children, undefined);
  access.clear(); await assert.rejects(readXcodeProject(project, authorize));
});
test('Xcode builds use source bundle identity rather than legacy IDE overrides', () => {
  const args = projectBuildArgs('C:/Project', { ...defaultProjectSettings, bundleId: 'com.legacy.override', displayName: 'Legacy' }, true);
  assert.equal(args.includes('--bundle-id'), false); assert.equal(args.includes('--display-name'), false);
});

test('structured package operations attach products, preserve future objects and remove all package build files', () => {
  const added=mutateXcode(source,{kind:'add-package',url:'https://example.com/a.git',requirement:'exactVersion',version:'1.2.3',product:'Example',targetId:'APP'});
  const graph=xcodeGraph(added), pkg=graph.packages.find(p=>p.url==='https://example.com/a.git');
  assert.ok(pkg);assert.equal(pkg.requirement.version,'1.2.3');
  assert.ok(pbxModel(added,'Demo').targets[0].phases[1].files.includes('Example'));
  const removed=mutateXcode(added,{kind:'remove-package',packageId:pkg.id});
  assert.equal(xcodeGraph(removed).packages.length,1);assert.ok(!removed.includes('Example'));assert.ok(removed.includes('payload = <00 ff 12 ab>'));
});
test('configuration duplication preserves settings and base reference; deletion protects the last configuration',()=>{
  const changed=mutateXcode(source,{kind:'duplicate-configuration',configurationId:'APP_DEBUG',name:'Staging'});
  const config=pbxModel(changed,'Demo').targets[0].configurations.find(c=>c.name==='Staging');
  assert.equal(config.settings.PRODUCT_BUNDLE_IDENTIFIER,'com.example.demo.debug');assert.equal(config.baseConfiguration,'Config/Debug.xcconfig');
  assert.equal(pbxModel(mutateXcode(changed,{kind:'remove-configuration',configurationId:config.id}),'Demo').targets[0].configurations.length,2);
  assert.throws(()=>mutateXcode(source,{kind:'remove-configuration',configurationId:'WIDGET_DEBUG'}),/almeno/);
});
test('target dependency operations reject cycles and scripts round-trip as data without executing',()=>{
  assert.throws(()=>mutateXcode(source,{kind:'target-dependency',targetId:'WIDGET',dependencyId:'APP'}),/ciclo/);
  const changed=mutateXcode(source,{kind:'add-script',targetId:'WIDGET',name:'Check',script:'echo "hello"\nexit 0'});
  const phase=xcodeGraph(changed).targets[1].phases[0];assert.equal(phase.script,'echo "hello"\nexit 0');
  const removed=mutateXcode(changed,{kind:'remove-phase',targetId:'WIDGET',phaseId:phase.id});assert.equal(xcodeGraph(removed).targets[1].phases.length,0);
  assert.throws(()=>mutateXcode(source,{kind:'update-script',targetId:'WIDGET',phaseId:'SCRIPT',name:'X',script:'no'}),/appartenente/);
});

test('logical navigator respects PBX groups, synchronized directories, missing files and scoped external references',async()=>{
  const root=path.join(scratch,'logical'),project=path.join(root,'Demo.xcodeproj');await fs.mkdir(project,{recursive:true});await fs.mkdir(path.join(root,'Sources'));await fs.writeFile(path.join(root,'Sources','Actual.swift'),'// actual');await fs.writeFile(path.join(project,'project.pbxproj'),source);
  const access=new WorkspaceAccess(scratch);access.activate(root);const tree=await logicalProjectTree(project,f=>access.assert(f,true));
  assert.equal(tree.children[0].name,'Source.swift');assert.match(tree.children[0].warning,/mancante/);assert.equal(tree.children[1].children[0].name,'Actual.swift');
});
test('workspace and scheme XML resolves nested groups, shared/user schemes and rejects entities',async()=>{
  const root=path.join(scratch,'workspace'),workspace=path.join(root,'App.xcworkspace'),project=path.join(root,'Demo.xcodeproj');await fs.mkdir(workspace,{recursive:true});await fs.mkdir(project);
  await fs.writeFile(path.join(workspace,'contents.xcworkspacedata'),'<?xml version="1.0"?><Workspace><Group location="group:"><FileRef location="group:Demo.xcodeproj"/></Group></Workspace>');
  const ws=await readXcodeWorkspace(workspace,f=>f);assert.deepEqual(ws.projects,[project]);
  const dir=path.join(project,'xcshareddata','xcschemes');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'App.xcscheme'),'<Scheme><LaunchAction buildConfiguration="Staging"><BuildableReference BlueprintIdentifier="APP" BlueprintName="A &amp; B" ReferencedContainer="container:Demo.xcodeproj"/></LaunchAction></Scheme>');
  const schemes=await readXcodeSchemes(project,f=>f);assert.equal(schemes[0].name,'App');assert.deepEqual(schemes[0].configurations,['Staging']);assert.equal(schemes[0].targets[0].name,'A & B');
  assert.throws(()=>parseXcodeXml('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><Workspace/>'));
  assert.throws(()=>parseXcodeXml('<Workspace><Group></Workspace>'));
});
test('build arguments retain custom configuration and exact qualified target or scheme selection',()=>{
  const args=projectBuildArgs('C:/App',{...defaultProjectSettings,configuration:'Staging',targetId:'APP',targetProject:'C:/App/Demo.xcodeproj'},true);
  assert.deepEqual(args.slice(-4),['--target-id','APP','--target-project','C:/App/Demo.xcodeproj']);assert.ok(args.includes('Staging'));
  assert.throws(()=>projectBuildArgs('C:/App',{...defaultProjectSettings,scheme:'App',targetId:'APP',targetProject:'C:/App/Demo.xcodeproj'},true));
});
