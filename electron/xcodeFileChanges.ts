import path from 'node:path';
import { scanDirectoryTree } from './workspace';
import { readSnapshot, saveSnapshot } from './fileStore';
import { projectReferences } from './xcodeNavigator';
import { get,text,array,patchObjects,type ObjectPatch } from './pbxproj';
const beneath=(parent:string,file:string)=>{const rel=path.relative(parent,file);return !rel||rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);};
export function patchFileReferences(source:string,project:string,oldPath:string,newPath:string|null){
 const {model:m,paths}=projectReferences(source,project),patches=new Map<string,ObjectPatch>();
 const set=(id:string,key:string,value:string|string[]|null)=>{const p=patches.get(id)||{id,fields:{}};p.fields![key]=value;patches.set(id,p);};
 const affected=[...paths].filter(([,physical])=>beneath(oldPath,physical));
 if(newPath){
  for(const [id,physical]of affected){const n=m.object(id),tree=text(get(n,'sourceTree'))||'<group>';
   // A relative child's path follows a renamed parent group automatically.
   const parent=[...m.objects.entries].find(([,entry])=>array(get(entry.value,'children')).some(child=>text(child)===id))?.[0];
   if(tree==='<group>'&&parent&&affected.some(([ref])=>ref===parent))continue;
   const destination=path.join(newPath,path.relative(oldPath,physical));
   const parentPath=tree==='<group>'?(parent?paths.get(parent):path.dirname(project)):path.dirname(project);
   if(tree==='<absolute>')set(id,'path',destination.replace(/\\/g,'/'));
   else if(parentPath)set(id,'path',path.relative(parentPath,destination).replace(/\\/g,'/'));
   if(text(get(n,'name'))===path.basename(oldPath)&&physical===oldPath)set(id,'name',path.basename(newPath));
  }
 }else{
  const removed=new Set(affected.map(([id])=>id));
  for(const [id]of m.objects.entries)if(removed.has(text(get(m.object(id),'fileRef'))))removed.add(id);
  for(const [id,entry]of m.objects.entries){if(removed.has(id))continue;
   if(entry.value.kind!=='dict')continue;
   for(const [key,field]of entry.value.entries){
    if(field.value.kind==='array'){const values=field.value.values.map(text);if(values.some(v=>removed.has(v))){if(!field.value.values.every(v=>v.kind==='atom'))throw new Error('Riferimenti PBX strutturati non modificabili: '+key);set(id,key,values.filter(v=>!removed.has(v)));}}
    else if(field.value.kind==='atom'&&removed.has(field.value.value)){if(['currentVersion','baseConfigurationReference'].includes(key))set(id,key,null);else throw new Error('Riferimento PBX non gestito: '+key+' in '+id);}
   }
  }
  for(const id of removed)patches.set(id,{id,remove:true});
 }
 return patches.size?patchObjects(source,[...patches.values()]):source;
}
export async function withProjectFileChange(root:string,oldPath:string,newPath:string|null,authorize:(file:string)=>string,mutateDisk:()=>Promise<void>){
 const projects:string[]=[];const collect=(node:any)=>{if(node.packageType==='xcodeproject')projects.push(node.path);else for(const c of node.children||[])collect(c);};collect(await scanDirectoryTree(root));
 const plans=await Promise.all(projects.filter(p=>!beneath(oldPath,p)).map(async project=>{const file=authorize(path.join(project,'project.pbxproj')),before=await readSnapshot(file),content=patchFileReferences(before.content,project,oldPath,newPath);return {file,before,content};}));
 const committed:Array<{file:string;content:string;revision:string}>=[];
 try{
  for(const p of plans){if(p.before.content===p.content)continue;const result=await saveSnapshot(p.file,p.content,p.before.revision,()=>{authorize(p.file);});if(!result.success||!result.revision)throw new Error(result.error||'Aggiornamento PBX fallito');committed.push({file:p.file,content:p.before.content,revision:result.revision});}
  await mutateDisk();
 }catch(error:any){
  const failures:string[]=[];for(const p of committed.reverse()){const result=await saveSnapshot(p.file,p.content,p.revision,()=>{authorize(p.file);});if(!result.success)failures.push(p.file);}
  throw new Error(error.message+(failures.length?' Ripristino PBX non completato per modifiche concorrenti: '+failures.join(', '):''));
 }
}
