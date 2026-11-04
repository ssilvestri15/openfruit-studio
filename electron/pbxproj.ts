import type { BuildSetting, XcodeEdit, XcodeTarget } from '../shared/xcode';

type Atom = { kind: 'atom'; value: string; start: number; end: number };
type List = { kind: 'array'; values: Node[]; start: number; end: number };
type Data = { kind: 'data'; start: number; end: number };
type Entry = { key: Atom; value: Node; end: number };
type Dictionary = { kind: 'dict'; entries: Map<string, Entry>; start: number; end: number };
type Node = Atom | List | Dictionary | Data;

// OpenStep plist syntax. Source ranges let edits retain comments, UUIDs, ordering
// and every unknown object/attribute, including future Xcode object types.
export function parsePbx(source: string): Dictionary {
  if (typeof source !== 'string' || source.length > 2 * 1024 * 1024) throw new Error('PBX: file troppo grande');
  let at = source.charCodeAt(0) === 0xfeff ? 1 : 0, count = 0;
  const fail = (message: string): never => { throw new Error(`PBX: ${message} (posizione ${at})`); };
  const skip = () => {
    while (at < source.length) {
      if (/\s/.test(source[at])) { at++; continue; }
      if (source.startsWith('//', at)) { const end = source.indexOf('\n', at + 2); at = end < 0 ? source.length : end + 1; continue; }
      if (source.startsWith('/*', at)) { const end = source.indexOf('*/', at + 2); if (end < 0) fail('commento non terminato'); at = end + 2; continue; }
      break;
    }
  };
  const atom = (): Atom => {
    skip(); const start = at; let value = '';
    if (source[at] === '"') {
      at++;
      while (at < source.length && source[at] !== '"') {
        let char = source[at++];
        if (char === '\\') {
          if (at >= source.length) fail('escape non terminato');
          char = source[at++];
          if (/[uU]/.test(char)) {
            const hex = source.slice(at, at + 4); if (!/^[0-9a-f]{4}$/i.test(hex)) fail('escape Unicode non valido');
            value += String.fromCharCode(parseInt(hex, 16)); at += 4; continue;
          }
          if (/[0-7]/.test(char)) {
            const rest = source.slice(at, at + 2).match(/^[0-7]{0,2}/)![0]; at += rest.length; value += String.fromCharCode(parseInt(char + rest, 8)); continue;
          }
          if (char === '\n') continue;
          const escapes: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };
          value += escapes[char] ?? char;
        } else value += char;
      }
      if (source[at++] !== '"') fail('stringa non terminata');
    } else {
      while (at < source.length && !/[\s{}()=;,"<>]/.test(source[at])) {
        if (source.startsWith('/*', at) || source.startsWith('//', at)) break;
        value += source[at++];
      }
      if (!value) fail('token non valido');
    }
    return { kind: 'atom', value, start, end: at };
  };
  const node = (depth: number): Node => {
    if (depth > 100 || ++count > 200000) fail('struttura troppo grande');
    skip(); const start = at;
    if (source[at] === '{') {
      at++; const entries = new Map<string, Entry>(); skip();
      while (at < source.length && source[at] !== '}') {
        const key = atom(); skip(); if (source[at++] !== '=') fail('atteso =');
        const value = node(depth + 1); skip(); if (source[at++] !== ';') fail('atteso ;');
        if (entries.has(key.value)) fail(`chiave duplicata: ${key.value}`);
        entries.set(key.value, { key, value, end: at }); skip();
      }
      if (source[at++] !== '}') fail('dizionario non terminato');
      return { kind: 'dict', entries, start, end: at };
    }
    if (source[at] === '(') {
      at++; const values: Node[] = []; skip();
      while (at < source.length && source[at] !== ')') {
        values.push(node(depth + 1)); skip();
        if (source[at] === ',') { at++; skip(); } else if (source[at] !== ')') fail('attesa virgola');
      }
      if (source[at++] !== ')') fail('array non terminato');
      return { kind: 'array', values, start, end: at };
    }
    if (source[at] === '<') {
      const end = source.indexOf('>', at + 1);
      if (end < 0 || !/^[\da-f\s]*$/i.test(source.slice(at + 1, end)) || source.slice(at + 1, end).replace(/\s/g, '').length % 2) fail('dato binario non valido');
      at = end + 1; return { kind: 'data', start, end: at };
    }
    return atom();
  };
  const root = node(0); skip();
  if (at !== source.length || root.kind !== 'dict') fail('radice non valida');
  return root as Dictionary;
}
export const get = (node: Node | undefined, key: string) => node?.kind === 'dict' ? node.entries.get(key)?.value : undefined;
export const text = (node: Node | undefined) => node?.kind === 'atom' ? node.value : '';
export const array = (node: Node | undefined) => node?.kind === 'array' ? node.values : [];

