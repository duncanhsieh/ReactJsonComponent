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

import hash from 'object-hash';

/**
 * Generate a stable string key for a list item.
 *
 * Priority:
 *   1. Explicit $key expression (resolved by the renderer, passed in as `resolvedKey`)
 *   2. Hash of the item data
 *   3. Fallback: string-coerced index (last resort)
 *
 * @param item         - The current list item.
 * @param index        - The current iteration index.
 * @param resolvedKey  - The pre-resolved $key value (if $key was provided in JSON).
 * @returns A stable string key for React.
 */
export function generateKey(
  item: unknown,
  index: number,
  resolvedKey?: unknown,
): string {
  // 1. Use explicit $key if provided and non-empty
  if (resolvedKey != null && resolvedKey !== '') {
    return String(resolvedKey);
  }

  // 2. Hash the item content
  try {
    return `item_${hashItem(item)}`;
  } catch {
    // 3. Fallback to index — logged so developers know this is happening
    console.warn(
      `[NextJsonComponent] Could not hash list item at index ${index}. ` +
        `Falling back to index key. Consider adding a $key to your $each node.`,
    );
    return `__index_${index}`;
  }
}

/**
 * Produce a deterministic hash string from any serialisable value.
 * Uses `object-hash` for robustness with complex data shapes.
 */
function hashItem(item: unknown): string {
  if (item === null || item === undefined) {
    return 'null';
  }
  if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
    return String(item);
  }
  // For objects/arrays — use object-hash for a stable deterministic hash
  return hash(item as object, {
    algorithm: 'md5',
    encoding: 'hex',
  });
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
