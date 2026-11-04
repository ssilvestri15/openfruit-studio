import { useTranslation } from '../localization';
import {useRef} from 'react';
import {X} from 'lucide-react';
import {GitSidebarView,type GitSidebarViewProps} from './GitSidebarView';
import {useDialog} from '../hooks/useDialog';
type GitDrawerProps=GitSidebarViewProps&{isOpen:boolean;onClose:()=>void};
export function GitDrawer({isOpen,onClose,...props}:GitDrawerProps){
  const t = useTranslation();
 const container=useRef<HTMLDivElement>(null);useDialog(isOpen,container,onClose);
 if(!isOpen)return null;
 return <div ref={container} role="dialog" aria-modal="true" aria-label={t("Controllo versione Git")} className="fixed inset-0 z-50 bg-black/60 flex justify-end"><aside className="w-96 max-w-full h-full bg-fruit-bg border-l border-fruit-border flex flex-col"><header className="flex justify-between p-3 border-b border-fruit-border text-fruit-text"><strong>Git · {props.branch}</strong><button aria-label={t("Chiudi Git")} onClick={onClose}><X size={16}/></button></header><GitSidebarView {...props}/></aside></div>;
}
