/**
 * safe-evaluator.ts
 *
 * A lightweight, sandboxed expression evaluator for {{ }} template bindings.
 * Replaces `new Function` by hand-parsing a safe JS expression subset.
 *
 * Supported syntax:
 *   - Member access:      a.b.c
 *   - Dynamic access:     a[b]
 *   - Function calls:     fn(a, b)
 *   - Ternary operator:   a ? b : c
 *   - Comparison:         ===, !==, ==, !=, >, <, >=, <=
 *   - Logical:            &&, ||, !
 *   - Arithmetic:         +, -, *, /, %
 *   - String literals:    'hello', "hello", `hello`
 *   - Number literals:    42, 3.14
 *   - Boolean literals:   true, false
 *   - Null / undefined:   null, undefined
 *   - Grouping:           (expr)
 *
 * Explicitly BLOCKED:
 *   - Assignment (=, +=, etc.)
 *   - `new`, `delete`, `typeof`, `instanceof`
 *   - constructor access
 *   - __proto__ / prototype access
 *   - Access to window, document, globalThis, eval, Function, etc.
 */

// ---------------------------------------------------------------------------
// Blocked identifiers — guard against sandbox escapes
// ---------------------------------------------------------------------------

const BLOCKED_IDENTIFIERS = new Set([
  'window',
  'globalThis',
  'self',
  'global',
  'document',
  'localStorage',
  'sessionStorage',
  'location',
  'navigator',
  'alert',
  'confirm',
  'prompt',
  'eval',
  'Function',
  'XMLHttpRequest',
  'fetch',
  'WebSocket',
  'importScripts',
  'require',
  'process',
  '__proto__',
  'prototype',
  'constructor',
]);

/** Error thrown when the safe evaluator encounters a blocked or invalid expression. */
export class SafeEvalError extends Error {
  constructor(message: string) {
    super(`[SafeEvaluator] ${message}`);
    this.name = 'SafeEvalError';
  }
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type TokenType =
  | 'NUMBER'
  | 'STRING'
  | 'TEMPLATE_LITERAL'
  | 'IDENT'
  | 'OP'
  | 'LPAREN'
  | 'RPAREN'
  | 'LBRACKET'
  | 'RBRACKET'
  | 'DOT'
  | 'OPTIONAL_DOT'
  | 'COMMA'
  | 'QUESTION'
  | 'COLON'
  | 'EOF';

interface Token {
  type: TokenType;
  value: string;
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    // Skip whitespace
    if (/\s/.test(expr[i])) {
      i++;
      continue;
    }

    // Number
    if (/[0-9]/.test(expr[i]) || (expr[i] === '-' && /[0-9]/.test(expr[i + 1] ?? ''))) {
      let num = '';
      if (expr[i] === '-') {
        num += '-';
        i++;
      }
      while (i < expr.length && /[0-9.]/.test(expr[i])) {
        num += expr[i++];
      }
      tokens.push({ type: 'NUMBER', value: num });
      continue;
    }

    // String literal (single or double quote)
    if (expr[i] === "'" || expr[i] === '"') {
      const quote = expr[i++];
      let str = '';
      while (i < expr.length && expr[i] !== quote) {
        if (expr[i] === '\\') {
          i++;
          const escaped: Record<string, string> = {
            n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"', '`': '`',
          };
          str += escaped[expr[i]] ?? expr[i];
          i++;
        } else {
          str += expr[i++];
        }
      }
      i++; // closing quote
      tokens.push({ type: 'STRING', value: str });
      continue;
    }

    // Template literal (backtick) — parse ${...} interpolations
    if (expr[i] === '`') {
      i++; // skip opening backtick
      // parts: alternating static string (even index) and expression (odd index)
      const parts: string[] = [];
      let staticPart = '';
      while (i < expr.length && expr[i] !== '`') {
        if (expr[i] === '\\') {
          i++;
          const escaped: Record<string, string> = {
            n: '\n', t: '\t', r: '\r', '\\': '\\', '`': '`', '$': '$',
          };
          staticPart += escaped[expr[i]] ?? expr[i];
          i++;
        } else if (expr[i] === '$' && expr[i + 1] === '{') {
          // Push the static part accumulated so far
          parts.push(staticPart);
          staticPart = '';
          i += 2; // skip '$' and '{'
          // Collect the inner expression, respecting nested braces
          let depth = 1;
          let inner = '';
          while (i < expr.length && depth > 0) {
            if (expr[i] === '{') depth++;
            else if (expr[i] === '}') { depth--; if (depth === 0) { i++; break; } }
            inner += expr[i++];
          }
          parts.push(inner); // inner expression string
        } else {
          staticPart += expr[i++];
        }
      }
      parts.push(staticPart); // trailing static part
      i++; // skip closing backtick
      // Encode parts as JSON so parsePrimary can deserialize it
      tokens.push({ type: 'TEMPLATE_LITERAL', value: JSON.stringify(parts) });
      continue;
    }

