# ReactJsonComponent — React Usage Guide

[繁體中文版](./README.zh-TW.md)

> **Target audience**: AI Code Agents and developers who want to use `ReactJsonComponent` in a **pure React** environment (Vite, CRA, admin dashboards, etc.) without any Next.js dependency.

---

## 1. Overview

`ReactJsonComponent` is a **JSON AST → React UI** rendering engine. You describe a UI as a plain JSON object (the AST), hand it to `ReactJsonRenderer`, and it renders the component tree. No JSX required at runtime.

**The core mental model:**

```
JsonASTNode (from DB / CMS / config)
        ↓
  ReactJsonRenderer
        ↓
  React element tree (with Zustand state, action handlers, expression bindings)
```

**Key benefits:**
- UI structure stored as JSON — editable by CMS, database, or API
- Safe expression evaluation (no `eval` / `new Function`)
- Scoped Zustand state per component instance
- Action Registry keeps logic in code, never in JSON
- Reusable CMS components via `PureJsonComponent` and `createJsonComponent`

---

## 2. Installation & Import

```bash
# inside your project
npm install next-json-component
```

```tsx
// React-only entry point (no Next.js dependency)
import { ReactJsonRenderer } from 'next-json-component/react';
// or for local in-repo development:
import { ReactJsonRenderer } from '@/lib/next-json-component/react';
```

---

## 3. `JsonASTNode` — The Data Schema

Every piece of UI is described by a `JsonASTNode` object.

```typescript
interface JsonASTNode {
  type: string;                                    // HTML tag OR registered component name
  props?: Record<string, JsonPropValue>;           // Element attributes / component props
  children?: (JsonASTNode | string)[];             // Nested nodes or text strings

  // Directives
  contextName?: string; // Expose component props as {{ context.name }} to AST children
  $if?: string;    // Conditional rendering: "{{ expr }}"
  $each?: string;  // List rendering:        "{{ expr }}"
  $key?: string;   // Stable key for each item
  $as?: string;    // Loop variable name (default: "item")
  $indexAs?: string; // Index variable name (default: "index")
}
```

```typescript
type JsonPropValue =
  | string          // may contain {{ expr }}
  | number
  | boolean
  | null
  | ActionBinding   // { action: "name", args?: [...] }
  | Record<string, unknown>; // nested object (e.g. style)
```

### Minimal Example

```json
{
  "type": "div",
  "props": { "className": "card" },
  "children": [
    { "type": "h1", "children": ["{{ state.title }}"] },
    { "type": "p",  "children": ["Hello, {{ props.username }}!"] }
  ]
}
```

---

## 4. `ReactJsonRenderer` — Core Component

```tsx
import { ReactJsonRenderer } from 'next-json-component/react';

<ReactJsonRenderer
  template={myTemplate}       // JsonASTNode | AnalyzedNode
  options={{
    initialState: {},         // Initial Zustand store state
    actionRegistry: {},       // Named action handlers
    components: {},           // Custom React components by name
  }}
  componentProps={{}}         // Props accessible as {{ props.xxx }}
/>
```

### Props

| Prop | Type | Description |
|------|------|-------------|
| `template` | `JsonASTNode \| AnalyzedNode` | The JSON AST to render |
| `options.initialState` | `Record<string, unknown>` | Initial state for the scoped Zustand store |
| `options.actionRegistry` | `ActionRegistry` | Map of action name → handler function |
| `options.components` | `Record<string, ComponentType>` | Custom React components referenced by `type` in the AST |
| `componentProps` | `Record<string, unknown>` | Accessible in the template as `{{ props.xxx }}` |

---

## 5. Expression Syntax `{{ }}`

Template expressions use double curly braces. They are evaluated by a **safe expression resolver** (no `eval`, no `new Function`):

