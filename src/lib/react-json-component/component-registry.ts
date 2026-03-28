/**
 * component-registry.ts
 *
 * Provides `createComponentRegistry()` — a factory that pre-resolves a mixed
 * `components` map (native React components + JSON definitions) into a stable
 * `ComponentRegistry` object.
 *
 * The registry is created **once** and can be stored at module scope or in a
 * React context, surviving page navigation without any re-resolution overhead.
 *
 * @example
 * ```ts
 * // app-components.ts — created once at app startup
 * import * as headlessui from '@headlessui/react';
 * export const appRegistry = createComponentRegistry({
 *   ...headlessui,
 *   MyTabControl: {
 *     template: { ... },
 *     stateful: true,
 *     options: { initialState: { active: 0 } },
 *   },
 *   MyTab:      { template: { ... } },
 *   MyTabPanel: { template: { ... } },
 * });
 *
 * // any-page.tsx — pass via `registry` prop, no re-resolution on navigation
 * <ReactJsonRenderer template={pageAst} registry={appRegistry} options={...} />
 * ```
 */

import type { ComponentType } from 'react';
import type {
  ComponentMapEntry,
  ComponentRegistry,
  JsonASTNode,
  ActionRegistry,
} from './types';
import { isJsonComponentDefinition } from './types';

// We import the factories lazily via dynamic references to avoid circular deps.
// They're both pure functions so this is safe.
import { PureJsonComponent } from './react/PureJsonComponent';
import { ReactJsonComponent } from './react/ReactJsonComponent';

// ---------------------------------------------------------------------------
// Internal resolver (shared with ReactJsonRenderer)
// ---------------------------------------------------------------------------

/**
 * Resolve a mixed component map into a map of native React components.
 * JSON definitions are compiled into either `PureJsonComponent` or
 * `ReactJsonComponent` factories. All factories receive the full resolved
 * map so inter-component dependencies are wired automatically.
 *
 * @internal — exported for use by `ReactJsonRenderer`. Prefer
 * `createComponentRegistry()` for user-facing code.
 */
export function resolveComponents(
  components: Record<string, ComponentMapEntry>,
): Record<string, ComponentType<Record<string, unknown>>> {
  const resolved: Record<string, ComponentType<Record<string, unknown>>> = {};

  // Pass 1 — native React components
  for (const [name, entry] of Object.entries(components)) {
    if (!isJsonComponentDefinition(entry)) {
      resolved[name] = entry as ComponentType<Record<string, unknown>>;
    }
  }

  // Pass 2 — JSON definitions (mutates `resolved` in-place; factories receive
  // the shared reference so all inter-component links resolve at render time)
  for (const [name, entry] of Object.entries(components)) {
    if (isJsonComponentDefinition(entry)) {
      const factoryOptions = {
        ...(entry.options ?? {}),
        components: resolved,
      };
      resolved[name] = entry.stateful
        ? ReactJsonComponent(entry.template as JsonASTNode, factoryOptions as {
            initialState?: Record<string, unknown>;
            actionRegistry?: ActionRegistry;
            components?: Record<string, ComponentType<Record<string, unknown>>>;
          })
        : PureJsonComponent(entry.template as JsonASTNode, { components: resolved });
    }
  }

  return resolved;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Pre-resolve a mixed component map and return a stable `ComponentRegistry`
 * that can be reused across page navigations without any re-resolution.
 *
 * Pass the returned `registry` directly to `<ReactJsonRenderer registry={...} />`
 * to bypass the per-render resolution step entirely.
 *
 * @param components - Mixed map of native React components and JSON definitions.
 * @returns A `ComponentRegistry` containing all resolved component factories.
 */
export function createComponentRegistry(
  components: Record<string, ComponentMapEntry>,
): ComponentRegistry {
  const resolved = resolveComponents(components);
  return {
    __brand: 'ComponentRegistry',
    components: resolved,
  } as ComponentRegistry;
}
