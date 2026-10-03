import { describe, it, expect } from 'vitest';
import { envParaClaude } from '../worktree.mjs';

describe('envParaClaude — entorno de las sesiones claude -p (nocturnos y diagnóstico de caídas)', () => {
  it('quita ANTHROPIC_API_KEY (plan Max, no API) y los tokens de Supabase/Vercel; deja el resto', () => {
    const base = { ANTHROPIC_API_KEY: 'x', SUPABASE_ACCESS_TOKEN: 'y', VERCEL_ACCESS_TOKEN: 'z', OTRA: '1' };
    expect(envParaClaude(base)).toEqual({ OTRA: '1' });
  });
  it('no muta el entorno original', () => {
    const base = { ANTHROPIC_API_KEY: 'x', OTRA: '1' };
    envParaClaude(base);
    expect(base).toEqual({ ANTHROPIC_API_KEY: 'x', OTRA: '1' });
  });
});
