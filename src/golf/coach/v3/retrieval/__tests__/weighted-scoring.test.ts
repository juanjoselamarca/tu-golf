import { describe, it, expect } from 'vitest';
import { applyBlockWeights } from '../weighted-scoring';

describe('applyBlockWeights', () => {
  it('multiplica rerankScore por block weight', () => {
    const ranked = [
      { id: 'a', rerankScore: 0.8, blockKey: 'rules' },
      { id: 'b', rerankScore: 0.5, blockKey: 'rules' },
    ];
    const result = applyBlockWeights(ranked, { rules: 0.1 });
    expect(result[0].finalScore).toBeCloseTo(0.08);
    expect(result[1].finalScore).toBeCloseTo(0.05);
  });

  it('block sin peso definido → finalScore = rerankScore (weight 1.0)', () => {
    const ranked = [{ id: 'a', rerankScore: 0.8, blockKey: 'unknown' }];
    const result = applyBlockWeights(ranked, { rules: 0.1 });
    expect(result[0].finalScore).toBe(0.8);
  });

  it('blockKey undefined → finalScore = rerankScore', () => {
    const ranked = [{ id: 'a', rerankScore: 0.8 }];
    const result = applyBlockWeights(ranked, { rules: 0.5 });
    expect(result[0].finalScore).toBe(0.8);
  });

  it('preserva propiedades originales del candidato', () => {
    const ranked = [
      { id: 'a', rerankScore: 0.8, blockKey: 'rules', extra: 'data', other: 42 } as any,
    ];
    const result = applyBlockWeights(ranked, { rules: 1.0 });
    expect((result[0] as any).extra).toBe('data');
    expect((result[0] as any).other).toBe(42);
  });

  it('input vacío devuelve []', () => {
    expect(applyBlockWeights([], { rules: 1 })).toEqual([]);
  });
});
