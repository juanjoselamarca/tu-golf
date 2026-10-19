// Canario del frente 3.3 (incidente torneo Los Leones, 04-oct-2026): la integración de cada PR corre contra la
// BASE DE PRUEBAS y hace 0 peticiones a prod. Si alguien vuelve a pasarle un secret de prod a integracion.yml o
// corre un test sin el envoltorio con-base-de-pruebas.mjs, esto se pone rojo antes del merge.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const leer = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const sinComentarios = (t) => t.split(/\r?\n/).filter((l) => !l.trim().startsWith('#')).join('\n');
const SECRETS_PROD = /secrets\.(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ACCESS_TOKEN|E2E_USER_EMAIL|E2E_USER_PASSWORD)\b/;

describe('integracion.yml no toca prod', () => {
  const yml = sinComentarios(leer('.github/workflows/integracion.yml'));

  it('no recibe ningún secret de prod', () => {
    expect(yml).not.toMatch(SECRETS_PROD);
  });

  it('todo paso que corre tests lo hace a través de con-base-de-pruebas.mjs', () => {
    const corridas = yml.split(/\r?\n/).filter((l) => /^\s*run:/.test(l) && /(vitest|test:integration|test:e2e)/.test(l));
    expect(corridas.length).toBeGreaterThan(0);
    for (const l of corridas) expect(l, l.trim()).toMatch(/scripts\/test-db\/con-base-de-pruebas\.mjs -- /);
  });

  it('comparte el grupo de concurrencia con el sync diario de la base de pruebas', () => {
    expect(yml).toMatch(/group:\s*base-de-pruebas/);
    expect(sinComentarios(leer('.github/workflows/test-db-sync.yml'))).toMatch(/group:\s*base-de-pruebas/);
  });

  it('los tests que necesitan prod de verdad viven en src/__tests__/prod y no en integration', () => {
    for (const f of ['coach-e2e', 'catalogo-rating-canary', 'catalogo-escala-rating', 'catalogo-par-por-hoyo.canary', 'privilegios-tablas', 'profiles-privilegios']) {
      expect(existsSync(resolve(ROOT, `src/__tests__/integration/${f}.test.ts`)), f).toBe(false);
      expect(existsSync(resolve(ROOT, `src/__tests__/prod/${f}.test.ts`)), f).toBe(true);
    }
    expect(sinComentarios(leer('.github/workflows/prod-canarios.yml'))).toMatch(/vitest\.mjs run src\/__tests__\/prod\b/);
  });
});

// Frente 3.4: los E2E de Playwright de cada PR prueban la app del PR levantada en el runner contra la base de
// pruebas (scripts/test-db/e2e-local.mjs). El job de prod del mismo workflow (programado / push a main) sigue
// existiendo a propósito y nunca corre en un PR.
const jobDe = (yml, id) => {
  const m = yml.match(new RegExp(String.raw`\n  ${id}:\n([\s\S]*?)(?=\n  [\w-]+:\n|$)`));
  if (!m) throw new Error(`no hay job ${id}`);
  return m[1];
};

describe('scorer-smoke.yml: en un PR no toca prod', () => {
  const yml = sinComentarios(leer('.github/workflows/scorer-smoke.yml'));
  const pr = jobDe(yml, 'smoke-pr');
  const prod = jobDe(yml, 'smoke');

  it('el job del PR corre sólo en pull_request y no recibe ningún secret de prod', () => {
    expect(pr).toMatch(/github\.event_name == 'pull_request'/);
    expect(pr).not.toMatch(SECRETS_PROD);
    expect(pr).not.toMatch(/wait-prod-turn|golfersplus\.vercel\.app/);
  });

  it('el job del PR corre Playwright a través de e2e-local.mjs', () => {
    const corridas = pr.split(/\r?\n/).filter((l) => /^\s*run:/.test(l) && /playwright|\.spec\./.test(l) && !/install/.test(l));
    expect(corridas.length).toBeGreaterThan(0);
    for (const l of corridas) expect(l, l.trim()).toMatch(/scripts\/test-db\/e2e-local\.mjs -- /);
  });

  it('el job de prod nunca corre en un PR', () => {
    expect(prod).toMatch(/if: github\.event_name != 'pull_request'/);
  });

  it('discrimina: un job de PR con secrets de prod se detecta', () => {
    expect(pr.replace('secrets.TEST_SUPABASE_URL', 'secrets.SUPABASE_SERVICE_ROLE_KEY')).toMatch(SECRETS_PROD);
  });
});

describe('e2e-auth-weekly.yml no toca prod', () => {
  const yml = sinComentarios(leer('.github/workflows/e2e-auth-weekly.yml'));

  it('no recibe ningún secret de prod ni apunta a la URL de prod', () => {
    expect(yml).not.toMatch(SECRETS_PROD);
    expect(yml).not.toMatch(/wait-prod-turn|golfersplus\.vercel\.app/);
  });

  it('corre Playwright a través de e2e-local.mjs y comparte el grupo de la base de pruebas', () => {
    expect(yml).toMatch(/run: node scripts\/test-db\/e2e-local\.mjs -- /);
    expect(yml).not.toMatch(/npx playwright test/);
    expect(yml).toMatch(/group:\s*base-de-pruebas/);
  });
});
