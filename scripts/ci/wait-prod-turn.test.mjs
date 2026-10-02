import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  blockingJobs, inProdStretch, PROD_JOB_NAMES, EXEMPT_WORKFLOWS, TURN_STEP_NAME, MAX_WAIT_MIN,
} from './wait-prod-turn.mjs';

const T = (min) => new Date(Date.UTC(2026, 9, 2, 12, min)).toISOString();
const steps = (turn, prod) => [
  { name: 'Install dependencies', status: 'completed' },
  { name: TURN_STEP_NAME, status: turn },
  { name: 'Run tests', status: prod },
  { name: 'Upload', status: 'queued' },
];
const job = (o) => ({ name: 'Playwright scorer smoke', status: 'in_progress', run_id: 1, id: 10, started_at: T(0), steps: steps('completed', 'in_progress'), ...o });
const ME = { id: 50, run_id: 5, started_at: T(5) };

describe('turno de CI contra prod', () => {
  it('espera a un job de prod que empezó antes y está en su tramo de prod', () => {
    expect(blockingJobs(ME, [job()])).toHaveLength(1);
  });
  it('el que empezó primero nunca espera (sin espera circular)', () => {
    expect(blockingJobs({ ...ME, started_at: T(0), id: 1 }, [job({ started_at: T(3), id: 99 })])).toEqual([]);
  });
  it('job con `needs:` que arranca tarde (run_id menor) NO se salta la fila', () => {
    // E2E smoke de ci.yml: run más viejo, pero empezó DESPUÉS que yo → yo no lo espero, él me espera a mí.
    const lateNeeds = job({ name: 'E2E smoke (producción)', run_id: 1, id: 900, started_at: T(9) });
    expect(blockingJobs(ME, [lateNeeds])).toEqual([]);
    expect(blockingJobs({ ...lateNeeds }, [job({ run_id: 5, id: 50, started_at: T(5) })])).toHaveLength(1);
  });
  it('re-run de una corrida vieja también espera por hora de inicio', () => {
    const rerun = { id: 999, run_id: 1, started_at: T(20) };
    expect(blockingJobs(rerun, [job({ run_id: 7, id: 70, started_at: T(15) })])).toHaveLength(1);
  });
  it('desempate por id cuando empezaron en el mismo segundo', () => {
    expect(blockingJobs({ ...ME, started_at: T(0), id: 20 }, [job({ started_at: T(0), id: 10 })])).toHaveLength(1);
    expect(blockingJobs({ ...ME, started_at: T(0), id: 5 }, [job({ started_at: T(0), id: 10 })])).toEqual([]);
  });
  it('no espera a jobs que ya pasaron su tramo de prod (subiendo artifacts, etc.)', () => {
    expect(blockingJobs(ME, [job({ steps: steps('completed', 'completed') })])).toEqual([]);
  });
  it('sí espera a uno que empezó antes y todavía está esperando su turno (orden de llegada)', () => {
    expect(blockingJobs(ME, [job({ steps: steps('in_progress', 'queued') })])).toHaveLength(1);
  });
  it('no espera a jobs que no tocan prod, ni terminados, ni a sí mismo', () => {
    expect(blockingJobs(ME, [
      job({ name: 'Verificación (tsc + tests + build)' }),
      job({ status: 'completed' }),
      job({ id: 50 }),
    ])).toEqual([]);
  });
  it('job de prod sin paso de turno: se trata como en tramo de prod (conservador)', () => {
    expect(inProdStretch({ steps: [{ name: 'x', status: 'completed' }] })).toBe(true);
  });
});

describe('cobertura del turno en los workflows', () => {
  const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../../.github/workflows');
  const files = readdirSync(dir).filter(f => f.endsWith('.yml'));
  const text = Object.fromEntries(files.map(f => [f, readFileSync(resolve(dir, f), 'utf8')]));
  // Uso REAL de secrets de prod (no comentarios).
  const usesProd = t => t.split('\n').some(l => !l.trim().startsWith('#') && /secrets\.(SUPABASE_SERVICE_ROLE_KEY|E2E_USER_EMAIL|NEXT_PUBLIC_SUPABASE_URL)\b/.test(l));
  const callsTurn = t => /run: node scripts\/ci\/wait-prod-turn\.mjs/.test(t);

  it('todo workflow que usa secrets de prod llama al turno o está exento con motivo', () => {
    for (const f of files) {
      if (!usesProd(text[f])) continue;
      expect(callsTurn(text[f]) || f in EXEMPT_WORKFLOWS, `${f} usa secrets de prod y no llama al turno`).toBe(true);
    }
  });

  it('cada job de la lista existe y su timeout deja ≥ 8 min de trabajo además de la espera', () => {
    const all = Object.values(text).join('\n');
    for (const name of PROD_JOB_NAMES) {
      const f = files.find(x => text[x].includes(`name: ${name}\n`) || text[x].includes(`name: ${name}\r\n`));
      expect(f, `no encuentro el job "${name}"`).toBeTruthy();
      const t = text[f];
      const at = t.indexOf(`name: ${name}`);
      const m = t.slice(at, at + 600).match(/timeout-minutes:\s*(\d+)/);
      expect(Number(m?.[1]), `${f} → ${name}`).toBeGreaterThanOrEqual(MAX_WAIT_MIN + 8);
    }
    expect((all.match(/run: node scripts\/ci\/wait-prod-turn\.mjs/g) || []).length).toBe(PROD_JOB_NAMES.length);
  });

  it('toda exención corresponde a un workflow que de verdad usa secrets de prod (sin exenciones muertas)', () => {
    for (const f of Object.keys(EXEMPT_WORKFLOWS)) expect(usesProd(text[f] || ''), `exención muerta: ${f}`).toBe(true);
  });

  it('el paso inmediatamente siguiente al turno es el que golpea prod (inProdStretch depende de eso)', () => {
    for (const f of files) {
      const lines = text[f].split(/\r?\n/);
      lines.forEach((l, i) => {
        if (!l.includes(`- name: ${TURN_STEP_NAME}`)) return;
        const rest = lines.slice(i + 1);
        const next = rest.findIndex(x => /^\s*- name:/.test(x));
        const end = rest.findIndex((x, k) => k > next && /^\s*- name:/.test(x));
        const block = rest.slice(next, end < 0 ? undefined : end).join(' ');
        expect(block, `${f}: el paso tras el turno no corre tests contra prod`).toMatch(/run:.*(playwright|vitest|test:integration|test:e2e|crawler)|run: >/);
      });
    }
  });

  it('el paso del turno se llama exactamente TURN_STEP_NAME', () => {
    const all = Object.values(text).join('\n');
    expect((all.match(new RegExp(`- name: ${TURN_STEP_NAME.replace(/[()]/g, '\\$&')}`, 'g')) || []).length).toBe(PROD_JOB_NAMES.length);
  });
});
