/**
 * PureJsonComponent.tsx
 *
 * A lightweight, stateless component factory.
 *
 * Converts a `JsonASTNode` template into a React.FC with no Zustand store.
 * Suitable for purely presentational CMS components that only need to:
 *   - Accept and display props (accessed as `{{ props.xxx }}` in the template)
 *   - Pass through children via the `{ "type": "$slot" }` node
 *
 * The produced component can be used in `options.components` of both
 * `ReactJsonRenderer` and `ReactJsonComponent`.
 *
 * Usage:
 *   const Title = PureJsonComponent(
 *     {
 *       type: 'h1',
 *       props: { className: 'cms-title' },
 *       children: [{ type: '$slot' }],
 *     },
 *   );
 *
 *   // In a page template:
 *   <ReactJsonRenderer
 *     template={{ type: 'Title', children: ['Hello World'] }}
 *     options={{ components: { Title } }}
 *   />
 */

import type { ComponentType } from 'react';
import type { JsonASTNode, RenderContext } from '../types';
import { analyzeTree } from '../static-analyzer';
import { renderNode } from '../node-renderer';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface PureJsonComponentOptions {
  /** Additional React components available in the template via `type` names. */
  components?: Record<string, ComponentType<Record<string, unknown>>>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a stateless React component from a `JsonASTNode` template.
 *
 * @param template - The JSON AST defining this component's UI.
 * @param options  - Optional: additional components used inside the template.
 * @returns        A React.FC that renders the template with the consumer's props/children.
 */
export function PureJsonComponent(
  template: JsonASTNode,
  options: PureJsonComponentOptions = {},
): ComponentType<Record<string, unknown>> {
  // Pre-analyze the template once at factory time.
  const analyzedTemplate = analyzeTree(template);

  const noop = () => { };

  function Component(props: Record<string, unknown>) {
    const ctx: RenderContext = {
      // PureJsonComponent is stateless — state is always empty.
      state: {},
      setState: noop,
      // Consumer props (including `children`) are forwarded as `props` in expressions.
      props,
      options: {
        components: options.components,
      },
    };

    return <>{renderNode(analyzedTemplate, ctx)}</>;
  }

  // Give the component a readable display name for React DevTools.
  Component.displayName = 'PureJsonComponent';

  return Component;
}
