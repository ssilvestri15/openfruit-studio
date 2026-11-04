import { useTranslation } from '../localization';
import {useState,type ReactNode} from 'react';
import {SvgPreview} from './ImagePreview';
export function SvgDocumentEditor({name,content,editor}:{name:string;content:string;editor:ReactNode}){
  const t = useTranslation();
 const [mode,setMode]=useState<'split'|'preview'|'source'>('split');
 return <section aria-label={t("Editor e anteprima SVG")} className="h-full w-full flex flex-col min-h-0"><nav className="shrink-0 flex gap-2 px-3 py-1.5 border-b border-fruit-border text-xs">{([['split',t("Editor e anteprima")],['preview','Anteprima'],['source','Sorgente']] as const).map(([id,label])=><button key={id} aria-pressed={mode===id} onClick={()=>setMode(id)} className={'px-2 py-1 rounded '+(mode===id?'bg-fruit-surfaceHover text-fruit-accent':'text-fruit-textMuted')}>{label}</button>)}</nav><div className="flex flex-1 min-h-0">{mode!=='preview'&&<div aria-label={t("Sorgente SVG")} className="flex-1 min-w-0 h-full">{editor}</div>}{mode!=='source'&&<div aria-label={t("Immagine SVG")} className="flex-1 min-w-0 h-full border-l border-fruit-border"><SvgPreview content={content} name={name}/></div>}</div></section>;
}
