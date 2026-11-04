import path from 'node:path';
import {createHash} from 'node:crypto';
import {execGit,gitRoot} from './git';
import {containedPath} from './workspace';
export async function fileHunks(cwd:string,filename:string,staged:boolean){
 if(typeof staged!=='boolean')throw new Error('Selezione diff non valida');const root=await gitRoot(cwd),file=containedPath(root,filename),relative=path.relative(root,file).replace(/\\/g,'/');
 const args=['diff',...(staged?['--cached']:[]),'--no-ext-diff','--no-textconv','--no-color','--',relative],result=await execGit(root,args);if(result.code!==0)throw new Error(result.stderr);
 const raw=result.stdout,first=raw.search(/^@@ /m),revision=createHash('sha256').update(raw).digest('hex');
 if(first<0)return {revision,hunks:[],header:'',filename:relative};const header=raw.slice(0,first);
 if(/^rename |^copy |^new file mode|^deleted file mode|^old mode|^new mode/m.test(header))throw new Error('Per creazioni, eliminazioni, rinomine e cambi di modalità usa Stage/Ripristina dell’intero file.');
 const hunks=raw.slice(first).split(/(?=^@@ )/m);return {revision,hunks,header,filename:relative};
}
export async function applyFileHunks(cwd:string,filename:string,staged:boolean,expected:string,indices:number[],discard=false){
 if(!Array.isArray(indices)||!indices.length||indices.length>10000||new Set(indices).size!==indices.length)throw new Error('Selezione hunk non valida');
 if(discard&&staged)throw new Error('Rimuovi prima gli hunk dallo staging');const root=await gitRoot(cwd),current=await fileHunks(root,filename,staged);
 if(expected!==current.revision)throw new Error('Diff cambiato: ricarica gli hunk prima di procedere');
 if(indices.some(i=>!Number.isInteger(i)||i<0||i>=current.hunks.length))throw new Error('Hunk non valido');
 const patch=current.header+indices.sort((a,b)=>a-b).map(i=>current.hunks[i]).join('');const args=['apply',...(!discard?['--cached']:[]),...(staged||discard?['--reverse']:[]),'--whitespace=nowarn'];
 const check=await execGit(root,[...args,'--check','-'],{input:patch});if(check.code!==0)throw new Error(check.stderr||'Hunk non applicabile');
 const result=await execGit(root,[...args,'-'],{input:patch});if(result.code!==0)throw new Error(result.stderr);return true;
}
