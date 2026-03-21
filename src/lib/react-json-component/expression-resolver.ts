/**
 * expression-resolver.ts
 *
 * Resolves {{ expr }} template expressions against a RenderContext.
 * All actual expression evaluation is delegated to the safe-evaluator.
 */

import { safeEval, SafeEvalError, evalFnExpression } from './safe-evaluator';
import type { RenderContext, JsonPropValue, ActionBinding } from './types';

// Matches one or more {{ expr }} placeholders.
const EXPR_PATTERN = /\{\{\s*([\s\S]*?)\s*\}\}/g;

/**
 * Check whether a string value contains at least one {{ }} template expression.
 */
export function isExpression(value: string): boolean {
  EXPR_PATTERN.lastIndex = 0;
  return EXPR_PATTERN.test(value);
}

/**
 * Detect whether the *inner* part of a `{{ }}` block is a function definition.
 * Matches:
 *   - Arrow functions:   `() => expr`, `(x) => { ... }`, `x => x + 1`
 *   - `function` keyword: `function(x) { ... }`
 * This check is intentionally permissive — false positives are impossible
 * because the `evalFnExpression` path will reject non-callable results.
 */
const FN_EXPR_PATTERN = /^\s*(async\s+)?((\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>|function\s*\()/;
export function isFnExpression(innerExpr: string): boolean {
  return FN_EXPR_PATTERN.test(innerExpr);
}

/**
 * Build the context object for the safe evaluator from the render context.
 * Merges state, props, and any loop variables (item, index, etc.).
 */
function buildEvalContext(ctx: RenderContext): Record<string, unknown> {
  return {
    state: ctx.state,
    props: ctx.props,
    setState: ctx.setState,
    ...(ctx.loopVars ?? {}),
  };
}

/**
 * Resolve a string template that may contain one or more {{ expr }} placeholders.
 *
 * - If the entire string is a single {{ expr }}, returns the raw evaluated value
 *   (preserving type: boolean, number, object, etc.).
 * - If the string contains {{ expr }} mixed with literal text, all placeholders
 *   are replaced with their string-coerced values and the full string is returned.
 *
 * @param template - A string potentially containing {{ }} expressions.
 * @param ctx      - The current render context.
 * @returns The resolved value.
 */
export function resolveExpression(template: string, ctx: RenderContext): unknown {
  const evalCtx = buildEvalContext(ctx);

  // Reset lastIndex for global regex
  EXPR_PATTERN.lastIndex = 0;
  const matches = [...template.matchAll(EXPR_PATTERN)];

  if (matches.length === 0) {
    // Pure literal — return as-is
    return template;
  }

  // Single {{ expr }} that is the ENTIRE string → preserve type
  if (matches.length === 1 && matches[0][0] === template.trim()) {
    const expr = matches[0][1];

    // --- Function-definition track ---
    // If the inner expression looks like an arrow/function definition,
    // route it through evalFnExpression (supports try/catch, Math.*, etc.).
    if (isFnExpression(expr)) {
      try {
        return evalFnExpression(expr, evalCtx);
      } catch (err) {
        console.warn(`[NextJsonComponent] Function expression evaluation failed: ${
          (err as Error).message
        }`);
        return undefined;
      }
    }

    // --- Standard value expression track ---
    return safelyEval(expr, evalCtx);
  }

  // Mixed string with multiple expressions or surrounding text
  // (function definitions are not meaningful here, so keep old path)
  return template.replace(EXPR_PATTERN, (_, expr: string) => {
    const val = safelyEval(expr.trim(), evalCtx);
    return val != null ? String(val) : '';
  });
}

/**
 * Safely evaluate an expression, returning undefined on SafeEvalError
 * and re-throwing other unexpected errors.
 */
function safelyEval(expr: string, evalCtx: Record<string, unknown>): unknown {
  try {
    return safeEval(expr, evalCtx);
  } catch (err) {
    if (err instanceof SafeEvalError) {
      console.warn(`[NextJsonComponent] Expression evaluation failed: ${err.message}`);
      return undefined;
    }
    throw err;
  }
}

/**
 * Resolve a single JSON prop value against the render context.
 * - Strings: template-expanded via {{ }}
 * - ActionBinding: returned as-is (resolved later by the action engine)
 * - Other primitives: returned unchanged
 */
export function resolvePropValue(value: JsonPropValue, ctx: RenderContext): unknown {
  if (typeof value === 'string') {
    return resolveExpression(value, ctx);
  }
  // ActionBinding or nested object — leave for the renderer/action engine
  return value;
}

/**
 * Resolve all props in a props map against the render context.
 * Returns a new object with all {{ }} expressions replaced.
 */
export function resolveProps(
  props: Record<string, JsonPropValue>,
  ctx: RenderContext,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    resolved[key] = resolvePropValue(value, ctx);
  }
  return resolved;
}

/**
 * Type-guard — check whether a value is an ActionBinding.
 */
export function isActionBinding(value: unknown): value is ActionBinding {
  return (
    typeof value === 'object' &&
    value !== null &&
    'action' in value &&
    typeof (value as ActionBinding).action === 'string'
  );
}
