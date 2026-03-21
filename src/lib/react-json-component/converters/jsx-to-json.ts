/**
 * jsx-to-json.ts
 *
 * Converts a JSX string into a ReactJsonComponent JSON AST.
 *
 * Uses Babel's parser to produce a full AST, then walks JSXElement nodes
 * to emit the JSON AST format.
 *
 * Supported JSX features:
 *   ✅ JSX elements (e.g. <div>, <Button>)
 *   ✅ JSX attributes (string, expression, boolean shorthand)
 *   ✅ JSX Spread Attributes ({...props}, {...rest})
 *   ✅ JSX children (text, elements, expressions)
 *   ✅ Ternary expressions in attributes
 *   ✅ String interpolation in JSX text
 *   ✅ Self-closing elements
 *   ✅ Fragments (<></>) — flattened into array
 *   ✅ Event handlers mapped to ActionBinding format
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import * as parser from '@babel/parser';
import {
  isJSXElement,
  isJSXFragment,
  isJSXText,
  isJSXExpressionContainer,
  isJSXSpreadAttribute,
  isJSXIdentifier,
  isJSXMemberExpression,
  isStringLiteral,
  isNumericLiteral,
  isBooleanLiteral,
  isNullLiteral,
  isIdentifier,
  isMemberExpression,
  isTemplateLiteral,
  isConditionalExpression,
  isCallExpression,
  isBinaryExpression,
  isLogicalExpression,
  isUnaryExpression,
  isObjectExpression,
  isArrowFunctionExpression,
  isFunctionExpression,
} from '@babel/types';
import type {
  JSXElement,
  JSXFragment,
  JSXAttribute,
  JSXSpreadAttribute,
  JSXMemberExpression,
  Expression,
  TemplateLiteral,
  MemberExpression,
  ArrowFunctionExpression,
  FunctionExpression,
  CallExpression,
} from '@babel/types';
import type { JsonASTNode, JsonPropValue, ActionBinding } from '../types';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface JsxToJsonOptions {
  /**
   * Map event handler names to action names.
   * If an event handler is a simple identifier matching a key here, it is
   * converted to an ActionBinding.
   */
  eventHandlerMap?: Record<string, string>;

  /** If true, log warnings for unsupported expressions. Default: true */
  verbose?: boolean;
}

/**
 * Convert a JSX string to a JSON AST node (or array for fragments).
 */
export function jsxToJson(
  jsx: string,
  options: JsxToJsonOptions = {},
): JsonASTNode | JsonASTNode[] {
  const { verbose = true } = options;

  const wrappedCode = `const __jsx = (${jsx})`;

  let ast: ReturnType<typeof parser.parse>;
  try {
    ast = parser.parse(wrappedCode, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
    });
  } catch (err) {
    throw new Error(
      `[jsxToJson] Failed to parse JSX.\nParse error: ${(err as Error).message}`,
    );
  }

  const program = ast.program;
  const firstStatement = program.body[0];

  if (firstStatement.type !== 'VariableDeclaration') {
    throw new Error('[jsxToJson] Unexpected AST structure.');
  }

  const declarator = firstStatement.declarations[0];
  const jsxNode = declarator.init;

  if (!jsxNode) throw new Error('[jsxToJson] No JSX expression found.');

  if (isJSXElement(jsxNode)) return convertElement(jsxNode, options, verbose);
  if (isJSXFragment(jsxNode)) return convertFragment(jsxNode, options, verbose);

  throw new Error(
    `[jsxToJson] Expected a JSX element or fragment. Got: ${jsxNode.type}`,
  );
}

// ---------------------------------------------------------------------------
// Element conversion
// ---------------------------------------------------------------------------

