# ReactJsonComponent — React 使用指南

[English Version](./README.md)

> **對象讀者**：AI 代碼代理 (AI Code Agents) 以及希望在 **純 React** 環境（Vite、CRA、管理後台等）中使用 `ReactJsonComponent` 且不依賴 Next.js 的開發者。

---

## 1. 概覽

`ReactJsonComponent` 是一個將 **JSON AST 轉換為 React UI** 的渲染引擎。你將 UI 描述為一個純 JSON 物件 (AST)，將其交給 `ReactJsonRenderer`，它就會渲染出對應的組件樹。運行時不需要 JSX。

**核心模型：**

```
JsonASTNode (來自資料庫 / CMS / 配置)
        ↓
  ReactJsonRenderer
        ↓
  React 元素樹 (包含 Zustand 狀態、Action 處理程序、運算式綁定)
```

**主要優勢：**
- UI 結構以 JSON 存儲 — 可透過 CMS、資料庫或 API 輕鬆編輯。
- 安全的運算式解析 (不使用 `eval` / `new Function`)。
- 每個組件實例擁有獨立的 Zustand 狀態作用域 (Scoped State)。
- Action 註冊表 (Action Registry) 將邏輯保留在代碼中，而非 JSON 裡。
- 透過 `PureJsonComponent` 和 `createJsonComponent` 建立可重用的 CMS 組件。

---

## 2. 安裝與匯入

```bash
# 在你的專案中
npm install next-json-component
```

```tsx
// 純 React 進入點 (不依賴 Next.js)
import { ReactJsonRenderer } from 'next-json-component/react';
// 或是在本地開發時：
import { ReactJsonRenderer } from '@/lib/next-json-component/react';
```

---

## 3. `JsonASTNode` — 數據結構定義

每一片 UI 都是由一個 `JsonASTNode` 物件描述的。

```typescript
interface JsonASTNode {
  type: string;                                    // HTML 標籤 或 已註冊的組件名稱
  props?: Record<string, JsonPropValue>;           // 元素屬性 / 組件 Props
  children?: (JsonASTNode | string)[];             // 巢狀節點或純文字字串

  // 指令 (Directives)
  contextName?: string; // 註冊此節點的 context，供底下的 JSON 子節點透過 {{ context.name }} 存取
  $if?: string;    // 條件渲染: "{{ expr }}"
  $each?: string;  // 列表渲染: "{{ expr }}"
  $key?: string;   // 每個項目的穩定 Key
  $as?: string;    // 迴圈變數名稱 (預設: "item")
  $indexAs?: string; // 索引變數名稱 (預設: "index")
}
```

```typescript
type JsonPropValue =
  | string          // 可包含 {{ expr }}
  | number
  | boolean
  | null
  | ActionBinding   // { action: "name", args?: [...] }
  | Record<string, unknown>; // 巢狀物件 (例如 style)
```

### 最小範例

```json
{
  "type": "div",
  "props": { "className": "card" },
  "children": [
    { "type": "h1", "children": ["{{ state.title }}"] },
    { "type": "p",  "children": ["哈囉, {{ props.username }}!"] }
  ]
}
```

---

## 4. `ReactJsonRenderer` — 核心渲染組件

```tsx
import { ReactJsonRenderer } from 'next-json-component/react';

<ReactJsonRenderer
  template={myTemplate}       // JsonASTNode | AnalyzedNode
  options={{
    initialState: {},         // 初始 Zustand store 狀態
    actionRegistry: {},       // 具名的 Action 處理程序
    components: {},           // 自定義 React 組件表
  }}
  componentProps={{}}         // 可透過 {{ props.xxx }} 存取的外部 Props
/>
```

### 屬性 (Props)

| Prop | 類型 | 描述 |
|------|------|-------------|
| `template` | `JsonASTNode \| AnalyzedNode` | 要渲染的 JSON AST |
| `options.initialState` | `Record<string, unknown>` | 獨立 Zustand store 的初始狀態 |
| `options.actionRegistry` | `ActionRegistry` | Action 名稱 → 處理函式的映射 |
| `options.components` | `Record<string, ComponentType>` | AST 中 `type` 參照的自定義 React 組件 |
| `componentProps` | `Record<string, unknown>` | 在模板中可透過 `{{ props.xxx }}` 存取 |

---

## 5. 運算式語法 `{{ }}`

模板運算式使用雙大括號。它們由**安全運算式解析器**計算（不使用 `eval` 或 `new Function`）：

