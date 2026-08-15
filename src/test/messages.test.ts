import { describe, it, expect } from 'vitest';
import en from '../../messages/en.json';
import ru from '../../messages/ru.json';

type Tree = { [key: string]: string | Tree };

function keyPaths(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string' ? [path] : keyPaths(value, path);
  });
}

function emptyPaths(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') return value.trim() === '' ? [path] : [];
    return emptyPaths(value, path);
  });
}

describe('messages', () => {
  it('en and ru declare exactly the same keys', () => {
    const enKeys = keyPaths(en).sort();
    const ruKeys = keyPaths(ru).sort();
    expect(ruKeys).toEqual(enKeys);
  });

  it('has no empty message values', () => {
    expect(emptyPaths(en)).toEqual([]);
    expect(emptyPaths(ru)).toEqual([]);
  });
});
