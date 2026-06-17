import { describe, it, expect } from 'vitest';
import { handicapToBucket } from '../buckets';

describe('handicapToBucket', () => {
  it('índice 0 o negativo (plus) → scratch', () => {
    expect(handicapToBucket(0)).toBe('scratch');
    expect(handicapToBucket(-2.3)).toBe('scratch');
  });
  it('cortes por rango', () => {
    expect(handicapToBucket(4.9)).toBe('1-4');
    expect(handicapToBucket(5)).toBe('5-9');
    expect(handicapToBucket(12)).toBe('10-14');
    expect(handicapToBucket(19.9)).toBe('15-19');
    expect(handicapToBucket(28)).toBe('20-28');
    expect(handicapToBucket(36)).toBe('29+');
  });
});
