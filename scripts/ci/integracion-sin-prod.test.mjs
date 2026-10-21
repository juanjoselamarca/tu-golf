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

// Frente 3.4: los E2E de Playwright y el crawler prueban la app levantada en el runner contra la base de pruebas
// (scripts/test-db/e2e-local.mjs). Lo único que va contra el deploy real es el smoke anónimo de páginas públicas.
const jobDe = (yml, id) => {
  const m = yml.match(new RegExp(String.raw`\n  ${id}:\n([\s\S]*?)(?=\n  [\w-]+:\n|$)`));
  if (!m) throw new Error(`no hay job ${id}`);
  return m[1];
};

describe('scorer-smoke.yml no toca prod', () => {
  const yml = sinComentarios(leer('.github/workflows/scorer-smoke.yml'));

  it('no recibe ningún secret de prod ni apunta a la URL de prod', () => {
    expect(yml).not.toMatch(SECRETS_PROD);
    expect(yml).not.toMatch(/wait-prod-turn|golfersplus\.vercel\.app/);
  });

  it('corre Playwright a través de e2e-local.mjs', () => {
    const corridas = yml.split(/\r?\n/).filter((l) => /^\s*run:/.test(l) && /playwright|\.spec\./.test(l) && !/install/.test(l));
    expect(corridas.length).toBeGreaterThan(0);
    for (const l of corridas) expect(l, l.trim()).toMatch(/scripts\/test-db\/e2e-local\.mjs -- /);
  });

  it('discrimina: un secret de prod se detecta', () => {
    expect(yml.replace('secrets.TEST_SUPABASE_URL', 'secrets.SUPABASE_SERVICE_ROLE_KEY')).toMatch(SECRETS_PROD);
  });
});

describe('qa-crawler.yml no toca prod', () => {
  const yml = sinComentarios(leer('.github/workflows/qa-crawler.yml'));

  it('no recibe ningún secret de prod ni apunta a la URL de prod', () => {
    expect(yml).not.toMatch(SECRETS_PROD);
    expect(yml).not.toMatch(/wait-prod-turn|golfersplus\.vercel\.app|CRAWL_BASE_URL|--base/);
  });

  const corridasDelCrawler = (y) => ({
    total: (y.match(/qa-crawler\.mjs/g) ?? []).length,
    viaE2eLocal: (y.match(/node scripts\/test-db\/e2e-local\.mjs --comando --\s+node scripts\/qa-crawler\.mjs/g) ?? []).length,
  });

  it('cada corrida del crawler pasa por e2e-local.mjs', () => {
    const { total, viaE2eLocal } = corridasDelCrawler(yml);
    expect(total).toBeGreaterThan(0);
    expect(viaE2eLocal).toBe(total);
  });

  it('discrimina: una corrida directa del crawler (iría al default de prod) se detecta', () => {
    const { total, viaE2eLocal } = corridasDelCrawler(`${yml}\n      - run: node scripts/qa-crawler.mjs --mode=readonly\n`);
    expect(viaE2eLocal).toBeLessThan(total);
  });
});

describe('ci.yml: el smoke contra el deploy real es anónimo', () => {
  const job = jobDe(sinComentarios(leer('.github/workflows/ci.yml')), 'e2e-smoke');

  it('no recibe el usuario E2E de prod y sólo corre el smoke de páginas públicas', () => {
    expect(job).not.toMatch(/secrets\.E2E_USER_(EMAIL|PASSWORD)\b/);
    expect(job).not.toMatch(/npx playwright test/);
    expect(job).toMatch(/run: npm run test:e2e:smoke/);
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