| 運算式 | 解析結果 |
|-----------|------------|
| `{{ state.count }}` | 來自 Zustand store 的值 |
| `{{ props.username }}` | 來自 `componentProps` 的值 |
| `{{ item.name }}` | 迴圈變數 (在 `$each` 內部) |
| `{{ index }}` | 迴圈索引 (在 `$each` 內部) |
| `{{ state.count > 0 ? '正數' : '零' }}` | 三元運算 |
| `{{ state.items.length }}` | 屬性存取 |
| `{{ () => { setState({ c: Math.abs(-1) }); } }}` | 函式定義（安全地綁定內聯事件回呼） |
| `你好 {{ state.name }}!` | 字串插值 (混合文字) |

**函式運算式 (Function Expressions)**: 支援定義如 `{{ () => { ... } }}` 的邏輯並安全的計算。函式內可直接存取 `state`, `props`, `setState`, 以及當前的 `context` 等變數。這對於不需要建立冗長 Action API 的基本內聯操作非常便利。

**類型保留**：獨立的 `{{ expr }}` 會回傳原始值（布林值、數字、物件）。混合字串（包含周圍文字）則會被轉為字串。

**安全性**：評估器是沙盒化的 — 禁止存取 `window`、`document`、`process`、`eval`、`Function` 以及原型鏈污染。

---

## 6. 狀態管理 (State Management)

每個 `ReactJsonRenderer` 實例都會創建自己的**獨立作用域 Zustand store**。Store 之間完全隔離 — 兄弟組件永遠不會共享狀態。

```tsx
<ReactJsonRenderer
  template={template}
  options={{
    initialState: { count: 0, user: '訪客' }
  }}
/>
```

在模板中，使用 `{{ state.xxx }}` 讀取狀態：
```json
{ "type": "span", "children": ["次數: {{ state.count }}"] }
```

---

## 7. Action 註冊表 (Action Registry)

Action 是**預先註冊的 JavaScript 函式**。JSON 模板僅存儲 Action 名稱 — 絕不包含代碼。這消除了 `eval` 的風險。

### 註冊 Action

```typescript
import type { ActionRegistry } from 'next-json-component/react';

const registry: ActionRegistry = {
  // (state, setState, props, ...args, ...eventArgs) => void | Promise<void>
  
  // 1. Immer 草稿變更 (直接操作不用回傳值)
  increment: (_state, setState) => {
    setState((draft) => {
      (draft.count as number)++;
    });
  },

  // 2. 經典的狀態合併 (傳入 Partial 物件)
  reset: (_state, setState) => {
    setState({ count: 0 });
  },

  // 3. 回呼回傳 Partial 物件
  setName: (_state, setState, _props, newName) => {
    setState((prev) => ({ name: newName as string }));
  },
};
```

### 在模板中綁定 Action

```json
{
  "type": "button",
  "props": {
    "onClick": { "action": "increment" }
  },
  "children": ["+"]
}
```

傳遞參數：
```json
{
  "type": "button",
  "props": {
    "onClick": { "action": "deleteTodo", "args": ["{{ item.id }}"] }
  },
  "children": ["刪除"]
}
```

---

## 8. 指令 (Directives)

### `$if` — 條件渲染

```json
{
  "type": "div",
  "$if": "{{ state.isLoggedIn }}",
  "children": ["歡迎回來！"]
}
```

當運算式結果為 falsy 時，節點將從 DOM 中完全移除（而不僅僅是隱藏）。

### `$each` — 列表渲染

```json
{
  "type": "li",
  "$each": "{{ state.items }}",
  "$as": "item",
  "$key": "{{ item.id }}",
  "children": ["{{ item.name }}"]
}
```

| 指令 | 預設值 | 描述 |
|-----------|---------|-------------|
| `$each` | — | 解析為陣列的運算式 |
| `$as` | `"item"` | 當前元素的變數名稱 |
| `$indexAs` | `"index"` | 當前索引的變數名稱 |
| `$key` | (內容哈希) | 穩定的 React Key；若省略則自動生成 |

---

## 9. 自定義組件 (`options.components`)

任何註冊的 React 組件都可以在模板中通過名稱引用：

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

模板用法：
```json
{
  "type": "Button",
  "props": { "variant": "primary", "onClick": { "action": "submit" } },
  "children": ["點擊我"]
}
```

---

## 10. Context 雙向支援 (`contextName`)

你可以透過 Context 在深度嵌套的 JSON AST 中共享狀態，而無需手動將 Props 一層層傳遞下去。這套機制作為 React 原生 `useContext` 與內部解析器的完美橋樑。

