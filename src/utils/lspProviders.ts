import type * as Monaco from 'monaco-editor';
let registered=false;
export function registerSemanticProviders(monaco:typeof Monaco){
 if(registered)return;registered=true;
 const range=(r:any)=>({startLineNumber:r.start.line+1,startColumn:r.start.character+1,endLineNumber:r.end.line+1,endColumn:r.end.character+1});
 const call=async(method:string,model:Monaco.editor.ITextModel,position?:Monaco.Position,extra?:object)=>{
  const api=(window as any).openfruitApi;if(!api?.lspSemantic||model.uri.scheme!=='file')return null;
  // Flush the current buffer before semantic queries, bypassing the edit debounce.
  await api.lspChangeDocument(model.uri.toString(),model.getValue());
  return api.lspSemantic({method,uri:model.uri.toString(),line:position?position.lineNumber-1:undefined,character:position?position.column-1:undefined,...extra});
 };
 const locations=(result:any)=>!result?[]:(Array.isArray(result)?result:[result]).map((l:any)=>({uri:monaco.Uri.parse(l.targetUri||l.uri),range:range(l.targetSelectionRange||l.range)}));
 monaco.languages.registerDefinitionProvider('swift',{provideDefinition:async(model,pos,token)=>{const result=await call('textDocument/definition',model,pos);return token.isCancellationRequested?null:locations(result);}});
 monaco.languages.registerReferenceProvider('swift',{provideReferences:async(model,pos,_context,token)=>{const result=await call('textDocument/references',model,pos);return token.isCancellationRequested?[]:locations(result);}});
 monaco.languages.registerDocumentSymbolProvider('swift',{provideDocumentSymbols:async(model,token)=>{
  const result=await call('textDocument/documentSymbol',model);if(token.isCancellationRequested||!Array.isArray(result))return [];
  const symbol=(s:any):Monaco.languages.DocumentSymbol=>({name:s.name,detail:s.detail||'',kind:Math.max(0,Math.min(25,(s.kind||1)-1)),tags:s.tags||[],range:range(s.range||s.location.range),selectionRange:range(s.selectionRange||s.range||s.location.range),children:s.children?.map(symbol)});return result.map(symbol);
 }});
 monaco.languages.registerSignatureHelpProvider('swift',{signatureHelpTriggerCharacters:['(',','],provideSignatureHelp:async(model,pos,token)=>{
  const result=await call('textDocument/signatureHelp',model,pos);if(!result||token.isCancellationRequested)return null;
  const docs=(d:any)=>typeof d==='string'?d:d?.value||'';
  return {value:{activeSignature:result.activeSignature||0,activeParameter:result.activeParameter||0,signatures:result.signatures.map((s:any)=>({label:s.label,documentation:docs(s.documentation),parameters:(s.parameters||[]).map((p:any)=>({label:p.label,documentation:docs(p.documentation)}))}))},dispose(){}};
 }});
 monaco.languages.registerFoldingRangeProvider('swift',{provideFoldingRanges:async(model,_context,token)=>{const result=await call('textDocument/foldingRange',model);return token.isCancellationRequested||!Array.isArray(result)?[]:result.map(r=>({start:r.startLine+1,end:r.endLine+1,kind:r.kind==='comment'?monaco.languages.FoldingRangeKind.Comment:r.kind==='imports'?monaco.languages.FoldingRangeKind.Imports:monaco.languages.FoldingRangeKind.Region}));}});
 monaco.languages.registerDocumentFormattingEditProvider('swift',{provideDocumentFormattingEdits:async(model,options,token)=>{const version=model.getVersionId(),result=await call('textDocument/formatting',model,undefined,{options});return token.isCancellationRequested||version!==model.getVersionId()||!Array.isArray(result)?[]:result.map(e=>({range:range(e.range),text:e.newText}));}});
 // Rename edits are limited to already-open Monaco models. All affected buffers stay dirty
 // and participate in normal save/revision/conflict protection; no implicit disk writes.
 monaco.languages.registerRenameProvider('swift',{provideRenameEdits:async(model,pos,newName,token)=>{
  const result=await call('textDocument/rename',model,pos,{newName});if(!result||token.isCancellationRequested)return {edits:[],rejectReason:'SourceKit non ha restituito modifiche.'};
  const changes:Array<{uri:string;edits:any[];version?:number}>=[];
  for(const [uri,edits]of Object.entries(result.changes||{}))changes.push({uri,edits:edits as any[]});
  for(const change of result.documentChanges||[]){if(!change.textDocument)return {edits:[],rejectReason:'Rinomine di file non supportate: nessuna modifica applicata.'};changes.push({uri:change.textDocument.uri,edits:change.edits,version:change.textDocument.version});}
  if(changes.some(c=>!monaco.editor.getModel(monaco.Uri.parse(c.uri))))return {edits:[],rejectReason:'Apri tutti i file interessati dalla rinomina e ripeti. Nessuna modifica applicata.'};
  if(!confirm('Applicare la rinomina semantica in '+changes.length+' file aperti? I buffer resteranno da salvare.'))return {edits:[]};
  return {edits:changes.flatMap(c=>{const resource=monaco.Uri.parse(c.uri),target=monaco.editor.getModel(resource)!;return c.edits.map(e=>({resource,versionId:target.getVersionId(),textEdit:{range:range(e.range),text:e.newText}}));})};
 }});
}