function convertElement(
  element: JSXElement,
  options: JsxToJsonOptions,
  verbose: boolean,
): JsonASTNode {
  const openingElement = element.openingElement;
  const type = resolveJSXName(openingElement.name);

  const { props, directives, spreadProps } = processAttributes(
    openingElement.attributes as (JSXAttribute | JSXSpreadAttribute)[],
    options,
    verbose,
  );

  const children = processChildren(element.children as any[], options, verbose);

  const node: JsonASTNode = { type };

  const mergedProps: Record<string, JsonPropValue> = { ...spreadProps, ...props };
  if (Object.keys(mergedProps).length > 0) node.props = mergedProps;
  if (children.length > 0) node.children = children;

  if (directives.$if !== undefined) node.$if = directives.$if;
  if (directives.$each !== undefined) node.$each = directives.$each;
  if (directives.$key !== undefined) node.$key = directives.$key;
  if (directives.$as !== undefined) node.$as = directives.$as;
  if (directives.$indexAs !== undefined) node.$indexAs = directives.$indexAs;
  if (directives.contextName !== undefined) node.contextName = directives.contextName;

  return node;
}

function convertFragment(
  fragment: JSXFragment,
  options: JsxToJsonOptions,
  verbose: boolean,
): JsonASTNode[] {
  return processChildren(fragment.children as any[], options, verbose).filter(
    (child): child is JsonASTNode => typeof child !== 'string',
  );
}

// ---------------------------------------------------------------------------
// Name resolution
// ---------------------------------------------------------------------------

function resolveJSXName(name: JSXElement['openingElement']['name']): string {
  if (isJSXIdentifier(name)) return name.name;
  if (isJSXMemberExpression(name)) return resolveJSXMemberExpr(name);
  return 'div';
}

function resolveJSXMemberExpr(expr: JSXMemberExpression): string {
  const prop = expr.property.name;
  if (isJSXIdentifier(expr.object)) return `${expr.object.name}.${prop}`;
  if (isJSXMemberExpression(expr.object)) return `${resolveJSXMemberExpr(expr.object)}.${prop}`;
  return prop;
}

// ---------------------------------------------------------------------------
// Attribute processing
// ---------------------------------------------------------------------------

interface ProcessedAttributes {
  props: Record<string, JsonPropValue>;
  directives: Partial<Pick<JsonASTNode, '$if' | '$each' | '$key' | '$as' | '$indexAs' | 'contextName'>>;
  spreadProps: Record<string, JsonPropValue>;
}

const DIRECTIVE_ATTRS = new Set(['$if', '$each', '$key', '$as', '$indexAs', 'contextName']);

function processAttributes(
  attrs: (JSXAttribute | JSXSpreadAttribute)[],
  options: JsxToJsonOptions,
  verbose: boolean,
): ProcessedAttributes {
  const props: Record<string, JsonPropValue> = {};
  const directives: ProcessedAttributes['directives'] = {};
  const spreadProps: Record<string, JsonPropValue> = {};

  for (const attr of attrs) {
    if (isJSXSpreadAttribute(attr)) {
      const spreadExpr = attr.argument;
      if (isIdentifier(spreadExpr)) {
        spreadProps[`...${spreadExpr.name}`] = `{{ ${spreadExpr.name} }}`;
      } else if (isObjectExpression(spreadExpr)) {
        for (const prop of spreadExpr.properties) {
          if (prop.type === 'ObjectProperty' && isIdentifier(prop.key)) {
            props[prop.key.name] = expressionToJsonValue(prop.value as Expression, options, verbose);
          }
        }
      } else if (verbose) {
        console.warn(`[jsxToJson] Complex spread unsupported: ${spreadExpr.type}. Skipping.`);
      }
      continue;
    }

    if (!isJSXIdentifier(attr.name)) continue;

    const attrName = attr.name.name;
    let value: JsonPropValue;

    if (attr.value === null || attr.value === undefined) {
      value = true; // boolean shorthand: <Button disabled />
    } else if (isStringLiteral(attr.value)) {
      value = attr.value.value;
    } else if (attr.value.type === 'JSXExpressionContainer') {
      const exprContainer = attr.value as any;
      const expr = exprContainer.expression;
      if (!expr || expr.type === 'JSXEmptyExpression') {
        value = null;
      } else {
        value = expressionToJsonValue(expr as Expression, options, verbose);
      }
    } else {
      value = null;
    }

    if (DIRECTIVE_ATTRS.has(attrName)) {
      (directives as Record<string, unknown>)[attrName] =
        typeof value === 'string' ? value : String(value);
    } else {
      props[attrName] = value;
    }
  }

  return { props, directives, spreadProps };
}

