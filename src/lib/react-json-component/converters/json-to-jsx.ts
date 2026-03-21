/**
 * json-to-jsx.ts
 *
 * Converts a ReactJsonComponent JSON AST back into JSX source code.
 *
 * This is useful for:
 *   - Developer tooling: inspect/debug JSON templates as readable JSX
 *   - Round-trip testing: jsxToJson → jsonToJsx should be idempotent
 *   - CMS preview rendering
 *
 * The output is formatted JSX that can be pasted directly into React files.
 *
 * Supported conversions:
 *   ✅ Plain props (string, number, boolean, null)
 *   ✅ Expression props ("{{ expr }}" → {expr})
 *   ✅ ActionBinding → onClick={() => actionName(args)}
 *   ✅ Spread props ("...propName": "{{ propName }}" → {...propName})
 *   ✅ $if directive → conditional expression or && shorthand
 *   ✅ $each directive → .map() with key
 *   ✅ Text children with {{ }} → JSX expression interpolation
 *   ✅ Nested children (recursive)
 */

import type { JsonASTNode, JsonPropValue, ActionBinding } from '../types';

// Matches {{ expr }}
const EXPR_RE = /^\{\{\s*([\s\S]+?)\s*\}\}$/;
const EXPR_INLINE_RE = /\{\{\s*([\s\S]+?)\s*\}\}/g;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface JsonToJsxOptions {
  /** Number of spaces per indentation level. Default: 2. */
  indentSize?: number;
  /** Target import style. Default: 'none' (no import statement). */
  addImport?: boolean;
}

/**
 * Convert a JSON AST node (or array of nodes) into a JSX string.
 *
 * @param node    - The JSON AST node to convert.
 * @param options - Output formatting options.
 * @returns A JSX string representation.
 */
