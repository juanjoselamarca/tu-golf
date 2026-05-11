import { describe, it, expect } from 'vitest';
import { derivePracticeAction, KNOWN_PATTERNS } from '@/lib/coach/practice-suggestions';

describe('derivePracticeAction', () => {
  it('approach_100_150 mapea a "Driving range — aproximaciones"', () => {
    const r = derivePracticeAction({ pattern_id: 'approach_100_150' });
    expect(r.headline).toMatch(/aproximaciones/i);
    expect(r.headline).toMatch(/driving range/i);
    expect(r.duration_min).toBeGreaterThan(0);
  });

  it('putts_1_2m mapea a putting green', () => {
    const r = derivePracticeAction({ pattern_id: 'putts_1_2m' });
    expect(r.headline).toMatch(/putt/i);
  });

  it('post_bogey_spiral mapea a foco mental', () => {
    const r = derivePracticeAction({ pattern_id: 'post_bogey_spiral' });
    expect(r.headline).toMatch(/mental/i);
  });

  it('driving_dispersion mapea a driving range — dispersión', () => {
    const r = derivePracticeAction({ pattern_id: 'driving_dispersion' });
    expect(r.headline).toMatch(/driving|dispers/i);
  });

  it('putts_from_3m mapea a putting green — distancia', () => {
    const r = derivePracticeAction({ pattern_id: 'putts_from_3m' });
    expect(r.headline).toMatch(/putt/i);
    expect(r.subtitle).toMatch(/3.*5|distancia/i);
  });

  it('pattern_id desconocido devuelve fallback "Sesión libre"', () => {
    const r = derivePracticeAction({ pattern_id: 'unknown_xyz' });
    expect(r.headline).toMatch(/sesión libre/i);
    expect(r.duration_min).toBeGreaterThan(0);
  });

  it('KNOWN_PATTERNS cubre los 5 patrones MVP del spec', () => {
    expect(KNOWN_PATTERNS).toEqual(expect.arrayContaining([
      'approach_100_150',
      'putts_1_2m',
      'post_bogey_spiral',
      'driving_dispersion',
      'putts_from_3m',
    ]));
    expect(KNOWN_PATTERNS).toHaveLength(5);
  });
});
