/**
 * action-registry.test.ts
 *
 * Tests for the Registry Mode action engine.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createBoundHandler,
  validateRegistry,
  resolveHandler,
  UnregisteredActionError,
} from '../action-registry';
import type { ActionRegistry, RenderContext } from '../types';

const makeCtx = (overrides: Partial<RenderContext> = {}): RenderContext => ({
  state: { count: 0 },
  setState: vi.fn(),
  props: {},
  options: {},
  ...overrides,
});

describe('validateRegistry', () => {
  it('passes for a valid registry with all functions', () => {
    expect(() =>
      validateRegistry({ increment: vi.fn(), decrement: vi.fn() }),
    ).not.toThrow();
  });

  it('throws for non-function registry values', () => {
    expect(() =>
      validateRegistry({ bad: 'not a function' } as unknown as ActionRegistry),
    ).toThrow(TypeError);
  });
});

describe('createBoundHandler', () => {
  it('calls the registered action on invocation', async () => {
    const mockAction = vi.fn();
    const registry: ActionRegistry = { doSomething: mockAction };
    const binding = { action: 'doSomething' };
    const ctx = makeCtx({ options: { actionRegistry: registry } });

    const handler = createBoundHandler(binding, registry, ctx);
    await handler();

    expect(mockAction).toHaveBeenCalledOnce();
  });

  it('passes state, setState, and props to the action', async () => {
    const mockAction = vi.fn();
    const registry: ActionRegistry = { test: mockAction };
    const ctx = makeCtx({
      state: { count: 5 },
      props: { label: 'hello' },
      options: { actionRegistry: registry },
    });

    const handler = createBoundHandler({ action: 'test' }, registry, ctx);
    await handler();

    expect(mockAction).toHaveBeenCalledWith(
      ctx.state,
      ctx.setState,
      ctx.props,
    );
  });

  it('resolves {{ }} template args before passing to action', async () => {
    const mockAction = vi.fn();
    const registry: ActionRegistry = { fetchUser: mockAction };
    const ctx = makeCtx({
      state: { userId: 99 },
      options: { actionRegistry: registry },
    });

    const handler = createBoundHandler(
      { action: 'fetchUser', args: ['{{ state.userId }}'] },
      registry,
      ctx,
    );
    await handler();

    expect(mockAction).toHaveBeenCalledWith(
      ctx.state,
      ctx.setState,
      ctx.props,
      99,
    );
  });

  it('throws UnregisteredActionError for unregistered actions', async () => {
    const registry: ActionRegistry = {};
    const ctx = makeCtx({ options: { actionRegistry: registry } });
    const handler = createBoundHandler({ action: 'missing' }, registry, ctx);

    await expect(handler()).rejects.toThrow(UnregisteredActionError);
  });

  it('logs error without throwing on action runtime error', async () => {
    const brokenAction = vi.fn().mockRejectedValue(new Error('boom'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const registry: ActionRegistry = { broken: brokenAction };
    const ctx = makeCtx({ options: { actionRegistry: registry } });

    const handler = createBoundHandler({ action: 'broken' }, registry, ctx);
    // Should not throw
    await expect(handler()).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});

describe('resolveHandler', () => {
  it('resolves from actionRegistry', () => {
    const mockFn = vi.fn();
    const ctx = makeCtx({ options: { actionRegistry: { click: mockFn } } });
    const handler = resolveHandler({ action: 'click' }, ctx);
    expect(handler).toBeDefined();
    expect(typeof handler).toBe('function');
  });

  it('returns undefined when action not found in any registry', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctx = makeCtx({ options: { actionRegistry: {} } });
    const handler = resolveHandler({ action: 'missing' }, ctx);
    expect(handler).toBeUndefined();
    warnSpy.mockRestore();
  });
});