    // Multi-char operators
    const twoChar = expr.slice(i, i + 3);
    if (['===', '!=='].includes(twoChar)) {
      tokens.push({ type: 'OP', value: twoChar });
      i += 3;
      continue;
    }
    const two = expr.slice(i, i + 2);
    if (['==', '!=', '>=', '<=', '&&', '||', '?.'].includes(two)) {
      tokens.push({ type: two === '?.' ? 'OPTIONAL_DOT' : 'OP', value: two });
      i += 2;
      continue;
    }

    // Single-char tokens
    const ch = expr[i];
    if (ch === '(') { tokens.push({ type: 'LPAREN', value: ch }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'RPAREN', value: ch }); i++; continue; }
    if (ch === '[') { tokens.push({ type: 'LBRACKET', value: ch }); i++; continue; }
    if (ch === ']') { tokens.push({ type: 'RBRACKET', value: ch }); i++; continue; }
    if (ch === '.') { tokens.push({ type: 'DOT', value: ch }); i++; continue; }
    if (ch === ',') { tokens.push({ type: 'COMMA', value: ch }); i++; continue; }
    if (ch === '?') { tokens.push({ type: 'QUESTION', value: ch }); i++; continue; }
    if (ch === ':') { tokens.push({ type: 'COLON', value: ch }); i++; continue; }
    if (['+', '-', '*', '/', '%', '!', '>', '<'].includes(ch)) {
      tokens.push({ type: 'OP', value: ch });
      i++;
      continue;
    }

    // Identifier (allowing unicode)
    if (/[a-zA-Z_$\u0080-\uFFFF]/.test(ch)) {
      let ident = '';
      while (i < expr.length && /[a-zA-Z0-9_$\u0080-\uFFFF]/.test(expr[i])) {
        ident += expr[i++];
      }
      tokens.push({ type: 'IDENT', value: ident });
      continue;
    }

    throw new SafeEvalError(`Unexpected character: "${ch}" in expression: ${expr}`);
  }

  tokens.push({ type: 'EOF', value: '' });
  return tokens;
}

