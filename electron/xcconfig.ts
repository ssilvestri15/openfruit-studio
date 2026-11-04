import path from 'node:path';
import { readTextFile } from './workspace';
import { projectReferences } from './xcodeNavigator';
import { get, text } from './pbxproj';
import type { BuildSetting } from '../shared/xcode';
export interface ResolvedSettings {values:Record<string,string>;origins:Record<string,string>;warnings:string[]}
export async function resolveXcodeSettings(source:string,project:string,ownerId:string,configurationId:string,authorize:(file:string)=>string):Promise<ResolvedSettings>{
  const {model:m,paths}=projectReferences(source,project),owner=[m.project,...m.targets].find(t=>t.id===ownerId),config=owner?.configurations.find(c=>c.id===configurationId);
  if(!owner||!config)throw new Error('Configurazione non appartenente alla selezione');
  const root=path.dirname(project),values:Record<string,string>=Object.create(null),origins:Record<string,string>=Object.create(null),warnings:string[]=[];
  Object.assign(values,{SRCROOT:root,SOURCE_ROOT:root,PROJECT_DIR:root,PROJECT_NAME:path.basename(project,'.xcodeproj'),TARGET_NAME:owner.name,CONFIGURATION:config.name,PLATFORM_NAME:'iphoneos',CURRENT_ARCH:'arm64'});
  const context:Record<string,string>={sdk:'iphoneos',config:config.name,arch:'arm64'};
  const expand=(input:string,stack:string[]=[]):string=>input.replace(/\$\(([^)]+)\)|\$\{([^}]+)\}/g,(raw:string,a:string,b:string)=>{
    const [key,...modifiers]=(a||b).split(':');if(key==='inherited')return '';
    if(stack.includes(key)){warnings.push('Variabile ciclica: '+[...stack,key].join(' → '));return raw;}
    if(!Object.hasOwn(values,key)){warnings.push('Variabile non risolta: '+key);return raw;}
    let value=expand(values[key],[...stack,key]);for(const mod of modifiers){if(mod==='lower')value=value.toLowerCase();else if(mod==='upper')value=value.toUpperCase();else if(mod==='identifier')value=value.replace(/[^A-Za-z0-9_]/g,'_');else if(mod==='rfc1034identifier')value=value.replace(/[^A-Za-z0-9.-]/g,'-');else{warnings.push('Modificatore non supportato: '+mod);return raw;}}return value;
  });
  const apply=(rawKey:string,raw:BuildSetting,origin:string,operator='=')=>{
    const key=rawKey.split('[')[0].trim(),conditions=[...rawKey.matchAll(/\[([^=\]]+)=([^\]]+)\]/g)];
    if(!key||rawKey.slice(key.length).replace(/\[[^=\]]+=[^\]]+\]/g,'').trim()){warnings.push('Condizione non supportata: '+rawKey);return;}
    for(const [,kind,pattern] of conditions){if(!context[kind]){warnings.push('Condizione non disponibile: '+kind);return;}const regex=new RegExp('^'+pattern.replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*').replace(/\?/g,'.')+'$','i');if(!regex.test(context[kind]))return;}
    if(operator==='?='&&Object.hasOwn(values,key))return;
    let value=Array.isArray(raw)?raw.join(' '):raw;const inherited=values[key]||'';
    value=value.replace(/\$\(inherited\)|\$\{inherited\}/g,()=>inherited);
    values[key]=operator==='+='?[inherited,value].filter(Boolean).join(' '):value;origins[key]=origin;
  };
  let total=0;
  const include=async(file:string,stack:string[]=[],optional=false):Promise<void>=>{
    if(stack.length>=50)throw new Error('Include xcconfig troppo profondi');file=authorize(file);
    if(stack.includes(file.toLowerCase()))throw new Error('Include xcconfig ciclico: '+file);
    let source:string;try{source=await readTextFile(file);}catch(error:any){if(optional&&error.code==='ENOENT')return;throw error;}
    if((total+=source.length)>4*1024*1024)throw new Error('Include xcconfig troppo grandi');
    // Remove comments while retaining quoted URLs and line boundaries.
    let clean='',quote=false,block=false;
    for(let i=0;i<source.length;i++){const c=source[i],next=source[i+1];if(block){if(c==='*'&&next==='/'){block=false;i++;}else if(c==='\n')clean+='\n';continue;}
      if(c==='"'&&source[i-1]!=='\\')quote=!quote;
      if(!quote&&c==='/'&&next==='*'){block=true;i++;continue;}
      if(!quote&&c==='/'&&next==='/'){const end=source.indexOf('\n',i);if(end<0)break;i=end-1;continue;}clean+=c;
    }
    if(block||quote)throw new Error('Commento o stringa xcconfig non terminata: '+file);
    const lines=clean.replace(/\\\r?\n/g,'').split(/\r?\n/);
    for(let i=0;i<lines.length;i++){const line=lines[i].trim();if(!line)continue;const directive=/^#include(\?)?\s+["<]([^">]+)[">]\s*$/.exec(line);
      if(directive){const requested=expand(directive[2]);if(/\$[({]/.test(requested))throw new Error('Include con variabili non risolte: '+requested);await include(path.resolve(path.dirname(file),requested),[...stack,file.toLowerCase()],!!directive[1]);continue;}
      const assignment=/^([A-Za-z_][\w]*(?:\[[^\]]+\])*)\s*(\+=|\?=|=)\s*(.*)$/.exec(line);
      if(!assignment){warnings.push(file+':'+(i+1)+': sintassi non supportata');continue;}let val=assignment[3];if(val.startsWith('"')&&val.endsWith('"'))val=val.slice(1,-1).replace(/\\"/g,'"');apply(assignment[1],val,file+':'+(i+1),assignment[2]);
    }
  };
  const layer=async(c:typeof config)=>{const ref=text(get(m.object(c.id),'baseConfigurationReference'));const relative=text(get(m.object(c.id),'baseConfigurationReferenceRelativePath'));if(ref||relative){const file=ref?paths.get(ref):path.resolve(root,relative);if(file)await include(file);else warnings.push('Base configuration non risolta: '+ref);}for(const [key,value]of Object.entries(c.settings))apply(key,value,c.name+' ('+c.id+')');};
  if(owner.id!==m.project.id){const projectConfig=m.project.configurations.find(c=>c.name===config.name);if(projectConfig)await layer(projectConfig);else warnings.push('Configurazione progetto non presente: '+config.name);}
  await layer(config);
  const resolved:Record<string,string>=Object.create(null);for(const [key,value]of Object.entries(values))resolved[key]=expand(value,[key]);
  warnings.push('Contesto: iPhoneOS / arm64. Default SDK e operatori non riconosciuti richiedono la risoluzione nativa di Xcode.');
  return {values:resolved,origins,warnings:[...new Set(warnings)]};
}
