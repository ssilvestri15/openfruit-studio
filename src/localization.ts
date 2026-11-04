import { createContext, useCallback, useContext } from 'react';
import { translate, type Message } from '../shared/localization';
import { defaultPreferences, type Language } from '../shared/preferences';

export const LanguageContext = createContext<Language>(defaultPreferences.language);

export function useTranslation() {
  const language = useContext(LanguageContext);
  return useCallback((message: Message, values?: readonly unknown[]) =>
    translate(language, message, values), [language]);
}
