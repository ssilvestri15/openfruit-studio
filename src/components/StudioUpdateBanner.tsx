import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import type { StudioUpdate } from '../../shared/updates';
import { useTranslation } from '../localization';

type UpdateApi = {
  checkStudioUpdate(): Promise<StudioUpdate | null>;
  openStudioUpdate(): Promise<void>;
};

export function StudioUpdateBanner() {
  const t = useTranslation();
  const [update, setUpdate] = useState<StudioUpdate | null>(null);
  const [failedToOpen, setFailedToOpen] = useState(false);
  const api = (window as Window & { openfruitApi?: UpdateApi }).openfruitApi;

  useEffect(() => {
    let active = true;
    api?.checkStudioUpdate?.().then(result => {
      if (active) setUpdate(result);
    }).catch(() => {});
    return () => { active = false; };
  }, [api]);

  if (!update || !api) return null;

  return <div role="status" className="flex shrink-0 flex-wrap items-center gap-2 border-b border-fruit-border bg-fruit-surface px-4 py-2 text-xs">
    <Download size={15} className="text-fruit-accent" aria-hidden="true" />
    <span className="flex-1">{t('OpenFruit Studio {0} è disponibile.', [update.version])}</span>
    {failedToOpen && <span>{t('Impossibile aprire la release.')}</span>}
    <button type="button" className="rounded-lg px-2 py-1 font-bold text-fruit-accent hover:bg-fruit-surfaceHover"
      onClick={() => { setFailedToOpen(false); void api.openStudioUpdate().catch(() => setFailedToOpen(true)); }}>
      {t('Apri release')}
    </button>
    <button type="button" aria-label={t('Chiudi avviso di aggiornamento')} className="rounded-lg p-1 hover:bg-fruit-surfaceHover"
      onClick={() => setUpdate(null)}><X size={14} /></button>
  </div>;
}
