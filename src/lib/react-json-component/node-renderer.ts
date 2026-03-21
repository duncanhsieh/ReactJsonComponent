/**
 * node-renderer.ts
 *
 * Core shared rendering logic: converts a JSON AST node into a React element.
 * Used by both ServerJsonComponent (for static nodes) and ClientJsonHydrator
 * (for dynamic nodes).
 *
 * Handles:
 *   - $if conditional rendering
 *   - $each list rendering with hash-based keys
 *   - {{ }} expression resolution in props and text children
 *   - ActionBinding → event handler conversion
 *   - Component lookup from options.components
 */

import React from 'react';
import type { AnalyzedNode, RenderContext, JsonPropValue } from './types';
import { resolveExpression, isActionBinding } from './expression-resolver';
import { resolveHandler } from './action-registry';
import { generateKey } from './key-generator';

// ---------------------------------------------------------------------------
// Main render function
// ---------------------------------------------------------------------------

/**
 * Render a JSON AST node into a React element (or null if hidden by $if).
 *
 * @param node - The analyzed JSON AST node.
 * @param ctx  - The current render context.
 * @param key  - React key (provided by parent when rendering lists).
 * @returns A React element, array of elements (for $each), or null.
 */
export function renderNode(
  node: AnalyzedNode,
  ctx: RenderContext,
  key?: string,
): React.ReactNode {
  // --- $slot: output the React children passed in from the consumer ---
  if (node.type === '$slot') {
    const slotChildren = ctx.props?.children as React.ReactNode | undefined;
    return slotChildren ?? null;
  }

  // --- $if directive ---
  if (node.$if !== undefined) {
    const visible = resolveExpression(node.$if, ctx);
    if (!visible) return null;
  }

  // --- $each directive ---
  if (node.$each !== undefined) {
    return renderEach(node, ctx);
  }

  // --- Normal node rendering ---
  return renderSingleNode(node, ctx, key);
}

// ---------------------------------------------------------------------------
// $each list rendering
// ---------------------------------------------------------------------------

function renderEach(node: AnalyzedNode, ctx: RenderContext): React.ReactNode {
  const items = resolveExpression(node.$each!, ctx);

  if (!Array.isArray(items)) {
    console.warn(
      `[NextJsonComponent] $each expression did not resolve to an array. ` +
        `Got: ${typeof items}. Expression: ${node.$each}`,
    );
    return null;
  }

  const itemVar = node.$as ?? 'item';
  const indexVar = node.$indexAs ?? 'index';

  return items.map((item: unknown, index: number) => {
    // Build loop variable context
    const loopCtx: RenderContext = {
      ...ctx,
      loopVars: {
        ...(ctx.loopVars ?? {}),
        [itemVar]: item,
        [indexVar]: index,
      },
    };

    // Resolve the $key if provided
    let resolvedKey: unknown = undefined;
    if (node.$key) {
      resolvedKey = resolveExpression(node.$key, loopCtx);
    }

    const stableKey = generateKey(item, index, resolvedKey);

    // Create a copy of the node without $each to render as a single node
    const itemNode: AnalyzedNode = {
      ...node,
      $each: undefined,
      $key: undefined,
      $as: undefined,
      $indexAs: undefined,
    };

    return renderSingleNode(itemNode, loopCtx, stableKey);
  });
}

// ---------------------------------------------------------------------------
// Single node rendering
// ---------------------------------------------------------------------------

function renderSingleNode(
  node: AnalyzedNode,
  ctx: RenderContext,
  key?: string,
): React.ReactElement {
  // Resolve component type
  const componentType = resolveComponentType(node.type, ctx);

  // Resolve props
  const resolvedProps = resolveNodeProps(node.props ?? {}, ctx);

  // Add key
  if (key !== undefined) {
    resolvedProps.key = key;
  }

  // Render children
  const children = renderChildren(node.children ?? [], ctx);

  if (children.length === 0) {
    return React.createElement(componentType, resolvedProps);
  }

  return React.createElement(componentType, resolvedProps, ...children);
}

// ---------------------------------------------------------------------------
// Component type resolution
// ---------------------------------------------------------------------------

function resolveComponentType(
  typeName: string,
  ctx: RenderContext,
): string | React.ComponentType<Record<string, unknown>> {
  const { components } = ctx.options;
  if (components && typeName in components) {
    return components[typeName] as React.ComponentType<Record<string, unknown>>;
  }
  // Default: treat as HTML tag
  return typeName.toLowerCase();
}

// ---------------------------------------------------------------------------
// Props resolution
// ---------------------------------------------------------------------------

function resolveNodeProps(
  props: Record<string, JsonPropValue>,
  ctx: RenderContext,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(props)) {
    resolved[key] = resolveSingleProp(key, value, ctx);
  }

  return resolved;
}

function resolveSingleProp(
  key: string,
  value: JsonPropValue,
  ctx: RenderContext,
): unknown {
  // ActionBinding → event handler
  if (isActionBinding(value)) {
    const handler = resolveHandler(value, ctx);
    return handler;
  }

  // String → resolve {{ }} expressions
  if (typeof value === 'string') {
    return resolveExpression(value, ctx);
  }

  // Primitives — return as-is
  return value;
}

// ---------------------------------------------------------------------------
// Children rendering
// ---------------------------------------------------------------------------

function renderChildren(
  children: (AnalyzedNode | string)[],
  ctx: RenderContext,
): React.ReactNode[] {
  return children.map((child, i) => {
    if (typeof child === 'string') {
      // Resolve {{ }} in text content
      const resolved = resolveExpression(child, ctx);
      return String(resolved ?? '');
    }
    return renderNode(child, ctx, `child_${i}`);
  });
}
