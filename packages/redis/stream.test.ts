import { expect, test } from 'bun:test';
import { minStreamId } from './stream';

test('minStreamId compares milliseconds before sequence numbers', () => {
  expect(minStreamId(['1700000000001-0', '1700000000000-9', '1700000000000-10'])).toBe('1700000000000-9');
});

test('minStreamId compares numerically, not as text', () => {
  expect(minStreamId(['999-0', '1000-0'])).toBe('999-0');
});

test('minStreamId returns null for no ids', () => {
  expect(minStreamId([])).toBeNull();
});