// ---------------------------------------------------------------------------
// Expression → JSON value conversion
// ---------------------------------------------------------------------------

function expressionToJsonValue(
  expr: Expression,
  options: JsxToJsonOptions,
  verbose: boolean,
): JsonPropValue {
  if (isStringLiteral(expr)) return expr.value;
  if (isNumericLiteral(expr)) return expr.value;
  if (isBooleanLiteral(expr)) return expr.value;
  if (isNullLiteral(expr)) return null;

  if (isTemplateLiteral(expr)) return templateLiteralToString(expr);

  if (isIdentifier(expr)) {
    const eventAction = options.eventHandlerMap?.[expr.name];
    if (eventAction) return { action: eventAction } as ActionBinding;
    return `{{ ${expr.name} }}`;
  }

  if (isMemberExpression(expr)) {
    const path = memberExpressionToPath(expr);
    if (path) return `{{ ${path} }}`;
  }

  if (isConditionalExpression(expr)) {
    const str = expressionToString(expr, verbose);
    return str ? `{{ ${str} }}` : null;
  }

  if (isBinaryExpression(expr)) {
    const str = expressionToString(expr, verbose);
    return str ? `{{ ${str} }}` : null;
  }

  if (isLogicalExpression(expr)) {
    const str = expressionToString(expr, verbose);
    return str ? `{{ ${str} }}` : null;
  }

  if (isUnaryExpression(expr)) {
    const str = expressionToString(expr, verbose);
    return str ? `{{ ${str} }}` : null;
  }

  if (isArrowFunctionExpression(expr) || isFunctionExpression(expr)) {
    return convertFunctionToActionBinding(expr, options, verbose);
  }

  if (isCallExpression(expr)) {
    const callee = expr.callee;
    if (isIdentifier(callee)) {
      return {
        action: callee.name,
        args: expr.arguments.map((arg: any) => {
          const val = expressionToJsonValue(arg as Expression, options, verbose);
          return val as string | number | boolean;
        }),
      } as ActionBinding;
    }
    const str = expressionToString(expr, verbose);
    return str ? `{{ ${str} }}` : null;
  }

  if (verbose) {
    console.warn(
      `[jsxToJson] Unsupported expression type: ${expr.type}. Will be omitted.`,
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Function expression → ActionBinding
// ---------------------------------------------------------------------------

function convertFunctionToActionBinding(
  expr: ArrowFunctionExpression | FunctionExpression,
  options: JsxToJsonOptions,
  verbose: boolean,
): JsonPropValue {
  const body = expr.body;

  // () => actionName(args)
  if (isCallExpression(body)) {
    const call = body as CallExpression;
    if (isIdentifier(call.callee)) {
      return {
        action: call.callee.name,
        args: call.arguments.map((arg: any) => {
          const val = expressionToJsonValue(arg as Expression, options, verbose);
          return val as string | number | boolean;
        }),
      } as ActionBinding;
    }
  }

  // () => identifier
  if (isIdentifier(body)) {
    return { action: body.name } as ActionBinding;
  }

  if (verbose) {
    console.warn(
      '[jsxToJson] Arrow/function body too complex for ActionBinding. ' +
        'Define logic in actionRegistry and reference by name.',
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Expression → string representation
// ---------------------------------------------------------------------------

function expressionToString(expr: Expression, verbose: boolean): string | null {
  if (isIdentifier(expr)) return expr.name;
  if (isStringLiteral(expr)) return JSON.stringify(expr.value);
  if (isNumericLiteral(expr)) return String(expr.value);
  if (isBooleanLiteral(expr)) return String(expr.value);
  if (isNullLiteral(expr)) return 'null';

  if (isMemberExpression(expr)) return memberExpressionToPath(expr);

  if (isTemplateLiteral(expr)) {
    // Reconstruct the template literal as a string that SafeEvaluator can parse.
    // We emit it as a JS template literal so the outer {{ }} can evaluate it:
    // `Count: ${state.count}` → `Count: ${ state.count }`
    let result = '`';
    for (let i = 0; i < expr.quasis.length; i++) {
      result += expr.quasis[i].value.raw;
      if (i < expr.expressions.length) {
        const innerStr = expressionToString(expr.expressions[i] as Expression, verbose);
        result += innerStr ? `\${${innerStr}}` : '';
      }
    }
    result += '`';
    return result;
  }

  if (isConditionalExpression(expr)) {
    const test = expressionToString(expr.test as Expression, verbose);
    const consequent = expressionToString(expr.consequent as Expression, verbose);
    const alternate = expressionToString(expr.alternate as Expression, verbose);
    if (test && consequent && alternate) return `${test} ? ${consequent} : ${alternate}`;
  }

  if (isBinaryExpression(expr)) {
    const left = expressionToString(expr.left as Expression, verbose);
    const right = expressionToString(expr.right as Expression, verbose);
    if (left && right) return `${left} ${expr.operator} ${right}`;
  }

  if (isLogicalExpression(expr)) {
    const left = expressionToString(expr.left as Expression, verbose);
    const right = expressionToString(expr.right as Expression, verbose);
    if (left && right) return `${left} ${expr.operator} ${right}`;
  }

  if (isUnaryExpression(expr)) {
    const arg = expressionToString(expr.argument as Expression, verbose);
    if (arg) return `${expr.operator}${arg}`;
  }

  if (isCallExpression(expr)) {
    const callee = expressionToString(expr.callee as Expression, verbose);
    const args = expr.arguments.map((a: any) => expressionToString(a as Expression, verbose));
    if (callee && args.every(Boolean)) return `${callee}(${args.join(', ')})`;
  }

  if (verbose) {
    console.warn(`[jsxToJson] Cannot convert expression "${expr.type}" to string.`);
  }
  return null;
}

function memberExpressionToPath(expr: MemberExpression): string | null {
  const object = isIdentifier(expr.object)
    ? expr.object.name
    : isMemberExpression(expr.object)
    ? memberExpressionToPath(expr.object as MemberExpression)
    : null;

  if (!object) return null;

  if (expr.computed) {
    const prop = expressionToString(expr.property as Expression, false);
    return prop ? `${object}[${prop}]` : null;
  }

  if (isIdentifier(expr.property)) return `${object}.${expr.property.name}`;
  return null;
}

function templateLiteralToString(expr: TemplateLiteral): string {
  let result = '';
  for (let i = 0; i < expr.quasis.length; i++) {
    result += expr.quasis[i].value.raw;
    if (i < expr.expressions.length) {
      const exprStr = expressionToString(expr.expressions[i] as Expression, false);
      result += exprStr ? `{{ ${exprStr} }}` : '';
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Children processing
// ---------------------------------------------------------------------------

function processChildren(
  children: any[],
  options: JsxToJsonOptions,
  verbose: boolean,
): (JsonASTNode | string)[] {
  const result: (JsonASTNode | string)[] = [];

  for (const child of children) {
    if (isJSXText(child)) {
      const text = child.value.replace(/^\s*\n\s*/gm, '').trim();
      if (text) result.push(text);
    } else if (isJSXElement(child)) {
      result.push(convertElement(child, options, verbose));
    } else if (isJSXFragment(child)) {
      result.push(...convertFragment(child, options, verbose));
    } else if (isJSXExpressionContainer(child)) {
      const expr = child.expression;
      if (!expr || expr.type === 'JSXEmptyExpression') continue;
      const val = expressionToJsonValue(expr as Expression, options, verbose);
      if (val !== null) {
        result.push(typeof val === 'string' ? val : JSON.stringify(val));
      }
    }
  }

  return result;
}
