import { useTranslation } from '../localization';
import { useState } from 'react';
import type { FileConflict } from '../../shared/files';
import { defaultCopyName } from '../utils/fileConflicts';

export function FileConflictBanner(props: {
  name: string; conflict: FileConflict; busy: boolean;
  onMerge?: () => void;
  onCompare: () => void; onReload: () => void; onCopy: (name: string) => void;
}) {
  const t = useTranslation();
  const [copyName, setCopyName] = useState(() => defaultCopyName(props.name));
  return <div role="status" className="p-3 border-b border-amber-700/50 bg-amber-950/50 text-xs text-amber-100 space-y-2">
    <p>{t("Il file sul disco è diverso. Le tue modifiche sono conservate nell’editor.")}</p>
    <p className="text-[11px]">{props.conflict.message}</p>
    <div className="flex flex-wrap items-center gap-2">
      {props.onMerge && <button disabled={props.busy} onClick={props.onMerge} className="px-2 py-1 border rounded">{t("Unisci automaticamente")}</button>}
      <button disabled={props.busy} onClick={props.onCompare} className="px-2 py-1 border rounded">{t("Confronta versioni")}</button>
      <button disabled={props.busy} onClick={props.onReload} className="px-2 py-1 border rounded" title={t("Scarta le modifiche nell’editor e legge nuovamente il file")}>{t("Usa versione sul disco")}</button>
      <input aria-label={t("Nome della copia")} value={copyName} onChange={event => setCopyName(event.target.value)} className="px-2 py-1 rounded bg-fruit-bg text-fruit-text font-mono" />
      <button disabled={props.busy || !copyName} onClick={() => props.onCopy(copyName)} className="px-2 py-1 border rounded">{t("Salva copia")}</button>
    </div>
  </div>;
}
