/**
 * static-analyzer.ts
 *
 * Implements Static Node Hoisting (AST Pre-pass).
 *
 * Walks the JSON AST and marks nodes with `isStatic: true` when:
 *   - The node has no {{ }} expressions in its props or text children
 *   - The node has no $if, $each directives
 *   - The node has no ActionBinding in its props
 *   - All of its children are also static
 *
 * Static nodes are later memoized by React.memo in the client hydrator,
 * avoiding unnecessary re-renders on state changes.
 */

import type { JsonASTNode, AnalyzedNode, JsonPropValue } from './types';

// Matches {{ expr }} template expressions
const EXPR_RE = /\{\{[\s\S]+?\}\}/;

/**
 * Check whether a string contains a {{ }} expression.
 */
function hasExpression(value: string): boolean {
  return EXPR_RE.test(value);
}

/**
 * Check whether a single prop value is dynamic (expression or action binding).
 */
function isPropDynamic(value: JsonPropValue): boolean {
  if (typeof value === 'string') {
    return hasExpression(value);
  }
  if (typeof value === 'object' && value !== null) {
    // ActionBinding: { action: string, ... }
    if ('action' in value && typeof (value as Record<string, unknown>).action === 'string') {
      return true;
    }
  }
  return false;
}

/**
 * Check whether a node's props contain any dynamic values.
 */
function hasAnyDynamicProp(props: Record<string, JsonPropValue> | undefined): boolean {
  if (!props) return false;
  return Object.values(props).some(isPropDynamic);
}

/**
 * Check whether a child (string or node) is dynamic.
 */
function isChildDynamic(child: JsonASTNode | string): boolean {
  if (typeof child === 'string') {
    return hasExpression(child);
  }
  // Sub-nodes are analyzed recursively — if they end up static, they're fine
  return false;
}

/**
 * Analyze a JSON AST node and all its descendants.
 * Returns an AnalyzedNode with `isStatic` set appropriately.
 *
 * A node is static if AND ONLY IF:
 *   1. It has no directives ($if, $each)
 *   2. It has no dynamic props ({{ }} or ActionBinding)
 *   3. None of its textual children contain {{ }}
 *   4. All sub-node children are also static
 *
 * @param node - The raw JSON AST node to analyze.
 */
export function analyzeNode(node: JsonASTNode): AnalyzedNode {
  // Check directives — any directive makes this node dynamic
  if (node.$if !== undefined || node.$each !== undefined) {
    const analyzedChildren = node.children?.map(analyzeChild) ?? [];
    return {
      ...node,
      children: analyzedChildren,
      isStatic: false,
    };
  }

  // Check props for dynamic values
  const dynamicProps = hasAnyDynamicProp(node.props);

  // Analyze children recursively
  const analyzedChildren: (AnalyzedNode | string)[] = node.children?.map(analyzeChild) ?? [];

  // Check text children for expressions
  const dynamicTextChild = analyzedChildren.some(
    (child) => typeof child === 'string' && isChildDynamic(child),
  );

  // Check sub-node children — if any sub-node is dynamic, this node is dynamic too
  const dynamicSubNode = analyzedChildren.some(
    (child) => typeof child !== 'string' && !child.isStatic,
  );

  const isStatic = !dynamicProps && !dynamicTextChild && !dynamicSubNode;

  return {
    ...node,
    children: analyzedChildren,
    isStatic,
  };
}

/**
 * Analyze a child (string or node).
 */
function analyzeChild(child: JsonASTNode | string): AnalyzedNode | string {
  if (typeof child === 'string') {
    return child;
  }
  return analyzeNode(child);
}

/**
 * Analyze an entire JSON AST tree.
 * Convenience wrapper over analyzeNode for clarity at the call site.
 */
export function analyzeTree(root: JsonASTNode): AnalyzedNode {
  return analyzeNode(root);
}

/**
 * Returns true if the analyzed node is guaranteed to produce stable output
 * regardless of state or props changes.
 */
export function isStaticNode(node: AnalyzedNode): boolean {
  return node.isStatic === true;
}