| Expression | Resolves to |
|-----------|------------|
| `{{ state.count }}` | Value from the Zustand store |
| `{{ props.username }}` | Value from `componentProps` |
| `{{ item.name }}` | Loop variable (inside `$each`) |
| `{{ index }}` | Loop index (inside `$each`) |
| `{{ state.count > 0 ? 'positive' : 'zero' }}` | Ternary |
| `{{ state.items.length }}` | Property access |
| `{{ () => { setState({ c: Math.abs(-1) }); } }}` | Safe function definitions (for inline event callbacks) |
| `Hello {{ state.name }}!` | String interpolation (mixed) |

**Function Expressions**: `{{ () => { ... } }}` definitions are evaluated safely. They have access to `state`, `props`, `setState`, and any `context` available. They are ideal for inline event callbacks when you don't need a full action registry function.

### Dynamic `type` and Prop Keys

`{{ }}` expressions can be used in **three additional places** beyond prop values:

#### 1. Dynamic component type

Decide the rendered tag or component at runtime:

```json
{
  "type": "{{ state.isInternal ? 'NavLink' : 'a' }}",
  "props": { "href": "/home" },
  "children": ["Home"]
}
```

- When `state.isInternal` is `true`, the result is `<NavLink href="/home">Home</NavLink>` (resolved from `options.components`).
- When `false`, the result is `<a href="/home">Home</a>`.

#### 2. Dynamic prop keys

The prop key *name* itself can be an expression:

```json
{
  "type": "div",
  "props": {
    "{{ state.ariaRole ? 'role' : 'data-role' }}": "{{ state.ariaRole }}"
  }
}
```

#### 3. Dynamic className / any prop value

```json
{
  "type": "div",
  "props": {
    "className": "{{ state.theme === 'dark' ? 'bg-black text-white' : 'bg-white text-black' }}"
  }
}
```

**Type preservation**: A standalone `{{ expr }}` returns the raw value (boolean, number, object). Mixed strings (with surrounding text) are stringified.

**Security**: The evaluator is sandboxed — access to `window`, `document`, `process`, `eval`, `Function`, and prototype pollution are all blocked.

---

## 6. State Management

Each `ReactJsonRenderer` instance creates its own **scoped Zustand store**. Stores are completely isolated — sibling components never share state.

```tsx
<ReactJsonRenderer
  template={template}
  options={{
    initialState: { count: 0, user: 'Guest' }
  }}
/>
```

In the template, read state with `{{ state.xxx }}`:
```json
{ "type": "span", "children": ["Count: {{ state.count }}"] }
```

---

## 7. Action Registry

Actions are **pre-registered JavaScript functions**. The JSON template only stores the action name — never the code. This eliminates `eval` risks.

### Registering Actions

```typescript
import type { ActionRegistry } from 'next-json-component/react';

const registry: ActionRegistry = {
  // (state, setState, props, ...args, ...eventArgs) => void | Promise<void>
  
  // 1. Immer draft mutation (auto-provided by immer middleware)
  increment: (_state, setState) => {
    setState((draft) => {
      (draft.count as number)++;
    });
  },

  // 2. Classic state partial
  reset: (_state, setState) => {
    setState({ count: 0 });
  },

  // 3. Callback returning partial
  setName: (_state, setState, _props, newName) => {
    setState((prev) => ({ name: newName as string }));
  },
};
```

### Binding Actions in the Template

```json
{
  "type": "button",
  "props": {
    "onClick": { "action": "increment" }
  },
  "children": ["+"]
}
```

With args:
```json
{
  "type": "button",
  "props": {
    "onClick": { "action": "deleteTodo", "args": ["{{ item.id }}"] }
  },
  "children": ["Delete"]
}
```

### `ActionBinding` Schema

```typescript
interface ActionBinding {
  action: string;                           // registered action name
  args?: (string | number | boolean)[];     // static or {{ expr }} args
  serverAction?: boolean;                   // Next.js only, ignored in React mode
}
```

### Action Handler Signature

```typescript
type RegistryAction = (
  state: Record<string, unknown>,  // current store state
  setState: SetStateFn,            // partial update or updater function
  props: Record<string, unknown>,  // componentProps from consumer
  ...args: unknown[]               // resolved args from ActionBinding.args
                                   // followed by the native event object
) => Promise<void> | void;
```

---

## 8. Directives

