#!/usr/bin/env node
/**
 * scripts/ci/wait-prod-turn.mjs — "turno" para los jobs de CI que golpean la BD de PRODUCCIÓN.
 *
 * Por qué (medido 02-oct-2026): Supabase está en el plan free (compute compartido).
 * Con la suite de integración corriendo, la latencia de prod sube de p95 0,26 s a 1,1 s
 * con picos de 9,7 s; el 02-oct a las 02:05 corrían 8 suites a la vez y un select trivial
 * tardó 10-68 s y el login falló. Un jugador real durante un merge sufría lo mismo.
 *
 * Cómo: antes de tocar prod, el job espera a que termine cualquier job de prod de una
 * corrida ANTERIOR (run_id menor) que siga en curso. Ordenar por run_id hace imposible el
 * deadlock: el de menor id nunca espera a nadie. A diferencia de `concurrency:` de GitHub,
 * no cancela corridas pendientes (un check cancelado bloquearía el merge).
 * Si algo queda colgado, a los 12 min sigue igual con un aviso (fail-open: el turno
 * protege prod, no debe trabar el CI para siempre).
 */

// Nombres de los jobs que tocan prod (los `name:` de cada workflow). Fuente única.
export const PROD_JOB_NAMES = [
  'Motor de golf vs Supabase prod',
  'Vitest catalogo canary (rating coherente con el par)',
  'Vitest import canary (schema real)',
  'Playwright scorer smoke',
  'E2E smoke (producción)',
];

const POLL_MS = 20_000;
// Cada job de prod trabaja 1-3 min contra la BD: 12 min cubre una cola de ~5 jobs.
// Los timeout-minutes de esos jobs llevan +12 para que la espera no los mate.
export const MAX_WAIT_MIN = 12;
const MAX_WAIT_MS = MAX_WAIT_MIN * 60_000;

/** ¿Hay que esperar? Puro: recibe mi run_id y los jobs en curso de otras corridas. */
export function blockingJobs(myRunId, jobs) {
  return jobs.filter(j =>
    PROD_JOB_NAMES.includes(j.name)
    && j.status === 'in_progress'
    && Number(j.run_id) < Number(myRunId));
}

async function gh(path) {
  const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}${path}`, {
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} en ${path}`);
  return res.json();
}

async function inProgressProdJobs(myRunId) {
  const { workflow_runs: runs = [] } = await gh('/actions/runs?status=in_progress&per_page=100');
  const older = runs.filter(r => r.id < Number(myRunId));
  const jobs = [];
  for (const r of older) {
    const { jobs: list = [] } = await gh(`/actions/runs/${r.id}/jobs?filter=latest&per_page=100`);
    jobs.push(...list);
  }
  return jobs;
}

async function main() {
  const myRunId = process.env.GITHUB_RUN_ID;
  if (!myRunId || !process.env.GITHUB_TOKEN) {
    console.log('Turno de prod: fuera de GitHub Actions, no se espera.');
    return;
  }
  const start = Date.now();
  for (;;) {
    let blocking;
    try {
      blocking = blockingJobs(myRunId, await inProgressProdJobs(myRunId));
    } catch (e) {
      console.log(`::warning::Turno de prod: no pude consultar la API (${e.message}). Sigo sin esperar.`);
      return;
    }
    if (blocking.length === 0) {
      console.log(`Turno de prod: libre${Date.now() - start > 1000 ? ` tras ${Math.round((Date.now() - start) / 1000)} s` : ''}.`);
      return;
    }
    if (Date.now() - start > MAX_WAIT_MS) {
      console.log(`::warning::Turno de prod: llevo ${MAX_WAIT_MIN} min esperando a ${blocking.map(j => `${j.name} (run ${j.run_id})`).join(', ')}. Sigo igual.`);
      return;
    }
    console.log(`Turno de prod: espero a ${blocking.map(j => `${j.name} (run ${j.run_id})`).join(', ')}...`);
    await new Promise(r => setTimeout(r, POLL_MS));
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('wait-prod-turn.mjs')) {
  // 200 ms antes de salir: en Windows, process.exit con fetch abiertos dispara UV_HANDLE_CLOSING.
  main().then(() => setTimeout(() => process.exit(0), 200));
}
