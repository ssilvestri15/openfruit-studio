import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import 'monaco-editor/esm/vs/basic-languages/swift/swift.contribution';
import 'monaco-editor/esm/vs/basic-languages/xml/xml.contribution';

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });

import 'monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution';
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution';
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution';
import 'monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution';
import 'monaco-editor/esm/vs/basic-languages/shell/shell.contribution';
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution';
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution';
import 'monaco-editor/esm/vs/language/json/monaco.contribution';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
self.MonacoEnvironment = { getWorker: (_moduleId, label) => label === 'json' ? new JsonWorker() : new EditorWorker() };
export function fileLanguage(name:string){
 const ext=name.split('.').at(-1)?.toLowerCase()||'';
 return ({swift:'swift',c:'c',h:'cpp',m:'cpp',mm:'cpp',cc:'cpp',cpp:'cpp',hpp:'cpp',json:'json',jsonc:'json',svg:'xml',plist:'xml',entitlements:'xml',xcstrings:'json',strings:'cpp',xml:'xml',storyboard:'xml',xib:'xml',xcworkspacedata:'xml',xcscheme:'xml',js:'javascript',jsx:'javascript',ts:'typescript',tsx:'typescript',md:'markdown',sh:'shell',py:'python',yml:'yaml',yaml:'yaml'} as Record<string,string>)[ext]||'plaintext';
}