export function jsonToJsx(
  node: JsonASTNode | JsonASTNode[],
  options: JsonToJsxOptions = {},
): string {
  const { indentSize = 2, addImport = false } = options;

  const lines: string[] = [];

  if (addImport) {
    lines.push(`import React from 'react';`);
    lines.push('');
  }

  if (Array.isArray(node)) {
    lines.push('<>');
    for (const child of node) {
      lines.push(renderNode(child, 1, indentSize));
    }
    lines.push('</>');
  } else {
    lines.push(renderNode(node, 0, indentSize));
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Node rendering
// ---------------------------------------------------------------------------

function renderNode(
  node: JsonASTNode,
  depth: number,
  indentSize: number,
): string {
  const indent = ' '.repeat(depth * indentSize);
  const innerIndent = ' '.repeat((depth + 1) * indentSize);

  // Apply $if / $each wrapping
  const inner = renderRawNode(node, depth, indentSize);

  if (node.$each !== undefined) {
    const itemVar = node.$as ?? 'item';
    const indexVar = node.$indexAs ?? 'index';
    const eachExpr = stripBraces(node.$each);
    return (
      `${indent}{(${eachExpr}).map((${itemVar}, ${indexVar}) => (\n` +
      `${innerIndent}${inner.trimStart()}\n` +
      `${indent}))}`
    );
  }

  if (node.$if !== undefined) {
    const condExpr = stripBraces(node.$if);
    return `${indent}{${condExpr} && (\n${innerIndent}${inner.trimStart()}\n${indent})}`;
  }

  return inner;
}

function renderRawNode(
  node: JsonASTNode,
  depth: number,
  indentSize: number,
): string {
  const indent = ' '.repeat(depth * indentSize);
  const innerIndent = ' '.repeat((depth + 1) * indentSize);

  const tag = node.type;
  const props = node.props ?? {};
  const children = node.children ?? [];
  const hasKey = node.$key !== undefined;
  const hasEach = node.$each !== undefined;

  // Build prop strings
  const propStrings: string[] = [];

  // Add key prop when inside $each
  if (hasEach && hasKey) {
    const keyExpr = stripBraces(node.$key!);
    propStrings.push(`key={${keyExpr}}`);
  }

  // Support contextName
  if (node.contextName !== undefined) {
    propStrings.push(`contextName="${node.contextName}"`);
  }

  for (const [propName, propValue] of Object.entries(props)) {
    // Handle spread props
    if (propName.startsWith('...')) {
      const spreadVar = propName.slice(3);
      propStrings.push(`{...${spreadVar}}`);
      continue;
    }
    propStrings.push(renderProp(propName, propValue));
  }

  const propsStr = propStrings.length > 0 ? ' ' + propStrings.join(' ') : '';

  // Render children
  if (children.length === 0) {
    // Self-closing
    return `${indent}<${tag}${propsStr} />`;
  }

  const renderedChildren: string[] = children.map((child) => {
    if (typeof child === 'string') {
      return `${innerIndent}${renderTextChild(child)}`;
    }
    return renderNode(child, depth + 1, indentSize);
  });

  // Try single-line if short enough
  if (
    renderedChildren.length === 1 &&
    typeof children[0] === 'string' &&
    !children[0].includes('\n')
  ) {
    const inlineChild = renderTextChild(children[0] as string);
    const singleLine = `${indent}<${tag}${propsStr}>${inlineChild}</${tag}>`;
    if (singleLine.length <= 80) {
      return singleLine;
    }
  }

  return (
    `${indent}<${tag}${propsStr}>\n` +
    renderedChildren.join('\n') +
    `\n${indent}</${tag}>`
  );
}

// ---------------------------------------------------------------------------
// Prop rendering
// ---------------------------------------------------------------------------

function renderProp(name: string, value: JsonPropValue): string {
  // Boolean true shorthand
  if (value === true) return name;

  // Boolean false
  if (value === false) return `${name}={false}`;

  // Null
  if (value === null) return `${name}={null}`;

  // Number
  if (typeof value === 'number') return `${name}={${value}}`;

  // String — check for {{ }} expression
  if (typeof value === 'string') {
    const match = value.match(EXPR_RE);
    if (match) {
      // Pure expression: {{ expr }} → {expr}
      return `${name}={${match[1].trim()}}`;
    }
    if (EXPR_INLINE_RE.test(value)) {
      // Mixed string with expressions → template literal
      EXPR_INLINE_RE.lastIndex = 0;
      const templateStr = value.replace(EXPR_INLINE_RE, (_, expr: string) => `\${${expr.trim()}}`);
      return `${name}={\`${templateStr}\`}`;
    }
    // Plain string
    return `${name}="${value}"`;
  }

  // ActionBinding
  if (typeof value === 'object' && value !== null && 'action' in value) {
    return renderActionBindingProp(name, value as ActionBinding);
  }

  // Nested object — serialize as JS object literal
  if (typeof value === 'object' && value !== null) {
    const objLiteral = objectToLiteral(value as Record<string, unknown>);
    return `${name}={${objLiteral}}`;
  }

  return `${name}={${JSON.stringify(value)}}`;
}

function renderActionBindingProp(name: string, binding: ActionBinding): string {
  const actionName = binding.action;
  const args = binding.args ?? [];

  if (args.length === 0) {
    return `${name}={() => ${actionName}()}`;
  }

  const argsStr = args
    .map((arg) => {
      if (typeof arg === 'string') {
        const match = arg.match(EXPR_RE);
        return match ? match[1].trim() : JSON.stringify(arg);
      }
      return String(arg);
    })
    .join(', ');

  return `${name}={() => ${actionName}(${argsStr})}`;
}

function objectToLiteral(obj: Record<string, unknown>): string {
  const entries = Object.entries(obj).map(([k, v]) => {
    if (typeof v === 'string') return `${k}: ${JSON.stringify(v)}`;
    if (typeof v === 'number' || typeof v === 'boolean') return `${k}: ${v}`;
    if (v === null) return `${k}: null`;
    return `${k}: ${JSON.stringify(v)}`;
  });
  return `{ ${entries.join(', ')} }`;
}

// ---------------------------------------------------------------------------
// Text child rendering
// ---------------------------------------------------------------------------

function renderTextChild(text: string): string {
  EXPR_INLINE_RE.lastIndex = 0;
  const hasExpression = EXPR_INLINE_RE.test(text);
  EXPR_INLINE_RE.lastIndex = 0;

  if (!hasExpression) {
    return text;
  }

  // Check if it's a single expression covering the entire string
  const singleMatch = text.trim().match(EXPR_RE);
  if (singleMatch) {
    return `{${singleMatch[1].trim()}}`;
  }

  // Mixed content — use template literal as a JSX expression
  const replaced = text.replace(EXPR_INLINE_RE, (_, expr: string) => `\${${expr.trim()}}`);
  return `{\`${replaced}\`}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip {{ }} from an expression string. */
function stripBraces(expr: string): string {
  const match = expr.match(EXPR_RE);
  return match ? match[1].trim() : expr;
}