### `$if` — Conditional Rendering

```json
{
  "type": "div",
  "$if": "{{ state.isLoggedIn }}",
  "children": ["Welcome back!"]
}
```

The node is removed from the DOM entirely (not just hidden) when the expression is falsy.

### `$each` — List Rendering

```json
{
  "type": "li",
  "$each": "{{ state.items }}",
  "$as": "item",
  "$key": "{{ item.id }}",
  "children": ["{{ item.name }}"]
}
```

| Directive | Default | Description |
|-----------|---------|-------------|
| `$each` | — | Expression resolving to an array |
| `$as` | `"item"` | Variable name for the current element |
| `$indexAs` | `"index"` | Variable name for the current index |
| `$key` | (content hash) | Stable React key; auto-generated if omitted |

**Notes:**
- `$each` and `$if` can be combined on the same node
- Nested `$each` (2D grids) are supported
- If `$each` resolves to a non-array, a warning is logged and `null` is returned

### `$slot` — Children Passthrough

A special `type` used inside `PureJsonComponent` or `createJsonComponent` templates to render the children passed by the consumer:

```json
{
  "type": "article",
  "props": { "className": "card" },
  "children": [{ "type": "$slot" }]
}
```

When the consumer passes children, they appear at the `$slot` position:
```tsx
<Card>
  <p>This content goes into $slot</p>
</Card>
```

---

## 9. Custom Components (`options.components`)

Any registered React component can be referenced by name in the template:

```tsx
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

<ReactJsonRenderer
  template={template}
  options={{
    components: { Button, Badge }
  }}
/>
```

Template usage:
```json
{
  "type": "Button",
  "props": { "variant": "primary", "onClick": { "action": "submit" } },
  "children": ["Click me"]
}
```

**Fallback**: If `type` is not found in `components`, it is treated as an HTML tag (lowercased). Unknown HTML tags are passed through to React as-is.

---

## 10. Context Providers (`contextName`)

You can share values across deeply nested components in the JSON AST without prop drilling. This acts as a bridge between React's underlying `useContext` and the JSON evaluator.

When an AST node declares a `contextName`, its `props.value` is placed into the `{{ context.xxx }}` namespace for all of its children. This perfectly couples with React Context Providers provided in `options.components`:

```tsx
import { createContext } from 'react';
import { ReactJsonRenderer } from 'next-json-component/react';

export const ThemeContext = createContext('light');

const ThemeProvider = ({ value, children }) => (
  <ThemeContext.Provider value={value}>
    {children}
  </ThemeContext.Provider>
);

const App = () => (
  <ReactJsonRenderer
    template={{
      type: "ThemeProvider",
      contextName: "theme",
      props: { value: "dark" },
      children: [
        {
          type: "div",
          props: { className: "{{ context.theme === 'dark' ? 'bg-black' : 'bg-white' }}" },
          children: ["The current theme is {{ context.theme }}"]
        }
      ]
    }}
    options={{ components: { ThemeProvider } }}
  />
);
```

**Why this is powerful:**
1. The JSON template uses `{{ context.theme }}` to safely read the value.
2. If the `ThemeProvider` renders a native React Component inside its `$slot` (or via `children`), those native components can call `useContext(ThemeContext)` and receive the exact same value. Zero disjointing!
3. Context values branch securely downstream: sibling nodes remain perfectly isolated!

---

## 11. CMS Component Factories

### `PureJsonComponent` — Stateless Factory

Creates a React component from a `JsonASTNode` with **no Zustand store**. Ideal for purely presentational CMS components.

```tsx
import { PureJsonComponent } from 'next-json-component/react';

const Title = PureJsonComponent(
  {
    type: 'h1',
    props: { className: 'cms-title' },
    children: [{ type: '$slot' }],   // children passed from consumer appear here
  },
  { components: { /* nested components */ } }  // optional inner registry
);

// Use like any React component:
<Title>Hello World</Title>

// Or reference by name in another template:
<ReactJsonRenderer
  template={{ type: 'Title', children: ['Hello'] }}
  options={{ components: { Title } }}
/>
```

