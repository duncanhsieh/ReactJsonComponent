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

describe('generateKey — hash-based keys', () => {
  it('generates a deterministic hash for an object', () => {
    const item = { id: 1, name: 'Alice' };
    const key1 = generateKey(item, 0);
    const key2 = generateKey(item, 0);
    expect(key1).toBe(key2);
  });

  it('generates different hashes for different objects', () => {
    const item1 = { id: 1, name: 'Alice' };
    const item2 = { id: 2, name: 'Bob' };
    expect(generateKey(item1, 0)).not.toBe(generateKey(item2, 1));
  });

  it('handles primitive values', () => {
    const key1 = generateKey('hello', 0);
    const key2 = generateKey('hello', 0);
    expect(key1).toBe(key2);
    expect(typeof key1).toBe('string');
  });

  it('handles number values', () => {
    const key1 = generateKey(42, 0);
    const key2 = generateKey(42, 0);
    expect(key1).toBe(key2);
  });

  it('handles null gracefully', () => {
    const key = generateKey(null, 0);
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });
});

describe('generateKeys — batch generation', () => {
  it('generates one key per item', () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const keys = generateKeys(items);
    expect(keys).toHaveLength(3);
    // All keys should be unique
    expect(new Set(keys).size).toBe(3);
  });

  it('uses explicit keys when provided', () => {
    const items = [{ id: 1 }, { id: 2 }];
    const resolvedKeys = ['key-a', 'key-b'];
    const keys = generateKeys(items, resolvedKeys);
    expect(keys[0]).toBe('key-a');
    expect(keys[1]).toBe('key-b');
  });
});
