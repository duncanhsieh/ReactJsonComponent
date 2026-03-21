/**
 * action-registry.ts
 *
 * Implements the Registry Mode action engine.
 * JSON templates reference action names + args; actual logic lives in code.
 * This eliminates all `new Function` / eval usage for actions.
 */

import type { ActionRegistry, ActionBinding, RenderContext, SetStateFn } from './types';
import { resolveExpression } from './expression-resolver';

/** Error thrown when an unregistered action is invoked. */
export class UnregisteredActionError extends Error {
  constructor(name: string, available: string[]) {
    super(
      `[ActionRegistry] Action "${name}" is not registered. ` +
        `Available actions: [${available.join(', ')}]`,
    );
    this.name = 'UnregisteredActionError';
  }
}

/**
 * Resolve the args array of an ActionBinding, expanding any {{ }} expressions.
 */
function resolveArgs(
  args: ActionBinding['args'],
  ctx: RenderContext,
): unknown[] {
  if (!args || args.length === 0) return [];
  return args.map((arg) => {
    if (typeof arg === 'string') {
      return resolveExpression(arg, ctx);
    }
    return arg;
  });
}

/**
 * Create a bound event handler from an ActionBinding.
 */
export function createBoundHandler(
  binding: ActionBinding,
  registry: ActionRegistry,
  ctx: RenderContext,
): (...eventArgs: unknown[]) => Promise<void> | void {
  return async (...eventArgs: unknown[]) => {
    // Prevent default if first arg is an event
    const event = eventArgs[0];
    if (event && typeof event === 'object' && 'preventDefault' in event) {
      (event as any).preventDefault();
    }

    const action = registry[binding.action];
    if (!action) {
      throw new UnregisteredActionError(binding.action, Object.keys(registry));
    }

    const resolvedArgs = resolveArgs(binding.args, ctx);

    try {
      await action(
        ctx.state,
        ctx.setState,
        ctx.props,
        ...resolvedArgs,
        ...eventArgs
      );
    } catch (err) {
      console.error(`[ActionRegistry] Error executing action "${binding.action}":`, err);
    }
  };
}

/**
 * Create a bound handler for a Next.js Server Action.
 */
export function createBoundServerActionHandler(
  actionName: string,
  serverAction: (...args: unknown[]) => Promise<unknown>,
  binding: ActionBinding,
  ctx: RenderContext,
): (...eventArgs: unknown[]) => Promise<void> {
  return async (...eventArgs: unknown[]) => {
    // Prevent default if first arg is an event
    const event = eventArgs[0];
    if (event && typeof event === 'object' && 'preventDefault' in event) {
      (event as any).preventDefault();
    }

    const resolvedArgs = resolveArgs(binding.args, ctx);
    try {
      // Server actions usually expect controlled arguments, not the raw Event object.
      // But we append eventArgs just in case the server action supports it.
      await serverAction(...resolvedArgs, ...eventArgs);
    } catch (err) {
      console.error(`[ActionRegistry] Error executing server action "${actionName}":`, err);
    }
  };
}

/**
 * Validate an ActionRegistry.
 */
export function validateRegistry(registry: ActionRegistry): void {
  for (const [name, fn] of Object.entries(registry)) {
    if (typeof fn !== 'function') {
      throw new TypeError(`[ActionRegistry] Action "${name}" must be a function.`);
    }
  }
}

/**
 * Build an action handler.
 */
export function resolveHandler(
  binding: ActionBinding,
  ctx: RenderContext,
): ((...args: unknown[]) => Promise<void> | void) | undefined {
  const { actionRegistry, serverActions } = ctx.options;

  if (binding.serverAction && serverActions?.[binding.action]) {
    return createBoundServerActionHandler(
      binding.action,
      serverActions[binding.action],
      binding,
      ctx,
    );
  }

  if (actionRegistry?.[binding.action]) {
    return createBoundHandler(binding, actionRegistry, ctx);
  }

  console.warn(`[ActionRegistry] No handler found for action "${binding.action}".`);
  return undefined;
}

/**
 * Convenience — create a setState wrapper.
 */
export function createSetState(
  set: (updater: (s: Record<string, unknown>) => Record<string, unknown>) => void,
): SetStateFn {
  return (update) => {
    set((current) => {
      const partial = typeof update === 'function' ? update(current) : update;
      return { ...current, ...partial };
    });
  };
}