**Inside the template:** consumer props are available as `{{ props.xxx }}`, consumer children are rendered at `{ "type": "$slot" }`.

```tsx
const InfoCard = PureJsonComponent({
  type: 'div',
  props: { className: 'card' },
  children: [
    { type: 'h2', children: ['{{ props.title }}'] },  // reads consumer prop
    { type: '$slot' },                                 // renders consumer children
  ],
});

// Consumer:
<InfoCard title="My Card">
  <p>Card body content</p>
</InfoCard>
```

### `createJsonComponent` — Stateful Factory

Creates a React component from a `JsonASTNode` backed by a **scoped Zustand store**. For interactive CMS components.

```tsx
import { createJsonComponent } from 'next-json-component/react';

const Counter = createJsonComponent(
  {
    type: 'div',
    children: [
      { type: 'span', children: ['{{ state.count }}'] },
      {
        type: 'button',
        props: { onClick: { action: 'inc' } },
        children: ['+'],
      },
      { type: '$slot' },  // optional: render consumer children after the counter
    ],
  },
  {
    initialState: { count: 0 },
    actionRegistry: {
      inc: (state, setState) => setState({ count: (state.count as number) + 1 }),
    },
  }
);

// Direct usage:
<Counter>
  <span>suffix text</span>
</Counter>

// Or in another template:
<ReactJsonRenderer
  template={{ type: 'Counter' }}
  options={{ components: { Counter } }}
/>
```

### Combining Both Factories

```tsx
// components/cms-registry.ts
'use client'; // Required in Next.js; fine to omit in pure React

import { PureJsonComponent, createJsonComponent } from 'next-json-component/react';

export const Title = PureJsonComponent({
  type: 'h2',
  props: { className: 'section-title' },
  children: [{ type: '$slot' }],
});

export const InfoCard = PureJsonComponent({
  type: 'div',
  props: { className: 'info-card' },
  children: [
    { type: 'header', children: ['{{ props.label }}'] },
    { type: '$slot' },
  ],
});

export const MiniCounter = createJsonComponent(
  {
    type: 'div',
    children: [
      { type: 'button', props: { onClick: { action: 'dec' } }, children: ['−'] },
      { type: 'span', children: ['{{ state.n }}'] },
      { type: 'button', props: { onClick: { action: 'inc' } }, children: ['+'] },
    ],
  },
  {
    initialState: { n: 0 },
    actionRegistry: {
      inc: (s, set) => set({ n: (s.n as number) + 1 }),
      dec: (s, set) => set({ n: Math.max(0, (s.n as number) - 1) }),
    },
  }
);
```

```tsx
// page-template.ts (from CMS/DB)
const pageTemplate: JsonASTNode = {
  type: 'div',
  children: [
    { type: 'Title', children: ['Dashboard'] },
    {
      type: 'InfoCard',
      props: { label: 'Visits' },
      children: [{ type: 'MiniCounter' }],
    },
  ],
};
```

```tsx
// App.tsx
import { ReactJsonRenderer } from 'next-json-component/react';
import { Title, InfoCard, MiniCounter } from './cms-registry';

export function App() {
  return (
    <ReactJsonRenderer
      template={pageTemplate}
      options={{
        components: { Title, InfoCard, MiniCounter },
      }}
    />
  );
}
```

---

## 12. Full Working Example — Counter + Todo