當一個 AST 節點擁有了 `contextName` 屬性時，引擎會從該節點將它的 `props.value` 轉換並綁定到後代所有元素的 `{{ context.xxx }}` 命名空間。這功能可以跟傳入 `options.components` 中的原生 React Context Provider 天衣無縫的搭配：

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
          children: ["目前套用的語系主題是 {{ context.theme }}"]
        }
      ]
    }}
    options={{ components: { ThemeProvider } }}
  />
);
```

**機制的好處在於：**
1. 你的 JSON 範本可以直接下達 `{{ context.theme }}` 動態存取數值。
2. 假使 `ThemeProvider` 內夾帶了原生 React 元件（例如藉由 `$slot` 或直接 `children` 傳進來），這些原生的 Component 依舊能直接呼叫 `useContext(ThemeContext)` 共享完全相同的值。開發體驗與原始的 React 完全零落差！
3. Context 的值採用分支安全覆蓋：相平行的手足節點完全相互隔離獨立，絕不互相干擾！

---

## 11. CMS 組件工廠

### `PureJsonComponent` — 無狀態工廠

從 `JsonASTNode` 創建一個 **沒有 Zustand store** 的 React 組件。非常適合純展示用的 CMS 組件。

```tsx
import { PureJsonComponent } from 'next-json-component/react';

const Title = PureJsonComponent(
  {
    type: 'h1',
    props: { className: 'cms-title' },
    children: [{ type: '$slot' }],   // 使用者傳入的 children 會顯示在這裡
  },
  { components: { /* 巢狀組件 */ } }
);

// 像一般 React 組件一樣使用：
<Title>哈囉世界</Title>
```

### `createJsonComponent` — 有狀態工廠

從 `JsonASTNode` 創建一個備有 **獨立作用域 Zustand store** 的 React 組件。用於具交互性的 CMS 組件。

```tsx
import { createJsonComponent } from 'next-json-component/react';

const Counter = createJsonComponent(
  {
    type: 'div',
    children: [
      { type: 'span', children: ['{{ state.count }}'] },
      { type: 'button', props: { onClick: { action: 'inc' } }, children: ['+'] },
      { type: '$slot' },
    ],
  },
  {
    initialState: { count: 0 },
    actionRegistry: {
      inc: (state, setState) => setState({ count: (state.count as number) + 1 }),
    },
  }
);
```

---

## 12. 完整範例 — 計數器 + 待辦事項

```tsx
import { ReactJsonRenderer } from 'next-json-component/react';
import type { JsonASTNode, ActionRegistry } from 'next-json-component/react';

const template: JsonASTNode = {
  type: 'div',
  props: { className: 'app' },
  children: [
    { type: 'h2', children: ['次數: {{ state.count }}'] },
    {
      type: 'div',
      children: [
        { type: 'button', props: { onClick: { action: 'decrement' } }, children: ['−'] },
        { type: 'button', props: { onClick: { action: 'increment' } }, children: ['+'] },
      ],
    },
    {
      type: 'p',
      $if: '{{ state.count >= 10 }}',
      children: ['🎉 達標 10 次了！'],
    },
    {
      type: 'ul',
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
};

const registry: ActionRegistry = {
  increment: (s, set) => set({ count: (s.count as number) + 1 }),
  decrement: (s, set) => set({ count: Math.max(0, (s.count as number) - 1) }),
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
            { id: '1', text: '學習 ReactJsonComponent' },
            { id: '2', text: '打造酷東西' },
          ],
        },
        actionRegistry: registry,
      }}
    />
  );
}
```

---

## 13. JSX ↔ JSON 轉換器

本庫附帶開發流程所需的雙向轉換器：

```typescript
import { jsxToJson, jsonToJsx } from 'next-json-component';

// 將 JSX 字串轉換為 JsonASTNode
const ast = jsxToJson(`
  <div className="card">
    <h1>{{ state.title }}</h1>
    <button onClick={{ action: 'submit' }}>提交</button>
  </div>
`);

// 將 JsonASTNode 轉回 JSX 字串
const jsx = jsonToJsx(ast);
```

---

## 14. 架構總結

```
消費者 (React/Vite 應用程式)
  └─ ReactJsonRenderer (React.memo)
       ├─ createScopedStore()      ← 每個實例獨立的 Zustand store
       ├─ analyzeTree(template)    ← 標記靜態子樹以便優化
       ├─ buildRenderContext()     ← { state, setState, props, options }
       └─ renderNode(ast, ctx)     ← 遞迴 JSON → React.createElement
            ├─ type === '$slot'    → 回傳 ctx.props.children
            ├─ $if 檢查            → 若為 falsy 則回傳 null
            ├─ $each              → 遍歷陣列，建立具 Key 的元素
            ├─ resolveComponentType() → options.components[type] || HTML 標籤
            ├─ resolveNodeProps() → 解析每個 Prop 中的 {{ }}
            │    └─ ActionBinding → resolveHandler() → 綁定事件函式
            └─ renderChildren()   → 對每個子節點/字串進行遞迴
```
