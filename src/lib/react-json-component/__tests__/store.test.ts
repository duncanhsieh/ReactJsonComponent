/**
 * store.test.ts
 *
 * Unit tests for the scoped Zustand store factory.
 */

import { describe, it, expect } from 'vitest';
import { createScopedStore } from '../store/store';

describe('createScopedStore — scoping and isolation', () => {
  it('creates an independent store', () => {
    const store = createScopedStore({ count: 5 });
    const state = store.getState();
    expect(state.count).toBe(5);
  });

  it('keeps sibling stores completely isolated', () => {
    const store1 = createScopedStore({ _id: 1, shared: false });
    const store2 = createScopedStore({ _id: 2, shared: false });

    store1.getState().setState({ shared: true });

    expect(store1.getState().shared).toBe(true);
    expect(store2.getState().shared).toBe(false);
  });
});

describe('createScopedStore — setState logic', () => {
  it('updates state via object literal', () => {
    const store = createScopedStore({ name: 'Alice', age: 25 });
    store.getState().setState({ age: 26 });
    expect(store.getState().age).toBe(26);
    expect(store.getState().name).toBe('Alice'); // preservers other fields
  });

  it('updates state via callback function', () => {
    const store = createScopedStore({ count: 0 });
    store.getState().setState((prev) => ({ count: prev.count as number + 1 }));
    expect(store.getState().count).toBe(1);
    
    // Multiple updates
    store.getState().setState((prev) => ({ count: prev.count as number + 5 }));
    expect(store.getState().count).toBe(6);
  });

  it('handles empty initialState gracefully', () => {
    const store = createScopedStore();
    expect(store.getState()).toBeDefined();
    expect(typeof store.getState().setState).toBe('function');
  });

  it('preserves deep nested states if not overwritten', () => {
    const store = createScopedStore({ nested: { a: 1, b: 2 } });
    store.getState().setState({ other: true });
    
    // Zustand's shallow merge doesn't merge deeply, it overwrites top-level keys.
    // So 'nested' should remain untouched because we only set 'other'
    expect((store.getState().nested as any).a).toBe(1);
    expect(store.getState().other).toBe(true);
  });
});
