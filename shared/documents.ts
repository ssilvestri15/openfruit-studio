export type DocumentContent =
 | {kind:'text';content:string;revision:string;format?:'svg'}
 | {kind:'image';dataUrl:string;mime:string;bytes:number;revision:string}
 | {kind:'binary';bytes:number;revision:string};
export interface CommitFile {path:string;oldPath?:string;status:string}
export interface CommitDetails {hash:string;parents:string[];parent:string|null;parentIndex:number;files:CommitFile[]}
export interface CommitComparison {details:CommitDetails;file:CommitFile;before:DocumentContent|null;after:DocumentContent|null}

export function documentFields(document:DocumentContent){
 return {content:document.kind==='text'?document.content:'',baseContent:document.kind==='text'?document.content:'',revision:document.revision,document:document.kind==='text'?undefined:document};
}
