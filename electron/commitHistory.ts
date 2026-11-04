import {spawn} from 'node:child_process';
import {execGit,gitRoot} from './git';
import {decodeDocument,MAX_IMAGE_BYTES} from './documents';
import {containedPath} from './workspace';
import type {CommitDetails,CommitFile,CommitComparison} from '../shared/documents';
async function checked(root:string,args:string[]){const r=await execGit(root,args,{signal:AbortSignal.timeout(15000)});if(r.code!==0)throw new Error(r.stderr||'Lettura Git fallita');return r.stdout;}
export function parseCommitFiles(raw:string):CommitFile[]{
 const records=raw.split('\0'),files:CommitFile[]=[];
 for(let i=0;i<records.length&&records[i];){const status=records[i++];if(!/^[ACDMRTUXB]\d*$/.test(status))throw new Error('Stato file commit non valido');const first=records[i++];if(first===undefined)throw new Error('Percorso commit mancante');
  if(status[0]==='R'||status[0]==='C'){const next=records[i++];if(next===undefined)throw new Error('Percorso rinomina mancante');files.push({path:next,oldPath:first,status});}else files.push({path:first,status});
 }return files;
}
export async function commitDetails(cwd:string,hash:string,parentIndex=0):Promise<CommitDetails>{
 if(typeof hash!=='string'||!/^(?:[a-f0-9]{7,40}|[a-f0-9]{64})$/i.test(hash)||!Number.isInteger(parentIndex)||parentIndex<0||parentIndex>100)throw new Error('Commit non valido');
 const root=await gitRoot(cwd),full=(await checked(root,['rev-parse','--verify',hash+'^{commit}'])).trim(),parents=(await checked(root,['show','-s','--format=%P',full])).trim().split(/\s+/).filter(Boolean);
 if(parentIndex>=Math.max(1,parents.length))throw new Error('Parent del commit non valido');const parent=parents[parentIndex]||null;
 const raw=await checked(root,parent?['diff','--name-status','-z','-M','--no-ext-diff',parent,full,'--']:['diff-tree','--root','--no-commit-id','--name-status','-z','-r','-M',full,'--']);
 return {hash:full,parents,parent,parentIndex,files:parseCommitFiles(raw)};
}
export function gitBlob(root:string,revision:string,file:string):Promise<Buffer>{
 containedPath(root,file);
 return new Promise((resolve,reject)=>{
  const proc=spawn('git',['cat-file','blob',revision+':'+file],{cwd:root,windowsHide:true,shell:false}),chunks:Buffer[]=[];let bytes=0,stderr='',failure:Error|undefined;
  const timer=setTimeout(()=>{failure=new Error('Lettura blob Git scaduta');proc.kill();},15000);proc.stdin.end();
  proc.stdout.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>MAX_IMAGE_BYTES){failure=new Error('File storico superiore a 20 MB');proc.kill();}else chunks.push(chunk);});
  proc.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-10000);});proc.once('error',error=>{clearTimeout(timer);reject(error);});proc.once('close',code=>{clearTimeout(timer);if(failure||code!==0)reject(failure||new Error(stderr||'Blob Git non leggibile'));else resolve(Buffer.concat(chunks));});
 });
}
export async function commitComparison(cwd:string,hash:string,parentIndex:number,filename:string):Promise<CommitComparison>{
 const root=await gitRoot(cwd),details=await commitDetails(root,hash,parentIndex),file=details.files.find(f=>f.path===filename);if(!file)throw new Error('Il file non appartiene al commit selezionato');
 const [before,after]=await Promise.all([
  details.parent&&file.status[0]!=='A'?gitBlob(root,details.parent,file.oldPath||file.path).then(b=>decodeDocument(b,file.oldPath||file.path)):null,
  file.status[0]!=='D'?gitBlob(root,details.hash,file.path).then(b=>decodeDocument(b,file.path)):null
 ]);return {details,file,before,after};
}
