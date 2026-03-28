/**
 * react/index.ts — Public API for pure React (non-Next.js) usage.
 *
 * Use this entry point in admin dashboards, Vite apps, CRA apps, etc.
 * Does NOT require Next.js as a dependency.
 *
 * Usage:
 *   import { ReactJsonRenderer } from 'next-json-component/react';
 *   // or for local development:
 *   import { ReactJsonRenderer } from '@/lib/next-json-component/react';
 */

// High-level CMS renderer (auto component resolution)
export { ReactJsonRenderer } from './ReactJsonRenderer';
export type { ReactJsonRendererProps, ReactJsonRendererOptions } from './ReactJsonRenderer';

// Runtime (stateful execution engine)
export { ReactJsonRuntime } from './ReactJsonRuntime';
export type { ReactJsonRuntimeProps } from './ReactJsonRuntime';

// Component factories
export { PureJsonComponent } from './PureJsonComponent';
export type { PureJsonComponentOptions } from './PureJsonComponent';
export { ReactJsonComponent } from './ReactJsonComponent';
export type { ReactJsonComponentFactoryOptions } from './ReactJsonComponent';

// Types
export type {
  JsonASTNode,
  AnalyzedNode,
  ActionBinding,
  JsonPropValue,
  ActionRegistry,
  RegistryAction,
  SetStateFn,
  ScopedStoreState,
  ReactJsonComponentOptions,
  RenderContext,
  JsonComponentDefinition,
  ComponentMapEntry,
} from '../types';
export { isJsonComponentDefinition } from '../types';

// Core utilities (for advanced usage)
export { analyzeTree, analyzeNode, isStaticNode } from '../static-analyzer';
export {
  createBoundHandler,
  validateRegistry,
  UnregisteredActionError,
} from '../action-registry';
export { safeEval, SafeEvalError } from '../safe-evaluator';
export { resolveExpression, isExpression } from '../expression-resolver';
export { JsonASTNodeSchema, JsonPropValueSchema, ActionBindingSchema } from '../schema';

// Component registry (for pre-building stable component registries)
export { createComponentRegistry } from '../component-registry';
