import { randomBytes } from 'node:crypto';
import { pbxModel, patchObjects, get, text, array, type ObjectPatch, type PbxValue } from './pbxproj';
import type { XcodeOperation, XcodeGraph } from '../shared/xcode';
const refs = (node: Parameters<typeof get>[0], key: string) => array(get(node,key)).map(text);
export function xcodeGraph(source: string): XcodeGraph {
  const m=pbxModel(source,'Project');
  return {
    files:[...m.objects.entries].filter(([id])=>text(get(m.object(id),'isa'))==='PBXFileReference').map(([id])=>({id,path:text(get(m.object(id),'path')),name:text(get(m.object(id),'name'))||text(get(m.object(id),'path')),memberships:m.targets.flatMap(t=>refs(m.object(t.id),'buildPhases').filter(phase=>refs(m.object(phase),'files').some(file=>text(get(m.object(file),'fileRef'))===id)).map(phaseId=>({targetId:t.id,phaseId})))})),
    packages: refs(m.object(m.project.id),'packageReferences').map(id=>{
      const n=m.object(id), requirement=get(n,'requirement'), values:Record<string,string>={};
      if(requirement?.kind==='dict') for(const [key,entry] of requirement.entries) if(entry.value.kind==='atom') values[key]=entry.value.value;
      return {id,url:text(get(n,'repositoryURL'))||text(get(n,'relativePath')),requirement:values};
    }),
    targets:m.targets.map(t=>({id:t.id,name:t.name,
      dependencies:refs(m.object(t.id),'dependencies').map(id=>{const targetId=text(get(m.object(id),'target')); return {id,targetId,name:m.targets.find(t=>t.id===targetId)?.name||text(get(m.object(id),'name'))||id};}),
      phases:refs(m.object(t.id),'buildPhases').map(id=>{const n=m.object(id),kind=text(get(n,'isa'));return {id,name:text(get(n,'name'))||kind,kind,script:kind==='PBXShellScriptBuildPhase'?text(get(n,'shellScript')):undefined};})
    }))
  };
}
export function mutateXcode(source: string, op: XcodeOperation): string {
  if(!op || typeof op!=='object') throw new Error('Operazione progetto non valida');
  const m=pbxModel(source,'Project'), changes=new Map<string,ObjectPatch>();
  const id=()=>{let next:string;do{next=randomBytes(12).toString('hex').toUpperCase();}while(m.object(next)||changes.has(next));return next;};
  const set=(objectId:string,key:string,value:PbxValue|null)=>{const patch=changes.get(objectId)||{id:objectId,fields:{}};if(patch.remove||patch.create)throw new Error('Operazioni incompatibili');patch.fields![key]=value;changes.set(objectId,patch);};
  const create=(objectId:string,value:Record<string,PbxValue>)=>changes.set(objectId,{id:objectId,create:value});
  const remove=(objectId:string)=>changes.set(objectId,{id:objectId,remove:true});
  const target=(targetId:string)=>{if(!m.targets.some(t=>t.id===targetId))throw new Error('Target non valido');return m.object(targetId);};
  const string=(value:string,max=256)=>{if(typeof value!=='string'||!value.trim()||value.length>max||/[\x00-\x1f]/.test(value))throw new Error('Valore non valido');return value.trim();};
  const membership=(fileId:string,targetId:string,phaseKind:string,drop=false)=>{
    const owner=target(targetId);if(text(get(m.object(fileId),'isa'))!=='PBXFileReference'&&!changes.get(fileId)?.create)throw new Error('File reference non valida');
    const isa=({sources:'PBXSourcesBuildPhase',resources:'PBXResourcesBuildPhase',frameworks:'PBXFrameworksBuildPhase'} as Record<string,string>)[phaseKind];if(!isa)throw new Error('Tipo fase non valido');
    let phase=refs(owner,'buildPhases').find(ref=>text(get(m.object(ref),'isa'))===isa);
    const existing=phase?refs(m.object(phase),'files').find(ref=>text(get(m.object(ref),'fileRef'))===fileId):undefined;
    if(drop){if(!phase||!existing)throw new Error('File non presente nella fase');set(phase,'files',refs(m.object(phase),'files').filter(ref=>ref!==existing));remove(existing);return;}
    if(existing)throw new Error('File già presente nella fase');const buildId=id();create(buildId,{isa:'PBXBuildFile',fileRef:fileId});
    if(phase)set(phase,'files',[...refs(m.object(phase),'files'),buildId]);else{phase=id();create(phase,{isa,buildActionMask:'2147483647',files:[buildId],runOnlyForDeploymentPostprocessing:'0'});set(targetId,'buildPhases',[...refs(owner,'buildPhases'),phase]);}
  };
  const copyValue=(n:ReturnType<typeof get>):PbxValue=>{if(n?.kind==='atom')return n.value;if(n?.kind==='array')return n.values.map(copyValue);if(n?.kind==='dict')return Object.fromEntries([...n.entries].map(([key,entry])=>[key,copyValue(entry.value)]));throw new Error('Oggetto con dati binari non duplicabile');};
  const productGroup=()=>{let group=text(get(m.object(m.project.id),'productRefGroup'));if(group)return group;group=id();create(group,{isa:'PBXGroup',name:'Products',sourceTree:'<group>',children:[]});set(m.project.id,'productRefGroup',group);const main=text(get(m.object(m.project.id),'mainGroup'));set(main,'children',[...refs(m.object(main),'children'),group]);return group;};
  switch(op.kind){
    case 'phase-order':{const phases=refs(target(op.targetId),'buildPhases');if(!Array.isArray(op.phaseIds)||op.phaseIds.length!==phases.length||new Set(op.phaseIds).size!==phases.length||op.phaseIds.some(ref=>!phases.includes(ref)))throw new Error('Ordine fasi non valido');set(op.targetId,'buildPhases',op.phaseIds);break;}
    case 'create-target':{
      const name=string(op.name),bundle=string(op.bundleId);if(!/^[A-Za-z_][A-Za-z0-9_ .-]*$/.test(name))throw new Error('Nome target non valido');if(!/^([A-Za-z0-9-]+\.)+[A-Za-z0-9-]+$/.test(bundle)||m.targets.some(t=>t.name===name))throw new Error('Nome target duplicato o Bundle ID non valido');
      const types={application:['com.apple.product-type.application','.app','wrapper.application'],framework:['com.apple.product-type.framework','.framework','wrapper.framework'],'app-extension':['com.apple.product-type.app-extension','.appex','wrapper.app-extension']};
      if(!Object.hasOwn(types,op.productType))throw new Error('Tipo prodotto non valido');const [type,ext,fileType]=types[op.productType];
      const targetId=id(),product=id(),list=id(),configs=m.project.configurations.map(config=>{const ref=id();create(ref,{isa:'XCBuildConfiguration',name:config.name,buildSettings:{PRODUCT_NAME:'$(TARGET_NAME)',PRODUCT_BUNDLE_IDENTIFIER:bundle,SDKROOT:'iphoneos',SWIFT_VERSION:'6.0',GENERATE_INFOPLIST_FILE:'YES',CODE_SIGN_STYLE:'Automatic',...(op.productType==='framework'?{DEFINES_MODULE:'YES',MACH_O_TYPE:'mh_dylib'}:{})}});return ref;});
      if(!configs.length)throw new Error('Il progetto non contiene configurazioni');
      create(list,{isa:'XCConfigurationList',buildConfigurations:configs,defaultConfigurationIsVisible:'0',defaultConfigurationName:m.project.configurations.at(-1)!.name});
      create(product,{isa:'PBXFileReference',explicitFileType:fileType,includeInIndex:'0',path:name+ext,sourceTree:'BUILT_PRODUCTS_DIR'});
      const phases=['PBXSourcesBuildPhase','PBXFrameworksBuildPhase','PBXResourcesBuildPhase'].map(isa=>{const ref=id();create(ref,{isa,buildActionMask:'2147483647',files:[],runOnlyForDeploymentPostprocessing:'0'});return ref;});
      create(targetId,{isa:'PBXNativeTarget',name,productName:name,productType:type,productReference:product,buildConfigurationList:list,buildPhases:phases,buildRules:[],dependencies:[]});
      set(m.project.id,'targets',[...m.targets.map(t=>t.id),targetId]);const group=productGroup();const patch=changes.get(group);if(patch?.create)patch.create.children=[product];else set(group,'children',[...refs(m.object(group),'children'),product]);break;
    }
    case 'duplicate-target':{
      const owner=target(op.targetId),name=string(op.name),bundle=string(op.bundleId);if(!/^([A-Za-z0-9-]+\.)+[A-Za-z0-9-]+$/.test(bundle)||m.targets.some(t=>t.name===name))throw new Error('Nome target duplicato o Bundle ID non valido');
      const owned=new Set([op.targetId]),list=text(get(owner,'buildConfigurationList'));owned.add(list);for(const ref of refs(m.object(list),'buildConfigurations'))owned.add(ref);
      const product=text(get(owner,'productReference'));if(product)owned.add(product);
      for(const key of ['buildPhases','buildRules','dependencies','packageProductDependencies'])for(const ref of refs(owner,key)){owned.add(ref);if(key==='buildPhases')for(const file of refs(m.object(ref),'files'))owned.add(file);}
      const remap=new Map([...owned].map(ref=>[ref,id()]));
      const replace=(v:PbxValue):PbxValue=>typeof v==='string'?remap.get(v)||v:Array.isArray(v)?v.map(replace):Object.fromEntries(Object.entries(v).map(([key,value])=>[key,replace(value)]));
      for(const ref of owned){const copied=replace(copyValue(m.object(ref))) as Record<string,PbxValue>;
        if(ref===op.targetId){copied.name=name;copied.productName=name;}
        if(ref===product){const old=text(get(m.object(ref),'path')),suffix=old.includes('.')?old.slice(old.lastIndexOf('.')):'';copied.path=name+suffix;}
        if(text(get(m.object(ref),'isa'))==='XCBuildConfiguration'){const settings=copied.buildSettings as Record<string,PbxValue>;settings.PRODUCT_BUNDLE_IDENTIFIER=bundle;settings.PRODUCT_NAME='$(TARGET_NAME)';}
        create(remap.get(ref)!,copied);
      }
      set(m.project.id,'targets',[...m.targets.map(t=>t.id),remap.get(op.targetId)!]);if(product){const group=productGroup(),patch=changes.get(group);if(patch?.create)patch.create.children=[remap.get(product)!];else set(group,'children',[...refs(m.object(group),'children'),remap.get(product)!]);}break;
    }
    case 'remove-target':{
      const owner=target(op.targetId);if(m.targets.length<=1)throw new Error('Deve restare almeno un target');const removed=new Set([op.targetId]);
      const list=text(get(owner,'buildConfigurationList'));removed.add(list);for(const ref of refs(m.object(list),'buildConfigurations'))removed.add(ref);
      const product=text(get(owner,'productReference'));if(product)removed.add(product);
      for(const key of ['buildPhases','buildRules','dependencies','packageProductDependencies'])for(const ref of refs(owner,key)){removed.add(ref);if(key==='buildPhases')for(const file of refs(m.object(ref),'files'))removed.add(file);}
      for(const other of m.targets.filter(t=>t.id!==op.targetId)){
        for(const key of ['buildPhases','buildRules','dependencies','packageProductDependencies'])for(const ref of refs(m.object(other.id),key)){
          if(removed.has(ref))throw new Error('Oggetti condivisi con un altro target: eliminazione interrotta');
          if(key==='buildPhases'&&refs(m.object(ref),'files').some(file=>removed.has(file)))throw new Error('Build file condivisi con un altro target: eliminazione interrotta');
        }
      }
      for(const [ref]of m.objects.entries){const node=m.object(ref);if(text(get(node,'target'))===op.targetId||removed.has(text(get(node,'fileRef')))||removed.has(text(get(node,'productRef'))))removed.add(ref);}
      for(const [ref,entry]of m.objects.entries){if(removed.has(ref)||entry.value.kind!=='dict')continue;for(const [key,field]of entry.value.entries){if(field.value.kind==='array'){const values=field.value.values.map(text);if(values.some(v=>removed.has(v)))set(ref,key,values.filter(v=>!removed.has(v)));}else if(field.value.kind==='atom'&&removed.has(field.value.value))throw new Error('Target condiviso o usato da un riferimento non gestito: '+key);}}
      for(const ref of removed)remove(ref);break;
    }
    case 'add-file': {
      const file=string(op.filePath,4096).replace(/\\/g,'/');if(file.startsWith('/')||/^[A-Za-z]:/.test(file)||file.split('/').includes('..')||file.includes('$'))throw new Error('Usa un percorso relativo al progetto');
      const main=text(get(m.object(m.project.id),'mainGroup'));if(!m.object(main))throw new Error('Gruppo principale mancante');
      const ref=id();create(ref,{isa:'PBXFileReference',path:file,sourceTree:'SOURCE_ROOT'});set(main,'children',[...refs(m.object(main),'children'),ref]);membership(ref,op.targetId,op.phase);break;
    }
    case 'file-membership': membership(op.fileId,op.targetId,op.phase,!!op.remove);break;
    case 'remove-file-reference': {
      if(text(get(m.object(op.fileId),'isa'))!=='PBXFileReference')throw new Error('Riferimento file non valido');
      const removed=new Set([op.fileId]);for(const [ref]of m.objects.entries)if(text(get(m.object(ref),'fileRef'))===op.fileId)removed.add(ref);
      for(const [ref,entry]of m.objects.entries){if(removed.has(ref)||entry.value.kind!=='dict')continue;for(const [key,field]of entry.value.entries){if(field.value.kind==='array'){const values=field.value.values.map(text);if(values.some(v=>removed.has(v)))set(ref,key,values.filter(v=>!removed.has(v)));}else if(field.value.kind==='atom'&&removed.has(field.value.value)){if(['currentVersion','baseConfigurationReference'].includes(key))set(ref,key,null);else throw new Error('Riferimento ancora usato da '+key);}}}
      for(const ref of removed)remove(ref);break;
    }
    case 'add-package': {
      target(op.targetId); const url=string(op.url,4096);const parsed=new URL(url);if(!['https:','ssh:'].includes(parsed.protocol)||parsed.password)throw new Error('Usa un URL HTTPS o SSH senza password');
      if(!['upToNextMajorVersion','exactVersion','branch','revision'].includes(op.requirement))throw new Error('Requisito non valido');
      const version=string(op.version),product=string(op.product);
      if(['upToNextMajorVersion','exactVersion'].includes(op.requirement)&&!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(version))throw new Error('Versione semantica richiesta (es. 1.0.0)');
      const packageId=id(),productId=id(),fileId=id();
      const key=op.requirement==='upToNextMajorVersion'?'minimumVersion':op.requirement==='exactVersion'?'version':op.requirement;
      create(packageId,{isa:'XCRemoteSwiftPackageReference',repositoryURL:url,requirement:{kind:op.requirement,[key]:version}});
      create(productId,{isa:'XCSwiftPackageProductDependency',package:packageId,productName:product});
      create(fileId,{isa:'PBXBuildFile',productRef:productId});
      set(m.project.id,'packageReferences',[...refs(m.object(m.project.id),'packageReferences'),packageId]);
      set(op.targetId,'packageProductDependencies',[...refs(m.object(op.targetId),'packageProductDependencies'),productId]);
      let phase=refs(m.object(op.targetId),'buildPhases').find(ref=>text(get(m.object(ref),'isa'))==='PBXFrameworksBuildPhase');
      if(phase)set(phase,'files',[...refs(m.object(phase),'files'),fileId]);
      else{phase=id();create(phase,{isa:'PBXFrameworksBuildPhase',buildActionMask:'2147483647',files:[fileId],runOnlyForDeploymentPostprocessing:'0'});set(op.targetId,'buildPhases',[...refs(m.object(op.targetId),'buildPhases'),phase]);}
      break;
    }
    case 'remove-package': {
      const packages=refs(m.object(m.project.id),'packageReferences');if(!packages.includes(op.packageId))throw new Error('Package non appartenente al progetto');
      set(m.project.id,'packageReferences',packages.filter(p=>p!==op.packageId));
      const products=new Set<string>(),files=new Set<string>();
      for(const [key] of m.objects.entries){const n=m.object(key);if(text(get(n,'package'))===op.packageId)products.add(key);}
      for(const [key] of m.objects.entries)if(products.has(text(get(m.object(key),'productRef'))))files.add(key);
      for(const [key] of m.objects.entries){const n=m.object(key);for(const attr of ['packageProductDependencies','files']){const values=refs(n,attr);if(values.some(v=>products.has(v)||files.has(v)))set(key,attr,values.filter(v=>!products.has(v)&&!files.has(v)));}}
      for(const ref of [...products,...files,op.packageId])remove(ref);break;
    }
    case 'target-dependency': {
      const owner=target(op.targetId);target(op.dependencyId);if(op.targetId===op.dependencyId)throw new Error('Un target non può dipendere da se stesso');
      const deps=refs(owner,'dependencies'), existing=deps.find(ref=>text(get(m.object(ref),'target'))===op.dependencyId);
      if(op.remove){if(!existing)throw new Error('Dipendenza non trovata');set(op.targetId,'dependencies',deps.filter(ref=>ref!==existing));remove(existing);}
      else{if(existing)throw new Error('Dipendenza già presente');
        const visits=new Set<string>(); const reaches=(ref:string):boolean=>{if(ref===op.targetId)return true;if(visits.has(ref))return false;visits.add(ref);return refs(m.object(ref),'dependencies').some(dep=>reaches(text(get(m.object(dep),'target'))));};
        if(reaches(op.dependencyId))throw new Error('La dipendenza creerebbe un ciclo');const dep=id();create(dep,{isa:'PBXTargetDependency',target:op.dependencyId});set(op.targetId,'dependencies',[...deps,dep]);}
      break;
    }
    case 'duplicate-configuration': case 'remove-configuration': {
      const owners=[m.project,...m.targets],owner=owners.find(t=>t.configurations.some(c=>c.id===op.configurationId));if(!owner)throw new Error('Configurazione non valida');
      const listId=text(get(m.object(owner.id),'buildConfigurationList')),list=m.object(listId),configs=refs(list,'buildConfigurations');
      if(op.kind==='remove-configuration'){if(configs.length<=1)throw new Error('Deve restare almeno una configurazione');set(listId,'buildConfigurations',configs.filter(c=>c!==op.configurationId));remove(op.configurationId);const removed=owner.configurations.find(c=>c.id===op.configurationId)!;if(text(get(list,'defaultConfigurationName'))===removed.name)set(listId,'defaultConfigurationName',owner.configurations.find(c=>c.id!==op.configurationId)!.name);}
      else{const name=string(op.name);if(owner.configurations.some(c=>c.name===name))throw new Error('Nome configurazione già presente');
        const convert=(n:ReturnType<typeof get>):PbxValue=>{if(n?.kind==='atom')return n.value;if(n?.kind==='array')return n.values.map(convert);if(n?.kind==='dict')return Object.fromEntries([...n.entries].map(([key,entry])=>[key,convert(entry.value)]));throw new Error('Configurazione con dati binari non duplicabile');};
        const copy=convert(m.object(op.configurationId)) as Record<string,PbxValue>;copy.name=name;const config=id();create(config,copy);set(listId,'buildConfigurations',[...configs,config]);}
      break;
    }
    case 'add-script': case 'update-script': {
      const owner=target(op.targetId), name=string(op.name);if(typeof op.script!=='string'||op.script.length>100000||op.script.includes('\0'))throw new Error('Script non valido');
      if(op.kind==='add-script'){const phase=id();create(phase,{isa:'PBXShellScriptBuildPhase',name,buildActionMask:'2147483647',files:[],inputPaths:[],outputPaths:[],shellPath:'/bin/sh',shellScript:op.script,runOnlyForDeploymentPostprocessing:'0'});set(op.targetId,'buildPhases',[...refs(owner,'buildPhases'),phase]);}
      else{if(!refs(owner,'buildPhases').includes(op.phaseId)||text(get(m.object(op.phaseId),'isa'))!=='PBXShellScriptBuildPhase')throw new Error('Script non appartenente al target');set(op.phaseId,'name',name);set(op.phaseId,'shellScript',op.script);}
      break;
    }
    case 'remove-phase': {const owner=target(op.targetId),phases=refs(owner,'buildPhases');if(!phases.includes(op.phaseId))throw new Error('Phase non appartenente al target');set(op.targetId,'buildPhases',phases.filter(p=>p!==op.phaseId));
      // Build files may be shared by nonstandard projects: remove only exclusively owned objects.
      for(const file of refs(m.object(op.phaseId),'files'))if(![...m.objects.entries].some(([key])=>key!==op.phaseId&&refs(m.object(key),'files').includes(file)))remove(file);
      remove(op.phaseId);break;}
    default: throw new Error('Operazione progetto non supportata');
  }
  return patchObjects(source,[...changes.values()]);
}
