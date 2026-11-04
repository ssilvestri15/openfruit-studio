import { useTranslation } from '../localization';
import {useEffect,useState} from 'react';
export function ImagePreview({src,name,bytes}:{src:string;name:string;bytes?:number}){
  const t = useTranslation();
 const [zoom,setZoom]=useState<number|'fit'>('fit'),[background,setBackground]=useState('checker'),[loaded,setLoaded]=useState<{src:string;width:number;height:number}>(),[failedSrc,setFailedSrc]=useState<string>();
 const dimensions=loaded?.src===src?loaded:undefined,error=failedSrc===src;
 const step=(factor:number)=>setZoom(value=>Math.min(8,Math.max(0.1,(typeof value==='number'?value:1)*factor)));
 return <section aria-label={'Anteprima '+name} className="flex flex-col w-full h-full min-h-0 bg-fruit-editor text-fruit-text">
  <header className="shrink-0 flex items-center flex-wrap gap-3 px-3 py-2 border-b border-fruit-border text-xs"><button onClick={()=>setZoom('fit')}>{t("Adatta")}</button><button onClick={()=>setZoom(1)}>100%</button><button aria-label={t("Riduci immagine")} onClick={()=>step(1/1.25)}>−</button><span>{zoom==='fit'?t("Adatta"):Math.round(zoom*100)+'%'}</span><button aria-label={t("Ingrandisci immagine")} onClick={()=>step(1.25)}>+</button><select aria-label={t("Sfondo anteprima immagine")} className="bg-fruit-surface border border-fruit-border rounded" value={background} onChange={e=>setBackground(e.target.value)}><option value="checker">{t("Trasparenza")}</option><option value="light">{t("Bianco")}</option><option value="dark">{t("Scuro")}</option></select><span className="ml-auto text-fruit-textDim">{dimensions?dimensions.width+' × '+dimensions.height+' px':''}{bytes!==undefined?' · '+(bytes/1024).toFixed(1)+' KB':''}</span></header>
  <div className="flex-1 min-h-0 overflow-auto" style={{backgroundColor:background==='light'?'#fff':background==='dark'?'#181818':'#e5e5e5',backgroundImage:background==='checker'?'repeating-conic-gradient(#c9c9c9 0% 25%, transparent 0% 50%)':undefined,backgroundSize:'20px 20px'}}>
   {error?<p role="alert" className="m-4 p-3 bg-fruit-bg text-fruit-text text-xs">{t("Impossibile decodificare l’immagine. Il file potrebbe essere danneggiato o usare un formato non supportato.")}</p>:<div className={zoom==='fit'?'w-full h-full flex items-center justify-center p-4':'w-max min-w-full h-max min-h-full flex items-center justify-center p-4'}><img alt={name} src={src} draggable={false} onLoad={e=>{setLoaded({src,width:e.currentTarget.naturalWidth,height:e.currentTarget.naturalHeight});setFailedSrc(undefined);}} onError={()=>setFailedSrc(src)} style={zoom==='fit'?{maxWidth:'100%',maxHeight:'100%',objectFit:'contain',width:'auto',height:'auto'}:{maxWidth:'none',maxHeight:'none',width:dimensions?dimensions.width*zoom:undefined,height:dimensions?dimensions.height*zoom:undefined}} className={zoom==='fit'?'image-preview-fit':''}/></div>}
  </div>
 </section>;
}
export function SvgPreview({content,name}:{content:string;name:string}){
  const t = useTranslation();
 const [url,setUrl]=useState(''),[error,setError]=useState('');
 useEffect(()=>{let next='';const timer=setTimeout(()=>{try{if(/<!ENTITY/i.test(content))throw new Error(t("SVG con dichiarazioni ENTITY non supportato"));const parsed=new DOMParser().parseFromString(content,'image/svg+xml');if(parsed.querySelector('parsererror')||parsed.documentElement.localName!=='svg')throw new Error(t("SVG non valido: correggi il sorgente per aggiornare l’anteprima"));next=URL.createObjectURL(new Blob([content],{type:'image/svg+xml'}));setUrl(next);setError('');}catch(e:any){setError(e.message);setUrl('');}},120);return()=>{clearTimeout(timer);if(next)URL.revokeObjectURL(next);};},[content]);
 return error?<div role="alert" className="p-4 text-xs text-rose-300">{error}</div>:url?<ImagePreview src={url} name={name}/>:<p role="status" className="p-4 text-xs text-fruit-textDim">{t("Caricamento SVG…")}</p>;
}
