export const defaultKeybindings = {open:'Ctrl+O',newWindow:'Ctrl+Shift+W',newFile:'Ctrl+N',newProject:'Ctrl+Shift+N',save:'Ctrl+S',saveAll:'Ctrl+Shift+S',saveAs:'Ctrl+Alt+Shift+S',palette:'Ctrl+Shift+P',quickOpen:'Ctrl+P',search:'Ctrl+Shift+F',replace:'Ctrl+Shift+H',toggleFiles:'Ctrl+B',toggleTerminal:'Ctrl+J',toggleCanvas:'Ctrl+Alt+P',build:'Ctrl+R'};
export type ShortcutAction = keyof typeof defaultKeybindings;
export type Language = 'en' | 'it';
export function normalizeShortcut(value:string){
  if(!value)return '';if(typeof value!=='string'||value.length>64)throw new Error('Scorciatoia non valida');
  const parts=value.toLowerCase().split('+'),key=parts.pop()!,modifiers=new Set(parts);
  if(!/^(?:[a-z0-9]|f[1-9]|f1[0-2]|space|enter|escape)$/.test(key)||parts.some(p=>!['ctrl','alt','shift'].includes(p))||modifiers.size!==parts.length||!parts.length)throw new Error('Usa Ctrl/Alt/Shift + tasto (es. Ctrl+Shift+P)');
  return ['ctrl','alt','shift'].filter(p=>modifiers.has(p)).concat(key).join('+');
}
export function shortcutMatches(event:{key:string;ctrlKey:boolean;metaKey:boolean;altKey:boolean;shiftKey:boolean},binding:string){
 if(!binding)return false;const normalized=normalizeShortcut(binding),parts=normalized.split('+'),key=parts.at(-1);
 return !!(event.ctrlKey||event.metaKey)===parts.includes('ctrl')&&event.altKey===parts.includes('alt')&&event.shiftKey===parts.includes('shift')&&(event.key===' '?'space':event.key.toLowerCase())===key;
}
export interface Preferences {
  language: Language;
  keybindings: typeof defaultKeybindings;
  fontSize: number; tabSize: number; wordWrap: boolean; minimap: boolean;
  autoSave: 'off' | 'afterDelay'; autoSaveDelay: number; theme: 'dark' | 'light';
  terminalFontSize: number; terminalScrollback: number;
}
export const defaultPreferences: Preferences = {
  language: 'it',
  keybindings: {...defaultKeybindings},
  fontSize: 13, tabSize: 4, wordWrap: false, minimap: true, autoSave: 'off', autoSaveDelay: 1500,
  theme: 'dark', terminalFontSize: 12, terminalScrollback: 3000
};
export function validatePreferences(input: unknown): Preferences {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Preferenze non valide');
  const value = { ...defaultPreferences, ...input } as Preferences;
  for (const [key, min, max] of [['fontSize', 9, 32], ['tabSize', 1, 8], ['autoSaveDelay', 500, 30000], ['terminalFontSize', 9, 32], ['terminalScrollback', 100, 20000]] as const) {
    if (!Number.isInteger(value[key]) || value[key] < min || value[key] > max) throw new Error(`Preferenza non valida: ${key}`);
  }
  for (const key of ['wordWrap', 'minimap'] as const) if (typeof value[key] !== 'boolean') throw new Error(`Preferenza non valida: ${key}`);
  if (!['off', 'afterDelay'].includes(value.autoSave) || !['dark', 'light'].includes(value.theme) ||
      !['en', 'it'].includes(value.language)) throw new Error('Preferenze non valide');
  const bindings=(input as Partial<Preferences>).keybindings||defaultKeybindings;
  if(!bindings||typeof bindings!=='object'||Array.isArray(bindings))throw new Error('Scorciatoie non valide');
  const unique=new Set<string>();value.keybindings={...defaultKeybindings};
  for(const action of Object.keys(defaultKeybindings) as ShortcutAction[]){const key=bindings[action]??defaultKeybindings[action];if(typeof key!=='string')throw new Error('Scorciatoia non valida');const canonical=normalizeShortcut(key);if(canonical&&unique.has(canonical))throw new Error('Scorciatoia duplicata: '+key);if(canonical)unique.add(canonical);value.keybindings[action]=key;}
  return Object.fromEntries(Object.keys(defaultPreferences).map(key => [key, value[key as keyof Preferences]])) as unknown as Preferences;
}
