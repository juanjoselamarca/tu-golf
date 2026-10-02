import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blockingJobs, PROD_JOB_NAMES } from './wait-prod-turn.mjs';

const job = (name, run_id, status = 'in_progress') => ({ name, run_id, status });

describe('turno de CI contra prod', () => {
  it('espera a un job de prod de una corrida anterior en curso', () => {
    expect(blockingJobs(200, [job('Playwright scorer smoke', 100)])).toHaveLength(1);
  });
  it('no espera a corridas posteriores (el de menor id nunca espera: sin deadlock)', () => {
    expect(blockingJobs(100, [job('Playwright scorer smoke', 200)])).toEqual([]);
  });
  it('no espera a jobs que no tocan prod ni a jobs ya terminados o en cola', () => {
    expect(blockingJobs(200, [
      job('Verificación (tsc + tests + build)', 100),
      job('Playwright scorer smoke', 100, 'completed'),
      job('Playwright scorer smoke', 100, 'queued'),
    ])).toEqual([]);
  });

  it('cada job que llama al turno está en la lista (un concepto, una fuente)', () => {
    const wf = name => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../.github/workflows', name), 'utf8');
    const files = ['integracion.yml', 'catalogo-canary.yml', 'import-canary.yml', 'scorer-smoke.yml', 'ci.yml'];
    const all = files.map(wf).join('\n');
    const calls = (all.match(/run: node scripts\/ci\/wait-prod-turn\.mjs/g) || []).length;
    expect(calls).toBe(PROD_JOB_NAMES.length);
    for (const n of PROD_JOB_NAMES) expect(all).toContain(`name: ${n}`);
  });
});

describe('turno de CI: la espera máxima cabe en el timeout de cada job', () => {
  it('cada job de prod tiene timeout-minutes ≥ espera máxima + 8 min de trabajo', async () => {
    const { MAX_WAIT_MIN } = await import('./wait-prod-turn.mjs');
    const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../../.github/workflows');
    for (const f of ['integracion.yml', 'catalogo-canary.yml', 'import-canary.yml', 'scorer-smoke.yml', 'ci.yml']) {
      const txt = readFileSync(resolve(dir, f), 'utf8');
      for (const name of PROD_JOB_NAMES) {
        const at = txt.indexOf(`name: ${name}`);
        if (at < 0) continue;
        const m = txt.slice(at, at + 600).match(/timeout-minutes:\s*(\d+)/);
        expect(Number(m?.[1]), `${f} → ${name}`).toBeGreaterThanOrEqual(MAX_WAIT_MIN + 8);
      }
    }
  });
});
