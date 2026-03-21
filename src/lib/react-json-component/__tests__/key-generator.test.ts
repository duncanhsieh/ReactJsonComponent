/**
 * key-generator.test.ts
 *
 * Tests for hash-based stable key generation.
 */

import { describe, it, expect } from 'vitest';
import { generateKey, generateKeys } from '../key-generator';

describe('generateKey — explicit $key', () => {
  it('returns string-coerced explicit key when provided', () => {
    expect(generateKey({ id: 1 }, 0, 'my-key')).toBe('my-key');
    expect(generateKey({ id: 1 }, 0, 42)).toBe('42');
  });

  it('falls through when explicit key is undefined', () => {
    // Should not return undefined string
    const key = generateKey({ id: 1 }, 0, undefined);
    expect(key).not.toBe('undefined');
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });
});

describe('generateKey — index fallback keys', () => {
  it('generates an index-based key when explicit key is missing', () => {
    const item = { id: 1, name: 'Alice' };
    const key1 = generateKey(item, 0);
    expect(key1).toBe('__index_0');
  });

  it('generates different fallback paths for different iterations', () => {
    const item1 = { id: 1, name: 'Alice' };
    const item2 = { id: 2, name: 'Bob' };
    expect(generateKey(item1, 0)).not.toBe(generateKey(item2, 1));
    expect(generateKey(item1, 0)).toBe('__index_0');
    expect(generateKey(item1, 1)).toBe('__index_1');
  });

  it('handles primitive values via index', () => {
    const key1 = generateKey('hello', 4);
    expect(key1).toBe('__index_4');
  });

  it('handles number values via index', () => {
    const key1 = generateKey(42, 99);
    expect(key1).toBe('__index_99');
  });

  it('handles null gracefully', () => {
    const key = generateKey(null, 5);
    expect(key).toBe('__index_5');
  });
});

describe('generateKeys — batch generation', () => {
  it('generates one key per item prioritizing index when there is no explicitly passed key array', () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const keys = generateKeys(items);
    expect(keys).toHaveLength(3);
    expect(keys).toEqual(['__index_0', '__index_1', '__index_2']);
  });

  it('uses explicit keys when provided', () => {
    const items = [{ id: 1 }, { id: 2 }];
    const resolvedKeys = ['key-a', 'key-b'];
    const keys = generateKeys(items, resolvedKeys);
    expect(keys[0]).toBe('key-a');
    expect(keys[1]).toBe('key-b');
  });
});
