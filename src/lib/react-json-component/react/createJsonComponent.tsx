/**
 * createJsonComponent.tsx
 *
 * A full-featured component factory with internal Zustand state.
 *
 * Converts a `JsonASTNode` template into a React.FC backed by a scoped
 * Zustand store, action registry, and the full expression resolver.
 *
 * Suitable for CMS components that need internal interactive state
 * (e.g. a collapsible panel, a local counter, a tab group).
 *
 * The produced component can be used in `options.components` of both
 * `ReactJsonRenderer` and `ReactJsonComponent`.
 *
 * Usage:
 *   const Counter = createJsonComponent(
 *     {
 *       type: 'div',
 *       children: [
 *         { type: 'span', children: ['{{ state.count }}'] },
 *         { type: 'button', props: { onClick: { action: 'inc' } }, children: ['+'] },
 *         { type: '$slot' },           // renders outer children here
 *       ],
 *     },
 *     {
 *       initialState: { count: 0 },
 *       actionRegistry: {
 *         inc: (state, setState) => setState({ count: (state.count as number) + 1 }),
 *       },
 *     },
 *   );
 *
 *   // In a page template:
 *   <ReactJsonRenderer
 *     template={{ type: 'Counter', children: ['Label from outside'] }}
 *     options={{ components: { Counter } }}
 *   />
 */

'use client';


import type { ComponentType } from 'react';
import type { JsonASTNode, ReactJsonComponentOptions } from '../types';
import { ReactJsonRenderer } from './ReactJsonRenderer';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/**
 * Options forwarded to the internal `ReactJsonRenderer`.
 * `serverActions` and `_onStoreReady` are excluded — they are Next.js–specific
 * and not applicable to a standalone component factory.
 */
export type CreateJsonComponentOptions = Omit<
  ReactJsonComponentOptions,
  'serverActions' | '_onStoreReady'
>;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a stateful React component from a `JsonASTNode` template.
 *
 * The component owns a scoped Zustand store and action registry.
 * Consumer props (including `children`) are passed via `componentProps`
 * and are accessible as `{{ props.xxx }}` in the template.
 * Use `{ "type": "$slot" }` in the template to render consumer children.
 *
 * @param template       - The JSON AST defining this component's UI.
 * @param defaultOptions - Default options (state, registry, components…).
 * @returns              A React.FC that renders the template.
 */
export function createJsonComponent(
  template: JsonASTNode,
  defaultOptions: CreateJsonComponentOptions = {},
): ComponentType<Record<string, unknown>> {
  function Component(props: Record<string, unknown>) {
    return (
      <ReactJsonRenderer
        template={template}
        options={defaultOptions}
        componentProps={props}
      />
    );
  }

  Component.displayName = 'JsonComponent';

  return Component;
}
