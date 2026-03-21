/**
 * store.ts
 *
 * Scoped Zustand store factory for NextJsonComponent.
 * Each component instance gets its own independent store,
 * preventing state leakage between sibling components.
 */

import { create } from 'zustand';
import type { SetStateFn, ScopedStoreState } from '../types';

/**
 * Creates an independent Zustand store for a single NextJsonComponent instance.
 *
 * @param initialState - The starting state values.
 * @returns A Zustand `useStore` hook bound to the scoped store.
 */
export function createScopedStore(initialState: Record<string, unknown> = {}) {
  return create<ScopedStoreState>((set, get) => ({
    ...initialState,
    setState: ((update) => {
      set((current) => {
        const partial = typeof update === 'function' ? update(current) : update;
        return { ...current, ...partial };
      });
    }) as SetStateFn,
    // Expose getState for use in action handlers
    getState: () => get(),
  }));
}

export type ScopedStore = ReturnType<typeof createScopedStore>;
