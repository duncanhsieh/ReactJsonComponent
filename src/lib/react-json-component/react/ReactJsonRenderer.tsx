/**
 * ReactJsonRenderer.tsx
 *
 * High-level CMS renderer with automatic component dependency resolution.
 *
 * Unlike `ReactJsonRuntime`, which requires developers to manually create
 * component factories and wire up dependencies, `ReactJsonRenderer` accepts
 * a **mixed** `components` map in `options` where each entry is either:
 *
 *   - A native React `ComponentType` (e.g. imported from `@headlessui/react`), OR
 *   - A `JsonComponentDefinition` object with a JSON `template` and optional options.
 *
 * `ReactJsonRenderer` will automatically:
 *  1. Detect which entries are JSON definitions.
 *  2. Build `PureJsonComponent` or `ReactJsonComponent` factories (once, via WeakMap cache).
 *  3. Inject the **full resolved component map** into every JSON factory, so
 *     inter-component dependencies (e.g. `MyTabControl` using `MyTab`) are
 *     satisfied without any extra configuration.
 *
 * ## Performance: Factory caching across page navigation
 *
 * A module-level `WeakMap` caches resolved factory maps. If the same
 * `components` object reference is passed on re-mount (e.g. after page
 * navigation), the cache is hit and no factories are recreated.
 *
 * For apps with many CMS components, define the `components` map at module
 * scope (or use `createComponentRegistry()`) to get permanent caching:
 *
 * ```tsx
 * // ✅ Module scope — factories created once for the app lifetime
 * const components = { ...headlessui, MyCard: { template: {...} } };
 *
 * // ✅ Or pre-build explicitly for maximum control
 * const registry = createComponentRegistry({ ...headlessui, MyCard: {...} });
 *
 * function CmsPage({ ast }) {
 *   // WeakMap hit on every mount after the first
 *   return <ReactJsonRenderer template={ast} options={{ components }} />;
 *   // — or —
 *   return <ReactJsonRenderer template={ast} registry={registry} />;
 * }
 * ```
 *
 * @example Basic usage
 * ```tsx
 * <ReactJsonRenderer
 *   template={pageJsonAst}
 *   options={{
 *     actionRegistry: { increment: (s, set) => set({ count: s.count + 1 }) },
 *     initialState: { count: 0 },
 *     components: {
 *       ...headlessui,
 *       MyTabControl: { template: {...}, stateful: true },
 *       MyTab:        { template: {...} },
 *     },
 *   }}
 * />
 * ```
 */

'use client';

import React, { useMemo } from 'react';
import type { ComponentType } from 'react';
import type {
  JsonASTNode,
  AnalyzedNode,
  ReactJsonComponentOptions,
  ComponentMapEntry,
  ComponentRegistry,
} from '../types';
import { ReactJsonRuntime, ReactJsonRuntimeProps } from './ReactJsonRuntime';
import { resolveComponents } from '../component-registry';

// ---------------------------------------------------------------------------
// Module-level WeakMap cache
// Survives React unmount/remount (page navigation) as long as the same
// `components` object reference is passed.
// ---------------------------------------------------------------------------

const factoryCache = new WeakMap<
  Record<string, ComponentMapEntry>,
  {
    globals: Record<string, unknown> | undefined;
    resolved: Record<string, ComponentType<Record<string, unknown>>>;
  }
>();

function resolveComponentsCached(
  components: Record<string, ComponentMapEntry>,
  globals?: Record<string, unknown>,
): Record<string, ComponentType<Record<string, unknown>>> {
  const cached = factoryCache.get(components);

  // If found in cache AND globals reference is the same, use it.
  if (cached && cached.globals === globals) {
    return cached.resolved;
  }

  // Otherwise (re-)resolve and update cache.
  const resolved = resolveComponents(components, globals);
  factoryCache.set(components, { globals, resolved });
  return resolved;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Extended options for `ReactJsonRenderer` — identical to the runtime options
 * except `components` now accepts a mixed map (`ComponentMapEntry` per entry).
 */
export interface ReactJsonRendererOptions
  extends Omit<ReactJsonComponentOptions, 'components'> {
  /**
   * Mixed component map.
   * Each value is either a native React component or a `JsonComponentDefinition`.
   */
  components?: Record<string, ComponentMapEntry>;
}

export interface ReactJsonRendererProps {
  /** The top-level JSON AST template to render. */
  template: JsonASTNode | AnalyzedNode;
  /**
   * Options including a mixed-format `components` map.
   * If both `registry` and `options.components` are provided, `registry` takes
   * precedence (its resolved map is merged with `options.components` after
   * resolution).
   */
  options?: ReactJsonRendererOptions;
  /**
   * A pre-built `ComponentRegistry` from `createComponentRegistry()`.
   * When provided, skips all resolution steps — the registry's component map
   * is passed directly to `ReactJsonRuntime`.
   * Use this for the best performance when navigating between CMS pages.
   */
  registry?: ComponentRegistry;
  /** Props available inside the template as `{{ props.xxx }}`. */
  componentProps?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// ReactJsonRenderer component
// ---------------------------------------------------------------------------

export const ReactJsonRenderer: React.FC<ReactJsonRendererProps> = React.memo(
  ({ template, options = {}, registry, componentProps }) => {
    const { components, ...restOptions } = options;

    // If `registry` is provided, use its pre-resolved map directly.
    // Otherwise, resolve the mixed `components` map (using the WeakMap cache).
    const resolvedComponents = useMemo(() => {
      if (registry) {
        // Registry already resolved — merge with any additional components
        if (components) {
          return {
            ...registry.components,
            ...resolveComponentsCached(components, restOptions.globals),
          };
        }
        return registry.components;
      }
      return components ? resolveComponentsCached(components, restOptions.globals) : {};
    }, [registry, components, restOptions.globals]);

    const runtimeOptions: ReactJsonRuntimeProps['options'] = {
      ...restOptions,
      components: resolvedComponents,
    };

    return (
      <ReactJsonRuntime
        template={template}
        options={runtimeOptions}
        componentProps={componentProps}
      />
    );
  },
);

ReactJsonRenderer.displayName = 'ReactJsonRenderer';
