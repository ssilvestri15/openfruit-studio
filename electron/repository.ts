import { execGit, gitRoot } from './git';
import type { RepositoryAction, RepositoryInfo } from '../shared/git';
const checked=async(root:string,args:string[],signal?:AbortSignal)=>{const result=await execGit(root,args,{signal});if(result.code!==0)throw new Error(result.stderr||'Comando Git fallito');return result.stdout;};
export async function repositoryInfo(cwd:string):Promise<RepositoryInfo>{
 const root=await gitRoot(cwd);
 const [branches,remotes,counts,conflicts,stashes]=await Promise.all([
  checked(root,['for-each-ref','--format=%(refname:short)%00%(HEAD)%00%(upstream:short)','refs/heads/']),
  checked(root,['remote','-v']),execGit(root,['rev-list','--left-right','--count','HEAD...@{upstream}']),
  checked(root,['diff','--name-only','--diff-filter=U','-z']),checked(root,['stash','list','--format=%gd%x00%gs'])
 ]);
 const [ahead=0,behind=0]=counts.code===0?counts.stdout.trim().split(/\s+/).map(Number):[];
 return {branches:branches.split(/\r?\n/).filter(Boolean).map(line=>{const [name,head,upstream]=line.split('\0');return {name,current:head==='*',upstream};}),
 remotes:[...new Map(remotes.split(/\r?\n/).filter(Boolean).map(line=>{const [name,url]=line.split(/\s+/);return [name,{name,url}];})).values()],ahead,behind,conflicts:conflicts.split('\0').filter(Boolean),stashes:stashes.split(/\r?\n/).filter(Boolean).map(line=>{const [ref,message]=line.split('\0');return {ref,message};})};
}
export async function repositoryArgs(root:string,action:RepositoryAction){
 if(!action||typeof action!=='object')throw new Error('Azione Git non valida');
 const name=(value:string)=>{if(typeof value!=='string'||!value||value.startsWith('-')||value.length>256||/[\x00-\x20]/.test(value))throw new Error('Nome Git non valido');return value;};
 switch(action.kind){
 case 'switch':case 'create-branch':case 'merge':case 'rebase':{
  const branch=name(action.branch);await checked(root,['check-ref-format','--branch',branch]);
  if(action.kind==='switch')return ['switch','--',branch];if(action.kind==='create-branch')return ['switch','-c',branch];if(action.kind==='merge')return ['merge','--no-edit','--',branch];return ['-c','core.editor=true','rebase',branch];}
 case 'pull':return ['pull','--ff-only'];
 case 'stash':if(typeof action.message!=='string'||action.message.length>1000||action.message.includes('\0'))throw new Error('Messaggio stash non valido');return ['stash','push','--include-untracked','-m',action.message||'OpenFruit Studio'];
 case 'stash-pop':return ['stash','pop'];
 case 'merge-abort':return ['merge','--abort'];case 'rebase-abort':return ['rebase','--abort'];case 'rebase-continue':return ['-c','core.editor=true','rebase','--continue'];
 case 'add-remote':{const remote=name(action.name);if(!/^[A-Za-z0-9_.-]+$/.test(remote))throw new Error('Nome remoto non valido');if(typeof action.url!=='string'||action.url.length>4096)throw new Error('URL non valido');const url=new URL(action.url);if(!['https:','ssh:'].includes(url.protocol)||url.password)throw new Error('URL HTTPS/SSH senza password richiesto');return ['remote','add',remote,action.url];}
 case 'remove-remote':return ['remote','remove',name(action.name)];
 default:throw new Error('Azione Git non supportata');
 }
}
export async function repositoryHistory(cwd:string,skip:number){
 if(!Number.isInteger(skip)||skip<0||skip>100000)throw new Error('Pagina cronologia non valida');
 const root=await gitRoot(cwd),raw=await checked(root,['log','--max-count=50','--skip='+skip,'--format=%H%x00%an%x00%aI%x00%s']);
 return raw.split(/\r?\n/).filter(Boolean).map(line=>{const [hash,author,date,message]=line.split('\0');return {hash,author,date,message};});
}
export async function repositoryCommit(cwd:string,hash:string){
 if(typeof hash!=='string'||!/^([a-f0-9]{7,40}|[a-f0-9]{64})$/i.test(hash))throw new Error('Revisione Git non valida');
 const root=await gitRoot(cwd);return checked(root,['show','--format=fuller','--stat','--patch','--no-ext-diff','--no-textconv',hash,'--']);
}
