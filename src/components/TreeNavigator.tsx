import { useTranslation } from '../localization';
import {useId,useMemo,useRef,useState} from 'react';
import {ChevronDown,ChevronRight,FileCode,Folder} from 'lucide-react';
import type {FileNode} from '../types';
import {VirtualList} from './VirtualList';
export function TreeNavigator({root,query,activePath,onSelect,onSettings,onContext}:{root:FileNode;query:string;activePath:string|null;onSelect:(node:FileNode)=>void;onSettings:(path?:string)=>void;onContext:(e:React.MouseEvent,node:FileNode)=>void}){
  const t = useTranslation();
 const [expanded,setExpanded]=useState<Record<string,boolean>>({}),[focused,setFocused]=useState(0),host=useRef<HTMLDivElement>(null),prefix=useId();
 const rows=useMemo(()=>{
  const matches=(node:FileNode):FileNode|undefined=>{const children=node.children?.map(matches).filter(Boolean) as FileNode[]|undefined;return !query||node.name.toLowerCase().includes(query.toLowerCase())||children?.length?{...node,children}:undefined;};
  const result:Array<{node:FileNode;depth:number}>=[],walk=(node:FileNode,depth:number)=>{result.push({node,depth});if(query||expanded[node.id]!==false)for(const child of node.children||[])walk(child,depth+1);};
  const visible=query?matches(root):root;if(visible)walk(visible,0);return result;
 },[root,query,expanded]);
 const activate=(node:FileNode)=>{if(node.warning)return;if(node.packageType==='xcodeproject'&&!node.children){onSettings(node.path);return;}if(node.type==='folder')setExpanded(prev=>({...prev,[node.id]:prev[node.id]===false}));else onSelect(node);};
 const focus=(index:number)=>{index=Math.max(0,Math.min(rows.length-1,index));setFocused(index);const node=host.current;if(node){const top=index*28;if(top<node.scrollTop)node.scrollTop=top;else if(top+28>node.scrollTop+node.clientHeight)node.scrollTop=top+28-node.clientHeight;}};
 return <VirtualList items={rows} rowHeight={28} containerRef={host} role="tree" label={t("Navigatore progetto")} activeId={rows.length?prefix+'-'+Math.min(focused,rows.length-1):undefined} onKeyDown={e=>{
  const index=Math.min(focused,rows.length-1),row=rows[index];if(!row)return;
  if(['ArrowDown','ArrowUp','Home','End','ArrowRight','ArrowLeft','Enter',' '].includes(e.key))e.preventDefault();
  if(e.key==='ArrowDown')focus(index+1);else if(e.key==='ArrowUp')focus(index-1);else if(e.key==='Home')focus(0);else if(e.key==='End')focus(rows.length-1);
  else if(e.key==='ArrowRight'&&row.node.children){if(expanded[row.node.id]===false)setExpanded(p=>({...p,[row.node.id]:true}));else focus(index+1);}
  else if(e.key==='ArrowLeft'){if(row.node.children&&expanded[row.node.id]!==false)setExpanded(p=>({...p,[row.node.id]:false}));else{let parent=index-1;while(parent>=0&&rows[parent].depth>=row.depth)parent--;focus(parent);}}
  else if(e.key==='Enter'||e.key===' ')activate(row.node);
 }} render={({node,depth},index)=>{
  const group=node.type==='folder'&&(!node.packageType||!!node.children),open=expanded[node.id]!==false;
  return <div id={prefix+'-'+index} role="treeitem" aria-level={depth+1} aria-expanded={group?open:undefined} aria-selected={activePath===node.path} aria-disabled={!!node.warning} title={node.warning||node.path} data-file-path={node.path} style={{paddingLeft:depth*14+6}} className={'h-full flex gap-1.5 items-center text-xs px-2 cursor-pointer rounded '+(node.warning?'text-amber-300':activePath===node.path?'bg-fruit-surfaceHover text-fruit-accent':'text-fruit-textMuted hover:bg-fruit-surface')+(focused===index?' outline-offset-[-1px] focus-within:outline':'')} onClick={()=>{setFocused(index);host.current?.focus();activate(node);}} onContextMenu={e=>{e.preventDefault();if(!node.logical)onContext(e,node);}}>
   {group?<span className="shrink-0">{open?<ChevronDown size={12}/>:<ChevronRight size={12}/>}</span>:<span className="w-3 shrink-0"/>}{group?<Folder size={14} className="shrink-0"/>:<FileCode size={14} className="shrink-0"/>}
   {depth===0||node.packageType==='xcodeproject'?<button title={t("Apri configurazione progetto")} className="truncate text-left" onClick={e=>{e.stopPropagation();onSettings(node.packageType?node.path:undefined);}}>{node.name}</button>:<span className="truncate">{node.name}</span>}
  </div>;
 }}/>;
}
