import path from 'node:path';
import { readProjectSettings } from './projectSettings';
import { readTextFile } from './workspace';
import { pbxModel } from './pbxproj';
import { resolveXcodeSettings } from './xcconfig';
export async function projectMetadata(root:string,authorize:(file:string)=>string){
 const snapshot=await readProjectSettings(root,authorize),settings=snapshot.settings;
 const metadata={name:path.basename(root),bundleId:settings.bundleId,organization:'',minIosVersion:'',sdkVersion:settings.sdkVersion,language:'',interfaceType:snapshot.xcodeProjects.length?'Xcode':snapshot.manifests.some(p=>p.endsWith('Package.swift'))?'Swift Package':'Progetto locale',warnings:[] as string[]};
 if(snapshot.xcodeProjects.length){const project=settings.targetProject||snapshot.xcodeProjects[0];try{const source=await readTextFile(authorize(path.join(project,'project.pbxproj'))),model=pbxModel(source,metadata.name),target=model.targets.find(t=>t.id===settings.targetId)||model.targets[0];
  const config=target?.configurations.find(c=>c.name.toLowerCase()===settings.configuration.toLowerCase())||target?.configurations[0];
  if(target&&config){const resolved=await resolveXcodeSettings(source,project,target.id,config.id,authorize),v=resolved.values;metadata.name=target.name;metadata.bundleId=v.PRODUCT_BUNDLE_IDENTIFIER||'';metadata.minIosVersion=v.IPHONEOS_DEPLOYMENT_TARGET||'';metadata.language=v.SWIFT_VERSION?'Swift '+v.SWIFT_VERSION:'';}
 }catch(error:any){metadata.warnings.push(error.message);}}
 else{const manifest=snapshot.manifests.find(p=>p.endsWith('Package.swift'));if(manifest){const source=await readTextFile(authorize(manifest));metadata.language=source.match(/swift-tools-version:\s*([\d.]+)/)?.[1]?'Swift '+source.match(/swift-tools-version:\s*([\d.]+)/)![1]:'';metadata.minIosVersion=source.match(/\.iOS\("([\d.]+)"\)/)?.[1]||'';}}
 return metadata;
}
