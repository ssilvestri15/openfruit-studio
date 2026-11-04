import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pbxModel } from './pbxproj';
export function nativeProjectFiles(name:string,bundle:string,ios:string):Record<string,string>{
 const q=JSON.stringify;
 const settings=(debug:boolean)=>`{ PRODUCT_NAME = "$(TARGET_NAME)"; PRODUCT_BUNDLE_IDENTIFIER = ${q(bundle)}; SDKROOT = iphoneos; IPHONEOS_DEPLOYMENT_TARGET = ${q(ios)}; SWIFT_VERSION = 6.0; INFOPLIST_FILE = ${q(name+'/Info.plist')}; TARGETED_DEVICE_FAMILY = "1,2"; CODE_SIGN_STYLE = Automatic; ${debug?'SWIFT_OPTIMIZATION_LEVEL = "-Onone"; SWIFT_ACTIVE_COMPILATION_CONDITIONS = "DEBUG $(inherited)";':'SWIFT_OPTIMIZATION_LEVEL = "-O";'} }`;
 const source=`// !$*UTF8*$!
{ archiveVersion = 1; classes = {}; objectVersion = 56; objects = {
 PROJECT = { isa = PBXProject; buildConfigurationList = PROJECT_CONFIGS; compatibilityVersion = "Xcode 14.0"; developmentRegion = en; hasScannedForEncodings = 0; knownRegions = (en, Base,); mainGroup = MAIN; productRefGroup = PRODUCTS; projectDirPath = ""; projectRoot = ""; targets = (APP,); };
 MAIN = { isa = PBXGroup; children = (SOURCES, PRODUCTS,); sourceTree = "<group>"; };
 SOURCES = { isa = PBXGroup; path = ${q(name)}; children = (APP_SWIFT, VIEW_SWIFT, INFO,); sourceTree = "<group>"; };
 PRODUCTS = { isa = PBXGroup; name = Products; children = (PRODUCT,); sourceTree = "<group>"; };
 APP_SWIFT = { isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ${q(name+'App.swift')}; sourceTree = "<group>"; };
 VIEW_SWIFT = { isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ContentView.swift; sourceTree = "<group>"; };
 INFO = { isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = Info.plist; sourceTree = "<group>"; };
 PRODUCT = { isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = ${q(name+'.app')}; sourceTree = BUILT_PRODUCTS_DIR; };
 APP = { isa = PBXNativeTarget; name = ${q(name)}; productName = ${q(name)}; productType = "com.apple.product-type.application"; productReference = PRODUCT; buildConfigurationList = APP_CONFIGS; buildPhases = (COMPILE, FRAMEWORKS, RESOURCES,); buildRules = (); dependencies = (); };
 COMPILE = { isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = (APP_BUILD, VIEW_BUILD,); runOnlyForDeploymentPostprocessing = 0; };
 APP_BUILD = { isa = PBXBuildFile; fileRef = APP_SWIFT; }; VIEW_BUILD = { isa = PBXBuildFile; fileRef = VIEW_SWIFT; };
 FRAMEWORKS = { isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0; };
 RESOURCES = { isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0; };
 PROJECT_CONFIGS = { isa = XCConfigurationList; buildConfigurations = (PROJECT_DEBUG, PROJECT_RELEASE,); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release; };
 PROJECT_DEBUG = { isa = XCBuildConfiguration; name = Debug; buildSettings = {}; }; PROJECT_RELEASE = { isa = XCBuildConfiguration; name = Release; buildSettings = {}; };
 APP_CONFIGS = { isa = XCConfigurationList; buildConfigurations = (APP_DEBUG, APP_RELEASE,); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release; };
 APP_DEBUG = { isa = XCBuildConfiguration; name = Debug; buildSettings = ${settings(true)}; }; APP_RELEASE = { isa = XCBuildConfiguration; name = Release; buildSettings = ${settings(false)}; };
 }; rootObject = PROJECT; }
`;
 // Xcode UUIDs are 24 hexadecimal characters, including all generated references.
 const ids=['PROJECT','PROJECT_CONFIGS','PROJECT_DEBUG','PROJECT_RELEASE','APP_CONFIGS','APP_DEBUG','APP_RELEASE','MAIN','SOURCES','PRODUCTS','APP_SWIFT','VIEW_SWIFT','INFO','PRODUCT','APP','COMPILE','APP_BUILD','VIEW_BUILD','FRAMEWORKS','RESOURCES'];
 const map=new Map(ids.map((id,i)=>[id,(i+1).toString(16).toUpperCase().padStart(24,'0')]));
 const encoded=source.replace(/"(?:\\.|[^"\\])*"|\b(?:PROJECT_CONFIGS|PROJECT_DEBUG|PROJECT_RELEASE|APP_CONFIGS|APP_DEBUG|APP_RELEASE|APP_SWIFT|VIEW_SWIFT|APP_BUILD|VIEW_BUILD|PROJECT|PRODUCTS|PRODUCT|SOURCES|MAIN|INFO|APP|COMPILE|FRAMEWORKS|RESOURCES)\b/g,id=>id.startsWith('"')?id:map.get(id)!);
 pbxModel(encoded,name);
 const scheme=`<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1600" version="1.3"><BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="${map.get('APP')}" BuildableName="${name}.app" BlueprintName="${name}" ReferencedContainer="container:${name}.xcodeproj"/></BuildActionEntry></BuildActionEntries></BuildAction><LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB"><BuildableProductRunnable runnableDebuggingMode="0"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="${map.get('APP')}" BuildableName="${name}.app" BlueprintName="${name}" ReferencedContainer="container:${name}.xcodeproj"/></BuildableProductRunnable></LaunchAction><AnalyzeAction buildConfiguration="Debug"/><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/></Scheme>
`;
 return {[name+'.xcodeproj/project.pbxproj']:encoded,[name+'.xcodeproj/xcshareddata/xcschemes/'+name+'.xcscheme']:scheme};
}
// The stage stays inside the selected directory. Rollback removes only entries moved
// by this transaction, after verifying their exact absolute destination paths.
export async function createScaffold(root:string,files:Record<string,string>,authorize:(file:string)=>string){
 root=path.resolve(root);await fs.mkdir(root,{recursive:true});if((await fs.readdir(root)).length)throw new Error('La cartella deve essere vuota');
 const stage=path.join(root,'.openfruit-create-'+randomUUID());authorize(stage);await fs.mkdir(stage);
 const committed:string[]=[];
 const inside=(file:string)=>{const relative=path.relative(root,path.resolve(file));if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new Error('Percorso scaffold esterno');return authorize(file);};
 try{
  for(const [relative,content]of Object.entries(files)){const file=inside(path.resolve(stage,relative));if(!file.startsWith(stage+path.sep))throw new Error('Percorso scaffold non valido');await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,content,{encoding:'utf8',flag:'wx'});}
  const entries=await fs.readdir(stage);
  for(const entry of entries){const destination=inside(path.join(root,entry));try{await fs.lstat(destination);throw new Error('Un file è comparso nella destinazione: creazione interrotta');}catch(error:any){if(error.code!=='ENOENT')throw error;}await fs.rename(path.join(stage,entry),destination);committed.push(destination);}
 }catch(error){for(const file of committed.reverse())await fs.rm(inside(file),{recursive:true,force:true});throw error;}
 finally{await fs.rm(inside(stage),{recursive:true,force:true});}
}
