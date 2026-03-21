import type { ComponentType } from 'react';

// ---------------------------------------------------------------------------
// JSON AST Schema
// ---------------------------------------------------------------------------

/**
 * A property value in a JSON AST node.
 * Can be a primitive, an action binding, or a nested object.
 */
export type JsonPropValue =
  | string
  | number
  | boolean
  | null
  | ActionBinding
  | Record<string, unknown>;

/**
 * Represents an action binding in Registry Mode.
 * JSON templates reference action names rather than embedding logic.
 */
export interface ActionBinding {
  /** The registered action name. */
  action: string;
  /** Whether this is a Next.js Server Action. */
  serverAction?: boolean;
  /** Arguments to pass, supporting {{ }} interpolation. */
  args?: (string | number | boolean)[];
}

/**
 * A single node in the JSON AST tree.
 */
export interface JsonASTNode {
  /** HTML tag name (e.g. 'div') or registered component name (e.g. 'Button'). */
  type: string;
  /** Node attributes. Values support {{ expr }} bindings and ActionBinding. */
  props?: Record<string, JsonPropValue>;
  /** Child nodes or text strings. */
  children?: (JsonASTNode | string)[];

  // --- Directives -----------------------------------------------------------

  /** Conditional rendering expression, e.g. "{{ state.show }}". */
  $if?: string;
  /** Iterable expression for list rendering, e.g. "{{ state.items }}". */
  $each?: string;
  /**
   * Key expression for each item, e.g. "{{ item.id }}".
   * If omitted, a hash of the item data is used.
   */
  $key?: string;
  /** Variable name for the current item (default: "item"). */
  $as?: string;
  /** Variable name for the current index (default: "index"). */
  $indexAs?: string;
}

// ---------------------------------------------------------------------------
// Analyzed / Pre-processed Nodes
// ---------------------------------------------------------------------------

/**
 * A JSON AST node that has been analyzed for static/dynamic classification.
 */
export interface AnalyzedNode extends JsonASTNode {
  /** True when this subtree has no expressions, directives, or action bindings. */
  isStatic?: boolean;
  children?: (AnalyzedNode | string)[];
}

// ---------------------------------------------------------------------------
// Action & Registry Types
// ---------------------------------------------------------------------------

/**
 * A function registered in the Action Registry.
 * Receives the current state, a setState helper, external props, and optional args.
 */
export type RegistryAction = (
  state: Record<string, unknown>,
  setState: SetStateFn,
  props: Record<string, unknown>,
  ...args: unknown[]
) => Promise<void> | void;

/** Map of action names to their implementations. */
export type ActionRegistry = Record<string, RegistryAction>;

// ---------------------------------------------------------------------------
// State Management
// ---------------------------------------------------------------------------

/**
 * setState function — supports partial object or updater function.
 */
export type SetStateFn = (
  update:
    | Partial<Record<string, unknown>>
    | ((state: Record<string, unknown>) => Partial<Record<string, unknown>>),
) => void;

/**
 * The scoped Zustand store state, including the setState helper.
 */
export interface ScopedStoreState extends Record<string, unknown> {
  setState: SetStateFn;
}

// ---------------------------------------------------------------------------
// Component Options
// ---------------------------------------------------------------------------

/**
 * Options passed to NextJsonComponent (and internally to the hydrator).
 */
export interface NextJsonComponentOptions {
  /** External React components available in the JSON template. */
  components?: Record<string, ComponentType<Record<string, unknown>>>;
  /** Action registry: pre-registered functions keyed by name. */
  actionRegistry?: ActionRegistry;
  /** Next.js Server Actions mapped by name. */
  serverActions?: Record<string, (...args: unknown[]) => Promise<unknown>>;
  /** Initial state for the scoped store. */
  initialState?: Record<string, unknown>;
  /**
   * Internal callback — called by ClientJsonHydrator once it creates its
   * Zustand store, giving ServerActionHydrator a stable reference to push
   * `_actions` state changes into without causing re-render loops.
   * @internal
   */
  _onStoreReady?: (setter: (partial: Record<string, unknown>) => void) => void;
}

// ---------------------------------------------------------------------------
// Render Context
// ---------------------------------------------------------------------------

/**
 * Runtime context passed through the render tree.
 */
export interface RenderContext {
  state: Record<string, unknown>;
  setState: SetStateFn;
  props: Record<string, unknown>;
  options: NextJsonComponentOptions;
  /** Extra variables injected by $each iteration (item, index, etc.) */
  loopVars?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Error Boundary
// ---------------------------------------------------------------------------

export interface ErrorBoundaryProps {
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// ---------------------------------------------------------------------------
// Boundary Splitter
// ---------------------------------------------------------------------------

/**
 * Result from the boundary splitter — describes whether a node (or subtree)
 * needs to cross the Server→Client boundary.
 */
export interface BoundaryAnalysis {
  needsClient: boolean;
}
