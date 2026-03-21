/**
 * store.ts
 *
 * Scoped Zustand store factory for ReactJsonComponent.
 * Each component instance gets its own independent store,
 * preventing state leakage between sibling components.
 *
 * Uses the Immer middleware so that action handlers can either:
 *   1. Mutate the draft directly (Immer mode):
 *        setState((draft) => { draft.count = 10; })
 *   2. Return a partial object (classic mode, backward-compatible):
 *        setState({ count: 10 })
 *        setState((prev) => ({ count: prev.count + 1 }))
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { SetStateFn, ScopedStoreState } from '../types';

/**
 * Creates an independent Zustand store for a single ReactJsonComponent instance.
 *
 * @param initialState - The starting state values.
 * @returns A Zustand `useStore` hook bound to the scoped store.
 */
export function createScopedStore(initialState: Record<string, unknown> = {}) {
  return create<ScopedStoreState>()(
    immer((set, get) => ({
      ...initialState,
      setState: ((update) => {
        if (typeof update === 'function') {
          // The updater can either:
          //   a) Mutate the draft in-place and return void  (Immer mode)
          //   b) Return a partial object to merge            (classic mode)
          set((draft) => {
            const result = update(draft);
            // If the updater returned a partial object, merge it into draft.
            if (result !== undefined && result !== null && typeof result === 'object') {
              Object.assign(draft, result);
            }
          });
        } else {
          // Partial object — merge into draft.
          set((draft) => {
            Object.assign(draft, update);
          });
        }
      }) as SetStateFn,
      // Expose getState for use in action handlers
      getState: () => get(),
    }))
  );
}

export type ScopedStore = ReturnType<typeof createScopedStore>;
