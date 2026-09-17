import { useSyncExternalStore } from 'react';
import { estimateStore } from './estimateStore';

export function useEstimateDraft() {
  return useSyncExternalStore(estimateStore.subscribe, estimateStore.get, estimateStore.get);
}
