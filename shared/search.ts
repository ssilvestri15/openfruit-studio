export interface SearchRequest { root: string; query: string; regex?: boolean; caseSensitive?: boolean; wholeWord?: boolean; limit?: number }
export interface SearchMatch { path: string; line: number; column: number; endColumn: number; start: number; end: number; text: string; revision: string; replacement?: string }
export interface SearchResult { matches: SearchMatch[]; truncated: boolean; scanned: number }
export interface SearchReplacement { path: string; revision: string; matches: Array<{ start: number; end: number; replacement?: string }> }
