import { translate } from '../../shared/localization';
import { useEffect, useState } from 'react';
import { defaultPreferences, type Preferences } from '../../shared/preferences';
type PreferenceApi = {
  loadPreferences(): Promise<Preferences>;
  savePreferences(value: Preferences): Promise<Preferences>;
  onPreferencesChanged(callback: (value: Preferences) => void): () => void;
};
export function usePreferences() {
  const [preferences, setPreferences] = useState(defaultPreferences), [preferenceError, setPreferenceError] = useState('');
  const api = (window as unknown as { openfruitApi?: PreferenceApi }).openfruitApi;
  useEffect(() => {
    let current = true;
    api?.loadPreferences().then(value => { if (current) setPreferences(value); }).catch(error => { if (current) setPreferenceError(error.message); });
    const unsubscribe = api?.onPreferencesChanged(value => { if (current) setPreferences(value); });
    return () => { current = false; unsubscribe?.(); };
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = preferences.theme; }, [preferences.theme]);
  const savePreferences = async (value: Preferences) => {
    if (!api) throw new Error(translate(preferences.language, "Preferenze disponibili nell’app desktop"));
    try { const saved = await api.savePreferences(value); setPreferences(saved); setPreferenceError(''); }
    catch (error: any) { setPreferenceError(error.message); throw error; }
  };
  return { preferences, savePreferences, preferenceError };
}
