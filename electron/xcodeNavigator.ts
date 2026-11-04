import path from 'node:path';
import fs from 'node:fs/promises';
import { pbxModel, get, text, array } from './pbxproj';
import { readTextFile, scanDirectoryTree } from './workspace';
export interface ProjectNode { id:string;name:string;path:string;type:'file'|'folder';packageType?:'xcodeproject';extension?:string;children?:ProjectNode[];logical?:boolean;referenceId?:string;projectPath?:string;warning?:string }
export function projectReferences(source:string,project:string) {
  const m=pbxModel(source,path.basename(project,'.xcodeproj')),root=path.dirname(project),paths=new Map<string,string>(),warnings=new Map<string,string>();
  const walk=(id:string,parent:string,ancestors=new Set<string>())=>{
    if(ancestors.has(id))throw new Error('PBX: ciclo nei gruppi');
    if(ancestors.size>100)throw new Error('PBX: gruppi troppo profondi');
    const n=m.object(id);if(!n){warnings.set(id,'Riferimento PBX mancante');return;}
    const tree=text(get(n,'sourceTree'))||'<group>',file=text(get(n,'path'));
    let current:string;
    if(tree==='<group>')current=path.resolve(parent,file||'.');
    else if(['SOURCE_ROOT','PROJECT_DIR'].includes(tree))current=path.resolve(root,file||'.');
    else if(tree==='<absolute>')current=path.resolve(file);
    else {warnings.set(id,'sourceTree non disponibile: '+tree);return;}
    if(/\$[({]/.test(current)){warnings.set(id,'Percorso con variabili non risolte');return;}
    if(paths.has(id)&&paths.get(id)!==current)throw new Error('PBX: riferimento con più directory padre');
    paths.set(id,current);
    const next=new Set(ancestors).add(id);
    for(const child of array(get(n,'children')).map(text))walk(child,current,next);
  };
  walk(text(get(m.object(m.project.id),'mainGroup')),root);
  // Base configuration references are not always children of mainGroup.
  for(const [id] of m.objects.entries)if(!paths.has(id)&&text(get(m.object(id),'isa'))==='PBXFileReference'){
    const n=m.object(id),tree=text(get(n,'sourceTree'));
    if(tree==='SOURCE_ROOT'||tree==='PROJECT_DIR'||(!tree||tree==='<group>'))paths.set(id,path.resolve(root,text(get(n,'path'))));
  }
  return {model:m,paths,warnings};
}
export async function logicalProjectTree(project:string,authorize:(file:string)=>string):Promise<ProjectNode>{
  const source=await readTextFile(authorize(path.join(project,'project.pbxproj'))),{model:m,paths,warnings}=projectReferences(source,project);
  let visited=0;
  const build=async(id:string):Promise<ProjectNode>=>{
    if(++visited>50000)throw new Error('Navigatore progetto troppo grande');
    const n=m.object(id),kind=text(get(n,'isa')),physical=paths.get(id),name=text(get(n,'name'))||text(get(n,'path'))||id;
    const group=['PBXGroup','PBXVariantGroup','XCVersionGroup','PBXFileSystemSynchronizedRootGroup'].includes(kind);
    const node:ProjectNode={id:project+'::'+id,name,path:physical||project,type:group?'folder':'file',logical:true,referenceId:id,projectPath:project,extension:physical?path.extname(physical).slice(1):undefined};
    if(!physical){node.warning=warnings.get(id)||'Percorso non risolto';return node;}
    try{authorize(physical);}catch{node.warning='Riferimento esterno: apri esplicitamente la cartella per accedervi';return node;}
    if(kind==='PBXFileSystemSynchronizedRootGroup'){
      try { const tree=await scanDirectoryTree(physical);node.children=tree?.children; }catch(error:any){node.warning=error.message;}
    }else if(group)node.children=await Promise.all(array(get(n,'children')).map(ref=>build(text(ref))));
    else try{await fs.access(physical);}catch{node.warning='File mancante sul disco';}
    return node;
  };
  const mainId=text(get(m.object(m.project.id),'mainGroup')),main=await build(mainId);
  return {...main,id:project+'::project',name:path.basename(project),path:project,packageType:'xcodeproject',children:main.children};
}
export async function projectNavigator(root:string,authorize:(file:string)=>string){
  const physical=await scanDirectoryTree(root),projects:string[]=[];
  const collect=(node:ProjectNode)=>{if(node.packageType==='xcodeproject')projects.push(node.path);else for(const c of node.children||[])collect(c);};collect(physical);
  if(!projects.length)return physical;
  const children=await Promise.all(projects.map(p=>logicalProjectTree(p,authorize)));
  return {...physical,children};
}