export function pbxModel(source: string, name: string) {
  const root = parsePbx(source), objects = get(root, 'objects');
  if (objects?.kind !== 'dict') throw new Error('PBX: sezione objects assente');
  const object = (id: string) => get(objects, id);
  const refs = (node: Node | undefined, key: string) => array(get(node, key)).map(text);
  const objectName = (id: string) => text(get(object(id), 'name')) || text(get(object(id), 'path')) || text(get(object(id), 'productName')) || text(get(object(id), 'remoteInfo')) || id;
  const configurations = (owner: Node | undefined) => refs(object(text(get(owner, 'buildConfigurationList'))), 'buildConfigurations').map(id => {
    const config = object(id);
    if (text(get(config, 'isa')) !== 'XCBuildConfiguration') throw new Error(`PBX: configurazione mancante ${id}`);
    const settingsNode = get(config, 'buildSettings');
    const settings: Record<string, BuildSetting> = Object.create(null);
    if (settingsNode?.kind === 'dict') for (const [key, entry] of settingsNode.entries) {
      if (entry.value.kind === 'atom') settings[key] = entry.value.value;
      else if (entry.value.kind === 'array' && entry.value.values.every(v => v.kind === 'atom')) settings[key] = entry.value.values.map(text);
    }
    const reference = text(get(config, 'baseConfigurationReference'));
    const anchor = text(get(config, 'baseConfigurationReferenceRelativePath'));
    return { id, name: text(get(config, 'name')), settings, baseConfiguration: reference ? objectName(reference) : anchor || undefined };
  });
  const target = (id: string): XcodeTarget => {
    const owner = object(id);
    if (!owner || owner.kind !== 'dict') throw new Error(`PBX: oggetto mancante ${id}`);
    return {
      id, name: text(get(owner, 'name')) || name, kind: text(get(owner, 'isa')), configurations: configurations(owner),
      dependencies: refs(owner, 'dependencies').map(ref => { const dependency = object(ref); const targetId = text(get(dependency, 'target')); return objectName(targetId || text(get(dependency, 'targetProxy'))) || ref; }),
      packages: refs(owner, 'packageProductDependencies').map(ref => {
        const product = object(ref), packageNode = object(text(get(product, 'package')));
        const url = text(get(packageNode, 'repositoryURL')) || text(get(packageNode, 'relativePath'));
        return [objectName(ref), url].filter(Boolean).join(' — ');
      }),
      phases: refs(owner, 'buildPhases').map(ref => {
        const phase = object(ref);
        return { id: ref, name: text(get(phase, 'name')) || text(get(phase, 'isa')).replace(/^PBX|BuildPhase$/g, ''), files: refs(phase, 'files').map(file => {
          const buildFile = object(file); return objectName(text(get(buildFile, 'fileRef')) || text(get(buildFile, 'productRef'))) || file;
        }) };
      })
    };
  };
  const projectId = text(get(root, 'rootObject')), projectNode = object(projectId);
  if (text(get(projectNode, 'isa')) !== 'PBXProject') throw new Error('PBX: rootObject non è un PBXProject');
  const project = target(projectId);
  project.packages = refs(projectNode, 'packageReferences').map(ref => text(get(object(ref), 'repositoryURL')) || text(get(object(ref), 'relativePath')) || objectName(ref));
  return { root, objects, project, targets: refs(projectNode, 'targets').map(target), object };
}

