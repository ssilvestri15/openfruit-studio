import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import type {DocumentContent} from '../shared/documents';
export const MAX_IMAGE_BYTES=20*1024*1024;
export function imageMime(buffer:Buffer):string|undefined{
 if(buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(buffer.length>=3&&buffer[0]===255&&buffer[1]===216&&buffer[2]===255)return 'image/jpeg';
 if(['GIF87a','GIF89a'].includes(buffer.subarray(0,6).toString('ascii')))return 'image/gif';
 if(buffer.subarray(0,4).toString('ascii')==='RIFF'&&buffer.subarray(8,12).toString('ascii')==='WEBP')return 'image/webp';
 if(buffer.subarray(0,2).toString('ascii')==='BM')return 'image/bmp';
 if(buffer.length>=4&&buffer.readUInt32LE(0)===0x00010000)return 'image/x-icon';
 if(buffer.subarray(4,8).toString('ascii')==='ftyp'&&['avif','avis'].includes(buffer.subarray(8,12).toString('ascii')))return 'image/avif';
 return undefined;
}
export function decodeDocument(buffer:Buffer,name:string):DocumentContent{
 if(buffer.length>MAX_IMAGE_BYTES)throw new Error('Immagine superiore al limite di 20 MB');
 const revision=createHash('sha256').update(buffer).digest('hex'),mime=imageMime(buffer);
 if(mime)return {kind:'image',mime,dataUrl:'data:'+mime+';base64,'+buffer.toString('base64'),bytes:buffer.length,revision};
 if(/\.(png|jpe?g|gif|webp|bmp|ico|avif|heic|heif|tiff?)$/i.test(name))return {kind:'binary',bytes:buffer.length,revision};
 if(buffer.length>2*1024*1024)throw new Error('Documento di testo superiore al limite di 2 MB');
 if(!buffer.includes(0))try{const content=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(buffer);return {kind:'text',content,revision,...(/\.svg$/i.test(name)?{format:'svg' as const}:{})};}catch{}
 return {kind:'binary',bytes:buffer.length,revision};
}
export async function readDocument(file:string){
 const handle=await fs.open(file,'r');try{
  const stat=await handle.stat();if(!stat.isFile()||stat.size>MAX_IMAGE_BYTES)throw new Error('File non disponibile o superiore a 20 MB');
  const prefix=Buffer.alloc(Math.min(16,stat.size));await handle.read(prefix,0,prefix.length,0);
  if(stat.size>2*1024*1024&&!imageMime(prefix))throw new Error('Formato non visualizzabile o testo superiore a 2 MB');
  const buffer=Buffer.alloc(Math.min(stat.size+1,MAX_IMAGE_BYTES+1));let size=0;while(size<buffer.length){const chunk=await handle.read(buffer,size,buffer.length-size,size);if(!chunk.bytesRead)break;size+=chunk.bytesRead;}
  return decodeDocument(buffer.subarray(0,size),file);
 }finally{await handle.close();}
}
