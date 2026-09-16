import { useSyncExternalStore } from 'react';
import type { Item } from '@/types';
import { itemsRepo } from '@/services/storage/itemsRepo';

export function useItems(): Item[] {
  return useSyncExternalStore(itemsRepo.subscribe, itemsRepo.all, itemsRepo.all);
}