export function patchPbx(source: string, edits: XcodeEdit[]) {
  if (!Array.isArray(edits) || edits.length > 2000) throw new Error('PBX: troppe modifiche');
  const model = pbxModel(source, 'Project');
  const allowed = new Set([model.project, ...model.targets].flatMap(target => target.configurations.map(config => config.id)));
  const changes: Array<{ start: number; end: number; value: string }> = [];
  const insertions = new Map<Dictionary, string[]>(), unique = new Set<string>();
  const encode = (value: string) => JSON.stringify(value);
  for (const edit of edits) {
    if (!edit || !allowed.has(edit.configurationId) || typeof edit.key !== 'string' || !edit.key || edit.key.length > 256 || /[\x00-\x1f]/.test(edit.key)) throw new Error('PBX: modifica non valida');
    const identity = `${edit.configurationId}:${edit.key}`;
    if (unique.has(identity)) throw new Error('PBX: modifica duplicata'); unique.add(identity);
    const config = model.object(edit.configurationId), settings = get(config, 'buildSettings');
    if (settings?.kind !== 'dict') throw new Error('PBX: buildSettings non modificabile');
    const entry = settings.entries.get(edit.key);
    if (edit.value === null) { if (entry) changes.push({ start: entry.key.start, end: entry.end, value: '' }); continue; }
    const values = Array.isArray(edit.value) ? edit.value : [edit.value];
    if (values.length > 10000 || values.some(v => typeof v !== 'string' || v.length > 100000 || v.includes('\0'))) throw new Error('PBX: valore non valido');
    if (entry && entry.value.kind !== 'atom' && entry.value.kind !== 'array') throw new Error('PBX: valore strutturato non modificabile');
    const value = Array.isArray(edit.value) ? `(${values.map(encode).join(', ')}${values.length ? ',' : ''})` : encode(edit.value);
    if (entry) changes.push({ start: entry.value.start, end: entry.value.end, value });
    else insertions.set(settings, [...(insertions.get(settings) || []), `${encode(edit.key)} = ${value};`]);
  }
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  for (const [dictionary, values] of insertions) {
    const indent = source.slice(0, dictionary.start).match(/(?:^|\n)([\t ]*)[^\n]*$/)?.[1] || '';
    changes.push({ start: dictionary.end - 1, end: dictionary.end - 1, value: `${eol}${values.map(value => indent + '\t' + value).join(eol)}${eol}${indent}` });
  }
  let result = source;
  for (const change of changes.sort((a, b) => b.start - a.start)) result = result.slice(0, change.start) + change.value + result.slice(change.end);
  pbxModel(result, 'Project');
  return result;
}

export type PbxValue = string | PbxValue[] | { [key: string]: PbxValue };
export type ObjectPatch = { id: string; fields?: Record<string, PbxValue | null>; create?: Record<string, PbxValue>; remove?: boolean };
// Changes only the touched object/attribute ranges. Unknown ISA objects survive.
export function patchObjects(source: string, patches: ObjectPatch[]): string {
  const { objects } = pbxModel(source, 'Project');
  if (!Array.isArray(patches) || patches.length > 2000) throw new Error('PBX: troppe operazioni');
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const encode = (value: PbxValue, depth = 0): string => {
    if (depth > 50) throw new Error('PBX: valore troppo profondo');
    if (typeof value === 'string') { if (value.length > 100000 || value.includes('\0')) throw new Error('PBX: stringa non valida'); return JSON.stringify(value); }
    if (Array.isArray(value)) return '(' + value.map(v => encode(v, depth + 1)).join(', ') + (value.length ? ',' : '') + ')';
    if (!value || typeof value !== 'object') throw new Error('PBX: valore non valido');
    return '{ ' + Object.entries(value).map(([key, val]) => JSON.stringify(key) + ' = ' + encode(val, depth + 1) + ';').join(' ') + ' }';
  };
  const changes: Array<{start:number;end:number;value:string}> = [], ids = new Set<string>();
  for (const patch of patches) {
    if (!patch || !/^[A-Za-z0-9_]{1,128}$/.test(patch.id) || ids.has(patch.id)) throw new Error('PBX: ID duplicato o non valido');
    ids.add(patch.id);
    const entry = objects.entries.get(patch.id);
    if (patch.create) {
      if (entry || patch.remove || patch.fields) throw new Error('PBX: oggetto già esistente');
      changes.push({start:objects.end-1,end:objects.end-1,value:eol+'\t\t'+JSON.stringify(patch.id)+' = '+encode(patch.create)+';'+eol}); continue;
    }
    if (!entry || entry.value.kind !== 'dict') throw new Error('PBX: oggetto non trovato');
    if (patch.remove) { if (patch.fields) throw new Error('PBX: operazione ambigua'); changes.push({start:entry.key.start,end:entry.end,value:''}); continue; }
    const dictionary = entry.value, insertions: string[] = [];
    for (const [key,value] of Object.entries(patch.fields || {})) {
      if (!key || key.length > 256 || /[\x00-\x1f]/.test(key)) throw new Error('PBX: attributo non valido');
      const field = dictionary.entries.get(key);
      if (value === null) { if (field) changes.push({start:field.key.start,end:field.end,value:''}); }
      else if (field) changes.push({start:field.value.start,end:field.value.end,value:encode(value)});
      else insertions.push(JSON.stringify(key)+' = '+encode(value)+';');
    }
    if (insertions.length) changes.push({start:dictionary.end-1,end:dictionary.end-1,value:eol+'\t\t\t'+insertions.join(eol+'\t\t\t')+eol+'\t\t'});
  }
  let result=source;
  // Stable sorting retains the order of additions at the same insertion point.
  for (const change of changes.sort((a,b)=>b.start-a.start)) result=result.slice(0,change.start)+change.value+result.slice(change.end);
  pbxModel(result,'Project'); return result;
}
