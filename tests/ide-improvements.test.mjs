import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire as moduleRequire} from 'node:module';
import {build} from 'esbuild';
const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'openfruit-improvements-'));
const output=path.join(scratch,'contracts.cjs');
await build({stdin:{contents:"export * from './electron/xcconfig';export * from './electron/gitHunks';export * from './electron/reports';export * from './shared/device';export * from './electron/xcodeFileChanges';export * from './electron/xcodeGraph';export * from './electron/persistence';export * from './electron/search';export * from './electron/workspace';export * from './electron/fileStore';export * from './shared/preferences';export * from './electron/scaffold';export * from './electron/pbxproj';export * from './electron/git';export * from './electron/repository';export * from './electron/xcodeWorkspace';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',outfile:output});
const require=moduleRequire(import.meta.url),api=require(output),fixture=require('./fixtures/xcode.cjs');
after(()=>fs.rm(scratch,{recursive:true,force:true}));
test('strict UTF8 retains BOM and rejects legacy byte sequences before any save',async()=>{
 const file=path.join(scratch,'encoding.swift');await fs.writeFile(file,Buffer.from([0xef,0xbb,0xbf,0x61,0x0d,0x0a]));assert.equal(await api.readTextFile(file),'\ufeffa\r\n');
 await fs.writeFile(file,Buffer.from([0x63,0x61,0x66,0xe8]));await assert.rejects(api.readTextFile(file),/UTF-8/);
});
test('workspace worker searches Unicode, excludes generated files, caps results and revision-checks replacements',async()=>{
 const root=path.join(scratch,'search');await fs.mkdir(root);await fs.mkdir(path.join(root,'node_modules'));await fs.writeFile(path.join(root,'one.swift'),'caffè one\ncaffè two');await fs.writeFile(path.join(root,'node_modules','skip.swift'),'caffè');
 const service=new api.WorkspaceSearch();try{
 const result=await service.search(1,{root,query:'caffè',wholeWord:true});assert.equal(result.matches.length,2);assert.equal(result.matches[1].line,2);assert.equal(result.matches[1].column,1);
 const limited=await service.search(1,{root,query:'caffè',limit:1});assert.equal(limited.truncated,true);
 const file={path:result.matches[0].path,revision:result.matches[0].revision,matches:result.matches.map(m=>({start:m.start,end:m.end}))};
 await fs.writeFile(file.path,'external edit');await assert.rejects(api.replaceSearchResults([file],'coffee',f=>f),/modificato/);assert.equal(await fs.readFile(file.path,'utf8'),'external edit');
 const fresh=await service.search(1,{root,query:'external'});await api.replaceSearchResults([{path:file.path,revision:fresh.matches[0].revision,matches:[{start:0,end:8}]}],'safe',f=>f);assert.equal(await fs.readFile(file.path,'utf8'),'safe edit');
 await assert.rejects(service.search(1,{root,query:'[',regex:true}));
 }finally{service.closeAll();}
});
test('xcconfig resolves includes, conditional values, inherited arrays, variables and rejects cycles',async()=>{
 const root=path.join(scratch,'config'),project=path.join(root,'Demo.xcodeproj');await fs.mkdir(path.join(root,'Config'),{recursive:true});
 await fs.writeFile(path.join(root,'Config','Base.xcconfig'),'BASE = example\nFLAGS = -DBASE\n');
 await fs.writeFile(path.join(root,'Config','Debug.xcconfig'),'#include "Base.xcconfig"\n#include? "Missing.xcconfig"\nSUFFIX = debug\nCUSTOM = $(BASE).$(SUFFIX)\nFLAGS = $(inherited) -DAPP\nSETTING[sdk=iphoneos*] = phone\nSETTING[sdk=iphonesimulator*] = simulator\n');
 const result=await api.resolveXcodeSettings(fixture,project,'APP','APP_DEBUG',f=>f);
 assert.equal(result.values.CUSTOM,'example.debug');assert.equal(result.values.FLAGS,'-DBASE -DAPP');assert.equal(result.values.SETTING,'phone');assert.equal(result.values.PRODUCT_NAME,'Demo');assert.equal(result.values.DEVELOPMENT_TEAM,'APPTEAM001');
 await fs.writeFile(path.join(root,'Config','Base.xcconfig'),'#include "Debug.xcconfig"');await assert.rejects(api.resolveXcodeSettings(fixture,project,'APP','APP_DEBUG',f=>f),/ciclico/);
});
test('native template uses valid UUIDs and does not alter names matching object identifiers',async()=>{
 for(const name of ['Demo','APP','PROJECT']){const files=api.nativeProjectFiles(name,'com.example.app','18.0'),pbx=files[name+'.xcodeproj/project.pbxproj'],model=api.pbxModel(pbx,name);assert.equal(model.targets[0].name,name);assert.match(model.targets[0].id,/^[A-F0-9]{24}$/);assert.equal(model.targets[0].configurations[0].settings.INFOPLIST_FILE,name+'/Info.plist');}
 const root=path.join(scratch,'scaffold');await api.createScaffold(root,{'Demo/file.swift':'hello','Demo.xcodeproj/project.pbxproj':'project'},f=>f);assert.equal(await fs.readFile(path.join(root,'Demo','file.swift'),'utf8'),'hello');assert.ok(!(await fs.readdir(root)).some(f=>f.startsWith('.openfruit-create-')));
 await assert.rejects(api.createScaffold(root,{'overwrite':'x'},f=>f),/vuota/);
 const unsafe=path.join(scratch,'unsafe');await assert.rejects(api.createScaffold(unsafe,{'../escape':'bad'},f=>f));assert.deepEqual(await fs.readdir(unsafe),[]);
});
test('preferences validate bounds, reject arbitrary enum values and ignore unknown persisted fields',()=>{
 assert.equal(api.validatePreferences({...api.defaultPreferences,fontSize:18,extra:'discard'}).fontSize,18);assert.equal('extra' in api.validatePreferences({extra:'discard'}),false);
 assert.equal(api.validatePreferences({}).language,'it');
 assert.equal(api.validatePreferences({language:'en'}).language,'en');
 for(const bad of [{fontSize:300},{autoSave:'always'},{theme:'other'},{language:'fr'},{tabSize:0},{wordWrap:'true'}])assert.throws(()=>api.validatePreferences({...api.defaultPreferences,...bad}));
});
test('repository management operates on temporary repository with qualified refs, safe arguments and paginated history',async()=>{
 const root=path.join(scratch,'git');await fs.mkdir(root);const run=async args=>{const r=await api.execGit(root,args);assert.equal(r.code,0,r.stderr);return r;};
 await run(['init','-b','main']);await run(['config','user.name','Test']);await run(['config','user.email','test@example.invalid']);await fs.writeFile(path.join(root,'source.swift'),'one');await run(['add','.']);await run(['commit','-m','initial']);
 await run(await api.repositoryArgs(root,{kind:'create-branch',branch:'feature'}));let info=await api.repositoryInfo(root);assert.equal(info.branches.find(b=>b.current).name,'feature');
 await run(await api.repositoryArgs(root,{kind:'switch',branch:'main'}));info=await api.repositoryInfo(root);assert.equal(info.branches.find(b=>b.current).name,'main');
 await assert.rejects(api.repositoryArgs(root,{kind:'create-branch',branch:'--orphan'}));await assert.rejects(api.repositoryArgs(root,{kind:'add-remote',name:'origin',url:'https://user:secret@example.com/repo'}));
 const history=await api.repositoryHistory(root,0);assert.equal(history.length,1);assert.match(await api.repositoryCommit(root,history[0].hash),/initial/);assert.deepEqual(await api.repositoryHistory(root,50),[]);
});

test('physical file changes update PBX groups and build files; failed disk mutation restores metadata',async()=>{
 const root=path.join(scratch,'coordinated'),project=path.join(root,'Demo.xcodeproj');await fs.mkdir(project,{recursive:true});const file=path.join(project,'project.pbxproj');await fs.writeFile(file,fixture);await fs.writeFile(path.join(root,'Source.swift'),'source');
 const changed=api.patchFileReferences(fixture,project,path.join(root,'Source.swift'),path.join(root,'Renamed.swift'));assert.equal(api.pbxModel(changed,'Demo').targets[0].phases[0].files[0],'Renamed.swift');
 const removed=api.patchFileReferences(fixture,project,path.join(root,'Source.swift'),null);assert.equal(api.pbxModel(removed,'Demo').targets[0].phases[0].files.length,0);assert.ok(!removed.includes('SOURCE_BUILD ='));
 await assert.rejects(api.withProjectFileChange(root,path.join(root,'Source.swift'),path.join(root,'New.swift'),f=>f,async()=>{throw new Error('disk failed');}),/disk failed/);assert.equal(await fs.readFile(file,'utf8'),fixture);
 await api.withProjectFileChange(root,path.join(root,'Source.swift'),path.join(root,'New.swift'),f=>f,()=>fs.rename(path.join(root,'Source.swift'),path.join(root,'New.swift')));assert.equal(api.pbxModel(await fs.readFile(file,'utf8'),'Demo').targets[0].phases[0].files[0],'New.swift');
});
test('file membership updates only the selected target and reference removal preserves unrelated objects',()=>{
 const added=api.mutateXcode(fixture,{kind:'file-membership',fileId:'SOURCE',targetId:'WIDGET',phase:'sources'});assert.deepEqual(api.pbxModel(added,'Demo').targets[1].phases[0].files,['Source.swift']);
 const dropped=api.mutateXcode(added,{kind:'file-membership',fileId:'SOURCE',targetId:'WIDGET',phase:'sources',remove:true});assert.equal(api.pbxModel(dropped,'Demo').targets[1].phases[0].files.length,0);
 const removed=api.mutateXcode(added,{kind:'remove-file-reference',fileId:'SOURCE'});assert.equal(api.pbxModel(removed,'Demo').targets[0].phases[0].files.length,0);assert.equal(api.pbxModel(removed,'Demo').targets[1].phases[0].files.length,0);assert.ok(removed.includes('payload = <00 ff 12 ab>'));
});
test('session persistence keeps recoverable backup without overwriting it with invalid JSON',async()=>{
 const file=path.join(scratch,'session.json');await api.writeJsonAtomic(file,{version:1},true);await api.writeJsonAtomic(file,{version:2},true);await fs.writeFile(file,'{broken');const recovered=await api.readJsonRecover(file);assert.equal(recovered.recovered,true);assert.equal(recovered.value.version,1);
 await api.writeJsonAtomic(file,{version:3},true);assert.equal((await api.readJsonRecover(file)).value.version,3);assert.deepEqual(JSON.parse(await fs.readFile(file+'.bak','utf8')),{version:1});
});

test('hunk staging, unstaging and discarding validate revisions and apply only selected ranges',async()=>{
 const root=path.join(scratch,'hunks');await fs.mkdir(root);const git=async args=>{const r=await api.execGit(root,args);assert.equal(r.code,0,r.stderr);return r.stdout;};
 await git(['init','-b','main']);await git(['config','core.autocrlf','false']);await git(['config','user.name','Test']);await git(['config','user.email','test@example.invalid']);const file=path.join(root,'one.txt'),base=Array.from({length:30},(_,i)=>'line '+i).join('\n')+'\n';await fs.writeFile(file,base);await git(['add','.']);await git(['commit','-m','initial']);
 const modified=base.replace('line 1\n','change 1\n').replace('line 25\n','change 25\n');await fs.writeFile(file,modified);let result=await api.fileHunks(root,'one.txt',false);assert.equal(result.hunks.length,2);
 await api.applyFileHunks(root,'one.txt',false,result.revision,[0]);const index=await git(['show',':one.txt']);assert.ok(index.includes('change 1'));assert.ok(!index.includes('change 25'));
 await assert.rejects(api.applyFileHunks(root,'one.txt',false,result.revision,[0]),/cambiato/);
 result=await api.fileHunks(root,'one.txt',true);await api.applyFileHunks(root,'one.txt',true,result.revision,[0]);assert.equal(await git(['show',':one.txt']),base);
 result=await api.fileHunks(root,'one.txt',false);await api.applyFileHunks(root,'one.txt',false,result.revision,[1],true);assert.equal(await fs.readFile(file,'utf8'),base.replace('line 1\n','change 1\n'));
});
test('device actions preserve exact paths, validate transport/duration and never route to build or sdk',()=>{
 assert.deepEqual(api.deviceArguments({action:'screenshot',udid:'12345678',wifiHost:'iphone.local'},'C:/My Shots/a.png'),['device','screenshot','C:/My Shots/a.png','--wifi','iphone.local','--diagnostics=json']);
 assert.throws(()=>api.deviceArguments({action:'record',udid:'12345678',duration:301},'out'));assert.throws(()=>api.deviceArguments({action:'build',udid:'12345678'}));assert.throws(()=>api.deviceArguments({action:'info',udid:'12345678',wifiHost:'host;whoami'}));
});
test('operation reports retain process outcomes and isolate history by workspace',async()=>{
 const store=new api.OperationReports(path.join(scratch,'reports')),id=await store.save({root:'C:/App',operation:'inspect',success:true,code:0,startedAt:'2026-10-30T00:00:00Z',output:[{text:'example'}]});assert.equal((await store.list('C:/App')).length,1);assert.equal((await store.list('C:/Other')).length,0);assert.equal((await store.read(id)).output[0].text,'example');await assert.rejects(store.read('../escape'));
});
test('shortcut registry rejects collisions and respects modifier combinations exactly',()=>{
 assert.ok(api.shortcutMatches({key:'p',ctrlKey:true,metaKey:false,altKey:true,shiftKey:false},'Ctrl+Alt+P'));
 assert.equal(api.shortcutMatches({key:'p',ctrlKey:true,metaKey:false,altKey:true,shiftKey:false},'Ctrl+P'),false);
 assert.throws(()=>api.validatePreferences({...api.defaultPreferences,keybindings:{...api.defaultPreferences.keybindings,build:'Ctrl+S'}}),/duplicata/);
});

test('target creation, duplication and deletion preserve source membership and enforce target identity',()=>{
 const created=api.mutateXcode(fixture,{kind:'create-target',name:'Library',bundleId:'com.example.library',productType:'framework'}),model=api.pbxModel(created,'Demo');assert.equal(model.targets.length,3);const target=model.targets.find(t=>t.name==='Library');assert.equal(target.configurations[0].settings.PRODUCT_BUNDLE_IDENTIFIER,'com.example.library');assert.equal(target.phases.length,3);
 const duplicated=api.mutateXcode(fixture,{kind:'duplicate-target',targetId:'APP',name:'DemoCopy',bundleId:'com.example.copy'}),copy=api.pbxModel(duplicated,'Demo').targets.find(t=>t.name==='DemoCopy');assert.deepEqual(copy.phases[0].files,['Source.swift']);assert.notEqual(copy.phases[0].id,'SOURCES');assert.notEqual(copy.configurations[0].id,'APP_DEBUG');
 const removed=api.mutateXcode(created,{kind:'remove-target',targetId:target.id});assert.equal(api.pbxModel(removed,'Demo').targets.length,2);assert.ok(removed.includes('payload = <00 ff 12 ab>'));
 assert.throws(()=>api.mutateXcode(fixture,{kind:'create-target',name:'../escape',bundleId:'com.example.a',productType:'application'}));
});

test('deleting a target refuses phases shared with a remaining target',()=>{
 const shared=fixture.replace('buildConfigurationList = WIDGET_LIST; buildPhases = ();','buildConfigurationList = WIDGET_LIST; buildPhases = (SOURCES,);');
 assert.throws(()=>api.mutateXcode(shared,{kind:'remove-target',targetId:'APP'}),/condivisi/);
});
