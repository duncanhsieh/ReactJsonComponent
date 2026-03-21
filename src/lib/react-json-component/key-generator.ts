/**
 * key-generator.ts
 *
 * Hash-based stable key generation for $each list rendering.
 *
 * When a JSON AST uses $each without a $key, React needs a stable key
 * to correctly reconcile list items. Using array index causes state
 * misalignment when items are reordered or inserted.
 *
 * This module generates a deterministic hash from the item's content,
 * falling back to index only if hashing fails.
 */

/**
 * Generate a stable string key for a list item.
 *
 * Priority:
 *   1. Explicit $key expression (resolved by the renderer, passed in as `resolvedKey`)
 *   2. Fallback: string-coerced index (last resort)
 *
 * @param item         - The current list item.
 * @param index        - The current iteration index.
 * @param resolvedKey  - The pre-resolved $key value (if $key was provided in JSON).
 * @returns A stable string key for React.
 */
declare const process: any;

export function generateKey(
  _item: unknown,
  index: number,
  resolvedKey?: unknown,
): string {
  // 1. Use explicit $key if provided and non-empty
  if (resolvedKey != null && resolvedKey !== '') {
    return String(resolvedKey);
  }

  // 2. Fallback to index
  if (process.env.NODE_ENV !== 'production') {
    console.error(
      `%c[ReactJsonComponent] Missing $key in $each node!\n` +
      `Falling back to index ${index}. This can cause rendering bugs and state misalignment when items are reordered or inserted. \n` +
      `Please add a "$key" property to your JSON AST (e.g. "$key": "{{ item.id }}").`,
      'color: red; font-weight: bold; font-size: 14px;'
    );
  }
  return `__index_${index}`;
}

/**
 * Generate stable keys for an entire array of items.
 * Useful for batch-processing a $each list.
 *
 * @param items       - The array being iterated.
 * @param resolvedKeys - Optional array of pre-resolved $key values.
 * @returns Array of stable string keys, one per item.
 */
export function generateKeys(
  items: unknown[],
  resolvedKeys?: unknown[],
): string[] {
  return items.map((item, index) =>
    generateKey(item, index, resolvedKeys?.[index]),
  );
}
