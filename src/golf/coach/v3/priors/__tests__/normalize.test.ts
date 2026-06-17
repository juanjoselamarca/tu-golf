import { describe, it, expect } from 'vitest';
import { normalizeRows } from '../normalize';

describe('normalizeRows', () => {
  it('capa A: acepta fila válida', () => {
    const rows = normalizeRows('A', [
      { handicap_bucket: '10-14', metric_key: 'score_par3', percentile: 50, value: 3.6, sample_size: 5000 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].percentile).toBe(50);
  });

  it('capa A: rechaza percentil fuera de rango', () => {
    expect(() => normalizeRows('A', [
      { handicap_bucket: '10-14', metric_key: 'score_par3', percentile: 150, value: 3.6 },
    ])).toThrow();
  });

  it('capa B: valida que las proporciones de un corte sumen ~1', () => {
    expect(() => normalizeRows('B', [
      { region: 'GLOBAL', gender: 'all', age_bucket: 'all', handicap_bin: '0-4', proportion: 0.3, year: 2024 },
      { region: 'GLOBAL', gender: 'all', age_bucket: 'all', handicap_bin: '5-9', proportion: 0.3, year: 2024 },
    ])).toThrow(/proporciones/);
  });

  it('capa B: acepta corte que suma 1', () => {
    const rows = normalizeRows('B', [
      { region: 'GLOBAL', gender: 'all', age_bucket: 'all', handicap_bin: '0-9', proportion: 0.4, year: 2024 },
      { region: 'GLOBAL', gender: 'all', age_bucket: 'all', handicap_bin: '10+', proportion: 0.6, year: 2024 },
    ]);
    expect(rows).toHaveLength(2);
  });

  it('capa C: genera course_external_id sintético no-NULL para bandas', () => {
    const rows = normalizeRows('C', [
      { region: 'GLOBAL', par: 72, slope_rating: 113, course_rating: 72.0 },
    ]);
    expect(rows[0].course_external_id).toBe('BAND:GLOBAL:72');
  });
});
