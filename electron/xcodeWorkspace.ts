import fs from 'node:fs/promises';
import path from 'node:path';
import { parseXcodeXml, type XmlNode } from './xcodeXml';
import { readTextFile } from './workspace';
export interface XcodeWorkspace {path:string;projects:string[];warnings:string[]}
export async function readXcodeWorkspace(workspace:string,authorize:(file:string)=>string):Promise<XcodeWorkspace>{
  if(!workspace.toLowerCase().endsWith('.xcworkspace'))throw new Error('Workspace Xcode richiesto');
  const xml=parseXcodeXml(await readTextFile(authorize(path.join(workspace,'contents.xcworkspacedata')))),container=path.dirname(workspace),projects:string[]=[],warnings:string[]=[];
  const walk=(node:XmlNode,parent:string)=>{
    let location=parent;
    if(node.attributes.location){const value=node.attributes.location,index=value.indexOf(':'),kind=value.slice(0,index),file=value.slice(index+1);
      if(kind==='group')location=path.resolve(parent,file);else if(['container','self'].includes(kind))location=path.resolve(kind==='self'?workspace:container,file);else if(kind==='absolute'&&path.isAbsolute(file))location=path.resolve(file);else{warnings.push('Location non supportata: '+value);return;}}
    if(node.name==='FileRef'&&location.toLowerCase().endsWith('.xcodeproj')){try{authorize(path.join(location,'project.pbxproj'));projects.push(location);}catch{warnings.push('Progetto esterno non autorizzato: '+location);}}
    for(const child of node.children)walk(child,location);
  };walk(xml,container);return {path:workspace,projects:[...new Set(projects)],warnings};
}
export interface XcodeScheme {name:string;path:string;container:string;configurations:string[];targets:Array<{id:string;name:string;container:string}>}
export async function readXcodeSchemes(container:string,authorize:(file:string)=>string):Promise<XcodeScheme[]>{
  const directories=[path.join(container,'xcshareddata','xcschemes')],userData=path.join(container,'xcuserdata');
  try{for(const entry of await fs.readdir(authorize(userData),{withFileTypes:true}))if(entry.isDirectory()&&!entry.isSymbolicLink())directories.push(path.join(userData,entry.name,'xcschemes'));}catch(error:any){if(error.code!=='ENOENT')throw error;}
  const schemes:XcodeScheme[]=[];
  for(const directory of directories){let entries;try{entries=await fs.readdir(authorize(directory),{withFileTypes:true});}catch(error:any){if(error.code==='ENOENT')continue;throw error;}
    for(const entry of entries){if(!entry.isFile()||!entry.name.endsWith('.xcscheme'))continue;const file=authorize(path.join(directory,entry.name)),xml=parseXcodeXml(await readTextFile(file)),configurations=new Set<string>(),targets:XcodeScheme['targets']=[];
      const walk=(node:XmlNode)=>{if(node.attributes.buildConfiguration)configurations.add(node.attributes.buildConfiguration);if(node.name==='BuildableReference')targets.push({id:node.attributes.BlueprintIdentifier||'',name:node.attributes.BlueprintName||'',container:node.attributes.ReferencedContainer||''});for(const child of node.children)walk(child);};walk(xml);
      schemes.push({name:entry.name.slice(0,-9),path:file,container,configurations:[...configurations],targets:targets.filter((t,i)=>targets.findIndex(v=>v.id===t.id&&v.container===t.container)===i)});
    }
  }return schemes;
}
