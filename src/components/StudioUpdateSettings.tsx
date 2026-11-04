import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { StudioUpdateApi, StudioUpdateChannel, StudioUpdatePreference, StudioUpdateState } from '../../shared/updates';
import { useTranslation } from '../localization';

const button = 'rounded-lg border border-fruit-border px-3 py-2 text-xs hover:bg-fruit-surface disabled:opacity-40';

export function StudioUpdateSettings({ preference, savedPreference, onChannelChange }: {
  preference: StudioUpdatePreference;
  savedPreference: StudioUpdatePreference;
  onChannelChange: (channel: StudioUpdateChannel) => void;
}) {
  const t = useTranslation();
  const api = (window as Window & { openfruitApi?: StudioUpdateApi }).openfruitApi;
  const [state, setState] = useState<StudioUpdateState>();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<'check' | 'open'>();
  const channel = preference === 'auto' ? state?.channel : preference;
  const pendingChannel = preference !== savedPreference;

  async function check(refresh: boolean, active = () => true) {
    setChecking(true);
    setError(undefined);
    try {
      if (!api?.checkStudioUpdate) throw new Error('Update bridge unavailable');
      const result = await api.checkStudioUpdate(refresh);
      if (active()) setState(result);
    } catch {
      if (active()) setError('check');
    } finally {
      if (active()) setChecking(false);
    }
  }

  useEffect(() => {
    let active = true;
    void check(false, () => active);
    return () => { active = false; };
  }, [api]);

  return <div className="max-w-lg space-y-4">
    <h3 className="font-bold">{t('Aggiornamenti')}</h3>
    {state && <dl className="grid grid-cols-2 gap-2 rounded-xl border border-fruit-border bg-fruit-surface p-4 text-sm">
      <dt className="text-fruit-textMuted">{t('Versione installata')}</dt>
      <dd className="font-mono">{state.version}</dd>
    </dl>}
    <label className="block space-y-2 text-sm">
      <span>{t('Canale aggiornamenti')}</span>
      <select className="block w-full rounded-lg border border-fruit-border bg-fruit-editor px-3 py-2"
        value={channel ?? ''} disabled={!channel}
        onChange={event => onChannelChange(event.target.value === 'preview' ? 'preview' : 'stable')}>
        {!channel && <option value="" hidden />}
        <option value="preview">Preview</option>
        <option value="stable">{t('Stabile')}</option>
      </select>
    </label>
    <p className="text-xs text-fruit-textMuted">{t('Preview include le prerelease. Release cerca solo versioni stabili.')}</p>
    <p role="status" className="text-sm text-fruit-textMuted">
      {pendingChannel ? t('Salva le preferenze per applicare il canale.')
        : checking ? t('Ricerca aggiornamenti…')
        : error === 'open' ? t('Impossibile aprire la release.')
        : error === 'check' || state?.status === 'unavailable' ? t('Impossibile controllare GitHub Releases. Verifica la connessione e che il repository sia pubblico.')
        : state?.status === 'current' ? t('Nessun aggiornamento disponibile.')
        : state?.status === 'available' ? t('OpenFruit Studio {0} è disponibile.', [state.update.version])
        : null}
    </p>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={button} disabled={pendingChannel || checking || !api?.checkStudioUpdate} onClick={() => void check(true)}>
        <RefreshCw size={13} className="mr-2 inline" aria-hidden="true" />{t('Controlla aggiornamenti')}
      </button>
      {!pendingChannel && state?.status === 'available' && <button type="button" className={button} disabled={checking}
        onClick={() => { setError(undefined); void api?.openStudioUpdate().catch(() => setError('open')); }}>
        {t('Apri release')}
      </button>}
    </div>
  </div>;
}
