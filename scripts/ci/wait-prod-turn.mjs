#!/usr/bin/env node
/**
 * scripts/ci/wait-prod-turn.mjs — "turno" para los jobs de CI que golpean la BD de PRODUCCIÓN.
 *
 * Por qué (medido 02-oct-2026): Supabase está en el plan free (compute compartido).
 * Con la suite de integración corriendo, la latencia de prod sube de p95 0,26 s a 1,1 s
 * con picos de 9,7 s; el 02-oct a las 02:05 corrían 8 suites a la vez, un select trivial
 * tardó 10-68 s y el login falló. Un jugador real durante un merge sufría lo mismo.
 *
 * Regla: espero a todo job de prod que EMPEZÓ antes que yo (started_at; desempate por id)
 * y que todavía no terminó su tramo de prod (el paso que sigue al turno). El que empezó
 * primero nunca espera a nadie → no hay espera circular. Ordenar por hora de inicio (y no
 * por run_id) cubre los jobs con `needs:` que arrancan tarde y los re-runs de corridas
 * viejas (hallazgo Fable 02-oct). A diferencia de `concurrency:` de GitHub, no cancela
 * checks pendientes. Si algo queda colgado, a los MAX_WAIT_MIN sigue con un aviso
 * (fail-open: el turno protege prod, no debe trabar el CI).
 */

// Nombres (`name:`) de los jobs que tocan prod. Fuente única: el test exige que todo
// workflow con secrets de prod llame al turno o esté en EXEMPT_WORKFLOWS con su motivo.
export const PROD_JOB_NAMES = [
  'Motor de golf vs Supabase prod',
  'Vitest catalogo canary (rating coherente con el par)',
  'Vitest import canary (schema real)',
  'Playwright scorer smoke',
  'E2E smoke (producción)',
  'Playwright auth suite',
  'Playwright E2E',
  'Crawler de botones (readonly)',
];

// Workflows que usan secrets de prod sin tocar la BD (motivo obligatorio). Hoy ninguno:
// coach-exam.yml solo nombra los secrets en un comentario y el test ya lo ignora.
export const EXEMPT_WORKFLOWS = {};

export const TURN_STEP_NAME = 'Esperar turno de prod (no saturar la BD con suites en paralelo)';

const POLL_MS = 20_000;
// Cada job trabaja 1-3 min contra la BD: 12 min cubre una cola de ~5 jobs.
// Los timeout-minutes de los jobs de prod dejan ≥ 8 min además de esta espera (lo verifica el test).
export const MAX_WAIT_MIN = 12;
const MAX_WAIT_MS = MAX_WAIT_MIN * 60_000;

const startedBefore = (a, b) => {
  const ta = Date.parse(a.started_at);
  const tb = Date.parse(b.started_at);
  return ta < tb || (ta === tb && Number(a.id) < Number(b.id));
};

/** ¿Este job sigue en su tramo de prod (esperando turno o corriendo el paso de prod)? */
export function inProdStretch(job) {
  const steps = job.steps || [];
  const i = steps.findIndex(s => s.name === TURN_STEP_NAME);
  if (i < 0) return true; // sin el paso de turno: conservador
  const prodStep = steps[i + 1];
  return !(prodStep && prodStep.status === 'completed');
}

/** Jobs por los que tengo que esperar. Puro. */
export function blockingJobs(me, jobs) {
  return jobs.filter(j =>
    PROD_JOB_NAMES.includes(j.name)
    && j.status === 'in_progress'
    && Number(j.id) !== Number(me.id)
    && startedBefore(j, me)
    && inProdStretch(j));
}

async function gh(path) {
  const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}${path}`, {
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} en ${path}`);
  return res.json();
}

/** Jobs de todas las corridas en curso (incluida la mía). */
async function inProgressJobs() {
  // per_page=100 sin paginar: el repo nunca tiene >100 corridas en curso a la vez.
  const { workflow_runs: runs = [] } = await gh('/actions/runs?status=in_progress&per_page=100');
  const jobs = [];
  for (const r of runs) {
    const { jobs: list = [] } = await gh(`/actions/runs/${r.id}/jobs?filter=latest&per_page=100`);
    jobs.push(...list);
  }
  return jobs;
}

/** Mi propio job: el de mi corrida que corre en mi runner. */
function findMe(jobs) {
  const runId = Number(process.env.GITHUB_RUN_ID);
  const runner = process.env.RUNNER_NAME;
  return jobs.find(j => Number(j.run_id) === runId && j.status === 'in_progress' && j.runner_name === runner)
    // Sin identificarme: me trato como el último en llegar (espero a todos los anteriores).
    || { id: Number.MAX_SAFE_INTEGER, started_at: new Date().toISOString() };
}

async function main() {
  if (!process.env.GITHUB_RUN_ID || !process.env.GITHUB_TOKEN) {
    console.log('Turno de prod: fuera de GitHub Actions, no se espera.');
    return;
  }
  const start = Date.now();
  let me = null;
  for (;;) {
    let blocking;
    try {
      const jobs = await inProgressJobs();
      me = me || findMe(jobs);
      blocking = blockingJobs(me, jobs);
    } catch (e) {
      console.log(`::warning::Turno de prod: no pude consultar la API (${e.message}). Sigo sin esperar.`);
      return;
    }
    const who = () => blocking.map(j => `${j.name} (run ${j.run_id})`).join(', ');
    if (blocking.length === 0) {
      console.log(`Turno de prod: libre${Date.now() - start > 1000 ? ` tras ${Math.round((Date.now() - start) / 1000)} s` : ''}.`);
      return;
    }
    if (Date.now() - start > MAX_WAIT_MS) {
      console.log(`::warning::Turno de prod: llevo ${MAX_WAIT_MIN} min esperando a ${who()}. Sigo igual.`);
      return;
    }
    console.log(`Turno de prod: espero a ${who()}...`);
    await new Promise(r => setTimeout(r, POLL_MS));
  }
}

if (process.argv[1]?.endsWith('wait-prod-turn.mjs')) {
  // 200 ms antes de salir: en Windows, process.exit con fetch abiertos dispara UV_HANDLE_CLOSING.
  main().then(() => setTimeout(() => process.exit(0), 200));
}
