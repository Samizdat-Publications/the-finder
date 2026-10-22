import { describe, expect, it } from 'vitest';
import { onStartOver, runStartOver } from './resetHooks';

describe('start over registry', () => {
  it('runs every registered function, in order, and the unsubscribe removes one', () => {
    const seen: string[] = [];
    const offA = onStartOver(() => seen.push('a'));
    const offB = onStartOver(() => seen.push('b'));
    runStartOver();
    expect(seen).toEqual(['a', 'b']);
    offA();
    runStartOver();
    expect(seen).toEqual(['a', 'b', 'b']);
    offB();
    runStartOver();
    expect(seen).toEqual(['a', 'b', 'b']);
  });

  it('runs the others when one throws, then rethrows the first error', () => {
    const seen: string[] = [];
    const off = [
      onStartOver(() => seen.push('before')),
      onStartOver(() => {
        throw new Error('boom');
      }),
      onStartOver(() => seen.push('after')),
    ];
    expect(() => runStartOver()).toThrow('boom');
    expect(seen).toEqual(['before', 'after']);
    off.forEach((f) => f());
  });
});
