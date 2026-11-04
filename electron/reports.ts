import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {writeJsonAtomic,readJson} from './persistence';
export class OperationReports {
 constructor(private directory:string){}
 async save(report:{root?:string;operation:string;success:boolean;cancelled?:boolean;code:number;startedAt:string;output:unknown[]}){
  const id=Date.now()+'-'+randomUUID(),value={schemaVersion:1,id,finishedAt:new Date().toISOString(),...report};
  await writeJsonAtomic(path.join(this.directory,id+'.json'),value);
  const files=(await fs.readdir(this.directory)).filter(f=>/^\d+-[a-f0-9-]+\.json$/.test(f)).sort().reverse();
  for(const file of files.slice(100))await fs.unlink(path.join(this.directory,file));return id;
 }
 async list(root:string){
  let files:string[];try{files=await fs.readdir(this.directory);}catch(error:any){if(error.code==='ENOENT')return [];throw error;}
  const result=[];for(const file of files.filter(f=>/^\d+-[a-f0-9-]+\.json$/.test(f)).sort().reverse()){
   const report=await this.read(file.slice(0,-5));if(report.root?.toLowerCase()!==root.toLowerCase())continue;
   const {output,...summary}=report;result.push(summary);if(result.length===50)break;
  }return result;
 }
 async read(id:string){if(typeof id!=='string'||!/^\d+-[a-f0-9-]+$/.test(id))throw new Error('Report non valido');const file=path.join(this.directory,id+'.json');if((await fs.stat(file)).size>8*1024*1024)throw new Error('Report troppo grande');const value=await readJson(file);if(value?.schemaVersion!==1)throw new Error('Schema report non supportato');return value;}
}