```tsx
import { ReactJsonRenderer } from 'next-json-component/react';
import type { JsonASTNode, ActionRegistry } from 'next-json-component/react';

const template: JsonASTNode = {
  type: 'div',
  props: { className: 'app' },
  children: [
    // State display
    {
      type: 'h2',
      children: ['Count: {{ state.count }}'],
    },
    // Buttons
    {
      type: 'div',
      children: [
        {
          type: 'button',
          props: { onClick: { action: 'decrement' } },
          children: ['−'],
        },
        {
          type: 'button',
          props: { onClick: { action: 'increment' } },
          children: ['+'],
        },
        {
          type: 'button',
          props: { onClick: { action: 'reset' } },
          children: ['Reset'],
        },
      ],
    },
    // Conditional milestone message
    {
      type: 'p',
      $if: '{{ state.count >= 10 }}',
      children: ['🎉 You reached 10!'],
    },
    // Todo list
    {
      type: 'ul',
      $if: '{{ state.todos.length > 0 }}',
      children: [
        {
          type: 'li',
          $each: '{{ state.todos }}',
          $as: 'todo',
          $key: '{{ todo.id }}',
          children: [
            { type: 'span', children: ['{{ todo.text }}'] },
            {
              type: 'button',
              props: { onClick: { action: 'deleteTodo', args: ['{{ todo.id }}'] } },
              children: ['×'],
            },
          ],
        },
      ],
    },
  ],
};

const registry: ActionRegistry = {
  increment: (s, set) => set({ count: (s.count as number) + 1 }),
  decrement: (s, set) => set({ count: Math.max(0, (s.count as number) - 1) }),
  reset:     (_s, set) => set({ count: 0 }),
  deleteTodo: (s, set, _props, id) =>
    set({ todos: (s.todos as any[]).filter(t => t.id !== id) }),
};

export function App() {
  return (
    <ReactJsonRenderer
      template={template}
      options={{
        initialState: {
          count: 0,
          todos: [
            { id: '1', text: 'Learn ReactJsonComponent' },
            { id: '2', text: 'Build something cool' },
          ],
        },
        actionRegistry: registry,
      }}
      componentProps={{ username: 'Alice' }}
    />
  );
}
```

---

## 13. JSX ↔ JSON Converters

The library ships two-way converters for development workflow:

```typescript
import { jsxToJson, jsonToJsx } from 'next-json-component';

// Convert JSX string to JsonASTNode
const ast = jsxToJson(`
  <div className="card">
    <h1>{{ state.title }}</h1>
    <button onClick={{ action: 'submit' }}>Submit</button>
  </div>
`);

// Convert JsonASTNode back to JSX string
const jsx = jsonToJsx(ast);
```

---

## 14. Type Reference

```typescript
// Core types (all exported from 'next-json-component/react' and 'next-json-component')

interface JsonASTNode {
  type: string;
  props?: Record<string, JsonPropValue>;
  children?: (JsonASTNode | string)[];
  
  contextName?: string;
  $if?: string;
  $each?: string;
  $key?: string;
  $as?: string;
  $indexAs?: string;
}

interface ActionBinding {
  action: string;
  args?: (string | number | boolean)[];
  serverAction?: boolean; // Next.js only
}

type RegistryAction = (
  state: Record<string, unknown>,
  setState: SetStateFn,
  props: Record<string, unknown>,
  ...args: unknown[]
) => Promise<void> | void;

type ActionRegistry = Record<string, RegistryAction>;

type SetStateFn = (
  update: Partial<Record<string, unknown>>
       | ((state: Record<string, unknown>) => Partial<Record<string, unknown>>)
) => void;

interface ReactJsonComponentOptions {
  components?: Record<string, ComponentType<Record<string, unknown>>>;
  actionRegistry?: ActionRegistry;
  initialState?: Record<string, unknown>;
  // serverActions: Next.js only, not available in ReactJsonRenderer
}
```

---

## 15. Architecture Summary

```
Consumer (React/Vite app)
  └─ ReactJsonRenderer (React.memo)
       ├─ createScopedStore()      ← isolated Zustand store per instance
       ├─ analyzeTree(template)    ← marks static subtrees for memoization
       ├─ buildRenderContext()     ← { state, setState, props, options }
       └─ renderNode(ast, ctx)     ← recursive JSON → React.createElement
            ├─ type === '$slot'    → return ctx.props.children
            ├─ $if check          → return null if falsy
            ├─ $each              → map over array, create keyed elements
            ├─ resolveComponentType() → options.components[type] || HTML tag
            ├─ resolveNodeProps() → resolve {{ }} in each prop value
            │    └─ ActionBinding → resolveHandler() → bound event function
            └─ renderChildren()   → recurse for each child node/string
```
