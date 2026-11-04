export type GitOperation = 'push' | 'fetch' | 'clone' | 'manage';
export interface GitOperationResult {
  success: boolean;
  code: number;
  output: string;
  cancelled: boolean;
  error?: string;
}

export interface RepositoryInfo { branches:Array<{name:string;current:boolean;upstream:string}>;remotes:Array<{name:string;url:string}>;ahead:number;behind:number;conflicts:string[];stashes:Array<{ref:string;message:string}> }
export type RepositoryAction = {kind:'switch'|'create-branch'|'merge'|'rebase';branch:string} | {kind:'pull'|'stash-pop'|'merge-abort'|'rebase-abort'|'rebase-continue'} | {kind:'stash';message:string} | {kind:'add-remote';name:string;url:string} | {kind:'remove-remote';name:string};
