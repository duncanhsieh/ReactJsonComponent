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

// ---------------------------------------------------------------------------
// Immer-specific tests
// ---------------------------------------------------------------------------

describe('createScopedStore — Immer draft mutation', () => {
  it('mutates a top-level draft property directly', () => {
    const store = createScopedStore({ count: 0 });
    store.getState().setState((draft) => {
      draft.count = 10;
    });
    expect(store.getState().count).toBe(10);
  });

  it('mutates deeply nested objects via draft', () => {
    const store = createScopedStore({
      form: { address: { city: 'Taipei', zip: '100' } },
    });

    store.getState().setState((draft) => {
      (draft.form as any).address.city = 'Kaohsiung';
    });

    expect((store.getState().form as any).address.city).toBe('Kaohsiung');
    expect((store.getState().form as any).address.zip).toBe('100'); // unchanged
  });

  it('pushes to an array via draft', () => {
    const store = createScopedStore({
      items: [{ id: 1, text: 'first' }],
    });

    store.getState().setState((draft) => {
      (draft.items as any[]).push({ id: 2, text: 'second' });
    });

    const items = store.getState().items as any[];
    expect(items).toHaveLength(2);
    expect(items[1].text).toBe('second');
  });

  it('splices an array via draft', () => {
    const store = createScopedStore({
      items: ['apple', 'banana', 'cherry'],
    });

    store.getState().setState((draft) => {
      (draft.items as string[]).splice(1, 1); // remove 'banana'
    });

    const items = store.getState().items as string[];
    expect(items).toEqual(['apple', 'cherry']);
  });

  it('finds and toggles a nested property in an array item', () => {
    const store = createScopedStore({
      todos: [
        { id: 1, text: 'A', done: false },
        { id: 2, text: 'B', done: false },
      ],
    });

    store.getState().setState((draft) => {
      const todo = (draft.todos as any[]).find(t => t.id === 2);
      if (todo) todo.done = true;
    });

    const todos = store.getState().todos as any[];
    expect(todos[0].done).toBe(false);
    expect(todos[1].done).toBe(true);
  });

  it('Immer mutation preserves other top-level keys', () => {
    const store = createScopedStore({ a: 1, b: 2, c: 3 });

    store.getState().setState((draft) => {
      draft.b = 99;
    });

    expect(store.getState().a).toBe(1);
    expect(store.getState().b).toBe(99);
    expect(store.getState().c).toBe(3);
  });

  it('sibling stores remain isolated with Immer mutation', () => {
    const store1 = createScopedStore({ items: [1, 2, 3] });
    const store2 = createScopedStore({ items: [10, 20, 30] });

    store1.getState().setState((draft) => {
      (draft.items as number[]).push(4);
    });

    expect((store1.getState().items as number[])).toEqual([1, 2, 3, 4]);
    expect((store2.getState().items as number[])).toEqual([10, 20, 30]); // untouched
  });
});
