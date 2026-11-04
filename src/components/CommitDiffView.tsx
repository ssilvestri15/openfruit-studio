import { useTranslation } from '../localization';
import {useState} from 'react';
import type {CommitComparison,DocumentContent} from '../../shared/documents';
import {ImagePreview,SvgPreview} from './ImagePreview';
import {SafeDiffEditor} from './SafeDiffEditor';
import {fileLanguage} from '../utils/monaco';
export function CommitDiffView({comparison,theme,fontSize}:{comparison:CommitComparison;theme:string;fontSize:number}){
  const t = useTranslation();
 const {before,after,file,details}=comparison,[preview,setPreview]=useState(false);
 const textual=(!before||before.kind==='text')&&(!after||after.kind==='text');
 const svg=(before?.kind==='text'&&before.format==='svg')||(after?.kind==='text'&&after.format==='svg');
 const side=(doc:DocumentContent|null,name:string)=>!doc?<div className="h-full flex items-center justify-center text-xs text-fruit-textDim">{t("File non presente in questa revisione")}</div>:doc.kind==='image'?<ImagePreview src={doc.dataUrl} name={name} bytes={doc.bytes}/>:doc.kind==='binary'?<p className="p-4 text-xs text-fruit-textDim">{t("File binario non visualizzabile (")}{doc.bytes} {t("byte).")}</p>:doc.format==='svg'?<SvgPreview content={doc.content} name={name}/>:<pre className="p-4 text-xs whitespace-pre-wrap break-all overflow-auto h-full select-text">{doc.content}</pre>;
 return <section aria-label={t("Confronto file del commit")} className="w-full h-full flex flex-col min-h-0 text-fruit-text"><header className="px-3 py-2 border-b border-fruit-border text-xs space-y-1"><p className="font-mono break-all">{file.oldPath?file.oldPath+' → ':''}{file.path}</p><p className="text-fruit-textDim">{details.parent?details.parent.slice(0,8):t("Progetto vuoto")} → {details.hash.slice(0,8)} · {file.status}</p>{svg&&<button className="text-fruit-accent" onClick={()=>setPreview(p=>!p)}>{preview?t("Mostra confronto sorgente SVG"):t("Confronta immagini SVG")}</button>}</header>
 <div className="flex-1 min-h-0">{textual&&!(svg&&preview)?<SafeDiffEditor key={details.hash+details.parent+file.path} height="100%" original={before?.kind==='text'?before.content:''} modified={after?.kind==='text'?after.content:''} language={fileLanguage(file.path)} theme={theme} options={{readOnly:true,originalEditable:false,renderSideBySide:true,automaticLayout:true,fontSize,minimap:{enabled:false},scrollBeyondLastLine:false}}/>:<div className="h-full flex"><div className="flex-1 min-w-0 flex flex-col"><p className="text-xs p-2 bg-fruit-bg border-b border-fruit-border">{t("Prima ·")} {details.parent?.slice(0,8)||'assente'}</p><div className="flex-1 min-h-0">{side(before,file.oldPath||file.path)}</div></div><div className="flex-1 min-w-0 border-l border-fruit-border flex flex-col"><p className="text-xs p-2 bg-fruit-bg border-b border-fruit-border">{t("Dopo ·")} {details.hash.slice(0,8)}</p><div className="flex-1 min-h-0">{side(after,file.path)}</div></div></div>}</div>
 </section>;
}