// ---------------------------------------------------------------------------
// Parser / Evaluator (recursive-descent)
// ---------------------------------------------------------------------------

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private consume(): Token {
    return this.tokens[this.pos++];
  }

  private expect(type: TokenType): Token {
    const tok = this.consume();
    if (tok.type !== type) {
      throw new SafeEvalError(`Expected ${type} but got ${tok.type} ("${tok.value}")`);
    }
    return tok;
  }

  /** Entry point — parse a full expression. */
  parseExpression(context: Record<string, unknown>): unknown {
    return this.parseTernary(context);
  }

  // ternary: logical ? logical : logical
  private parseTernary(context: Record<string, unknown>): unknown {
    const cond = this.parseLogicalOr(context);
    if (this.peek().type === 'QUESTION') {
      this.consume(); // '?'
      const consequent = this.parseTernary(context);
      this.expect('COLON');
      const alternate = this.parseTernary(context);
      return cond ? consequent : alternate;
    }
    return cond;
  }

  // ||
  private parseLogicalOr(context: Record<string, unknown>): unknown {
    let left = this.parseLogicalAnd(context);
    while (this.peek().type === 'OP' && this.peek().value === '||') {
      this.consume();
      const right = this.parseLogicalAnd(context);
      left = left || right;
    }
    return left;
  }

  // &&
  private parseLogicalAnd(context: Record<string, unknown>): unknown {
    let left = this.parseEquality(context);
    while (this.peek().type === 'OP' && this.peek().value === '&&') {
      this.consume();
      const right = this.parseEquality(context);
      left = left && right;
    }
    return left;
  }

  // === !== == !=
  private parseEquality(context: Record<string, unknown>): unknown {
    let left = this.parseComparison(context);
    while (this.peek().type === 'OP' && ['===', '!==', '==', '!='].includes(this.peek().value)) {
      const op = this.consume().value;
      const right = this.parseComparison(context);
      if (op === '===' || op === '==') left = left === right;
      else left = left !== right;
    }
    return left;
  }

  // > < >= <=
  private parseComparison(context: Record<string, unknown>): unknown {
    let left = this.parseAdditive(context);
    while (this.peek().type === 'OP' && ['>', '<', '>=', '<='].includes(this.peek().value)) {
      const op = this.consume().value;
      const right = this.parseAdditive(context);
      if (op === '>') left = (left as number) > (right as number);
      else if (op === '<') left = (left as number) < (right as number);
      else if (op === '>=') left = (left as number) >= (right as number);
      else left = (left as number) <= (right as number);
    }
    return left;
  }

  // + -
  private parseAdditive(context: Record<string, unknown>): unknown {
    let left = this.parseMultiplicative(context);
    while (this.peek().type === 'OP' && ['+', '-'].includes(this.peek().value)) {
      const op = this.consume().value;
      const right = this.parseMultiplicative(context);
      if (op === '+') left = (left as number) + (right as number);
      else left = (left as number) - (right as number);
    }
    return left;
  }

  // * / %
  private parseMultiplicative(context: Record<string, unknown>): unknown {
    let left = this.parseUnary(context);
    while (this.peek().type === 'OP' && ['*', '/', '%'].includes(this.peek().value)) {
      const op = this.consume().value;
      const right = this.parseUnary(context);
      if (op === '*') left = (left as number) * (right as number);
      else if (op === '/') left = (left as number) / (right as number);
      else left = (left as number) % (right as number);
    }
    return left;
  }

  // ! unary
  private parseUnary(context: Record<string, unknown>): unknown {
    if (this.peek().type === 'OP' && this.peek().value === '!') {
      this.consume();
      return !this.parsePostfix(context);
    }
    if (this.peek().type === 'OP' && this.peek().value === '-') {
      this.consume();
      return -(this.parsePostfix(context) as number);
    }
    return this.parsePostfix(context);
  }

  // member access, dynamic access, function calls
  private parsePostfix(context: Record<string, unknown>): unknown {
    let obj = this.parsePrimary(context);

    while (true) {
      const tok = this.peek();
      if (tok.type === 'DOT' || tok.type === 'OPTIONAL_DOT') {
        const isOptional = this.consume().type === 'OPTIONAL_DOT';
        if (isOptional && (obj === null || obj === undefined)) {
          // Short-circuit the rest of the member access chain
          // For simplicity in this evaluator, we'll continue but obj stays undefined
          obj = undefined;
        }

        const prop = this.expect('IDENT').value;
        this.checkBlockedProp(prop);

        if (obj !== undefined && obj !== null) {
          obj = (obj as Record<string, unknown>)?.[prop];
        } else {
          obj = undefined;
        }
      } else if (this.peek().type === 'LBRACKET') {
        this.consume();
        const key = this.parseExpression(context);
        this.expect('RBRACKET');
        this.checkBlockedProp(String(key));
        obj = (obj as Record<string, unknown>)?.[String(key)];
      } else if (this.peek().type === 'LPAREN') {
        this.consume();
        const args: unknown[] = [];
        while (this.peek().type !== 'RPAREN' && this.peek().type !== 'EOF') {
          args.push(this.parseExpression(context));
          if (this.peek().type === 'COMMA') this.consume();
        }
        this.expect('RPAREN');
        if (typeof obj !== 'function') {
          throw new SafeEvalError(`Attempted to call a non-function value.`);
        }
        obj = (obj as (...a: unknown[]) => unknown)(...args);
      } else {
        break;
      }
    }

    return obj;
  }

  private checkBlockedProp(prop: string): void {
    if (BLOCKED_IDENTIFIERS.has(prop)) {
      throw new SafeEvalError(`Access to "${prop}" is not allowed.`);
    }
  }

  // literals, identifiers, grouping
  private parsePrimary(context: Record<string, unknown>): unknown {
    const tok = this.peek();

    if (tok.type === 'NUMBER') {
      this.consume();
      return parseFloat(tok.value);
    }

    if (tok.type === 'STRING') {
      this.consume();
      return tok.value;
    }

    if (tok.type === 'TEMPLATE_LITERAL') {
      this.consume();
      // parts: [static0, expr0, static1, expr1, ..., staticN]
      const parts = JSON.parse(tok.value) as string[];
      let result = '';
      for (let pi = 0; pi < parts.length; pi++) {
        if (pi % 2 === 0) {
          // Static text part
          result += parts[pi];
        } else {
          // Expression part — evaluate recursively
          try {
            const innerTokens = tokenize(parts[pi].trim());
            const innerParser = new Parser(innerTokens);
            const val = innerParser.parseExpression(context);
            result += val === null || val === undefined ? '' : String(val);
          } catch {
            result += '';
          }
        }
      }
      return result;
    }

    if (tok.type === 'IDENT') {
      this.consume();
      if (tok.value === 'true') return true;
      if (tok.value === 'false') return false;
      if (tok.value === 'null') return null;
      if (tok.value === 'undefined') return undefined;

      // Block dangerous globals
      if (BLOCKED_IDENTIFIERS.has(tok.value)) {
        throw new SafeEvalError(`Access to "${tok.value}" is not allowed.`);
      }

      return context[tok.value];
    }

    if (tok.type === 'LPAREN') {
      this.consume();
      const val = this.parseExpression(context);
      this.expect('RPAREN');
      return val;
    }

    throw new SafeEvalError(`Unexpected token: ${tok.type} ("${tok.value}")`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Safely evaluate a JavaScript expression string against a given context.
 *
 * @param expression - The expression string to evaluate (NOT a full program, just an expression).
 * @param context    - The variable bindings available to the expression.
 * @returns The evaluated value.
 * @throws SafeEvalError if the expression uses blocked identifiers or invalid syntax.
 */
export function safeEval(expression: string, context: Record<string, unknown>): unknown {
  const trimmed = expression.trim();
  if (!trimmed) {
    return undefined;
  }
  const tokens = tokenize(trimmed);
  const parser = new Parser(tokens);
  const result = parser.parseExpression(context);
  return result;
}
