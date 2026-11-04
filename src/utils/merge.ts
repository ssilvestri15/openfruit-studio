import type { TabItem } from '../types';

export function assertMergeResolved(tab: TabItem) {
  if (tab.unresolvedMerge && /^(?:<{7}|\|{7}|={7}|>{7})(?:\s.*)?\r?$/m.test(tab.content)) {
    throw new Error('Risolvi i marcatori del merge prima di salvare o compilare');
  }
}
