#!/usr/bin/env node
/**
 * scripts/ceo-autonomo.mjs — CEO Autónomo v4: agentes nocturnos de Claude Code.
 *
 * "Trabaja hasta que se acabe el cupo y después retoma." La lógica vive en
 * scripts/ceo/ (night.mjs orquesta; quota, failure, state, runner, windows,
 * worktree, sql-proxy, telegram, coverage, auth). Este archivo solo carga el
 * entorno y despacha la orden.
 *
 * Plan y decisiones: docs/superpowers/plans/2026-10-01-scheduler-nocturno-v4.md
 *
 * Task Scheduler (scripts/setup-ceo-task.bat):
 *   23:30  --warmup     refresca el token OAuth
 *   00:00  --night      abre la noche: preflight de cupo + cola de agentes
 *   (auto) --night      tarea GolfersPlus-CEO-Resume (WakeToRun) al renovarse el cupo
 *   08:00  --watchdog   relanza una vez si el scheduler murió; reenvía avisos
 *   12:00  --watchdog
 *
 * Uso manual:
 *   node scripts/ceo-autonomo.mjs --night       # corre/retoma la noche ahora
 *   node scripts/ceo-autonomo.mjs --status      # estado de la noche activa
 *   node scripts/ceo-autonomo.mjs --quota       # lee el cupo (llamada Haiku de ~6 s)
 *   node scripts/ceo-autonomo.mjs --dry-run     # agentes configurados
 *   Pausa inmediata sin deploy: crear .claude/ceo-locks/PAUSE
 */

import { readFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNightRunner, localDate } from './ceo/night.mjs';
import { checkAuth, refreshTokenDirect } from './ceo/auth.mjs';
import { probeQuota, weeklyCeiling, pct, DEFAULT_DAILY_USE } from './ceo/quota.mjs';
import { sendNew } from './ceo/telegram.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..');
const LOGS_DIR = process.env.CEO_LOGS_DIR || resolve(REPO_ROOT, '.claude/ceo-logs');
const LOCKS_DIR = process.env.CEO_LOCKS_DIR || resolve(REPO_ROOT, '.claude/ceo-locks');
const PROMPTS_DIR = process.env.CEO_PROMPTS_DIR || resolve(REPO_ROOT, 'scripts/ceo-prompts');

// Node en Windows crashea con "UV_HANDLE_CLOSING" si sale con handles de fetch abiertos.
async function safeExit(code) {
  await new Promise(r => setTimeout(r, 200));
  process.exit(code);
}

function fatalLog(msg) {
  try {
    mkdirSync(LOGS_DIR, { recursive: true });
    appendFileSync(resolve(LOGS_DIR, `${localDate(Date.now())}-scheduler.log`), `[${new Date().toLocaleTimeString('es-CL')}] ${msg}\n`);
  } catch { /* último recurso: consola */ }
  console.error(msg);
}
process.on('unhandledRejection', err => fatalLog(`🔴 unhandledRejection: ${err?.stack || err}`));
process.on('uncaughtException', err => { fatalLog(`🔴 uncaughtException: ${err?.stack || err}`); process.exit(1); });

// .env.local (sin pisar variables ya definidas)
const envPath = resolve(REPO_ROOT, '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// Orden = criticidad + dependencias: seguridad → bugs → visual → tests.
// timeout = por intento (el tiempo esperando un reset de cupo no cuenta).
const AGENTS = [
  { name: 'data-quality',    prefix: 'fix',  timeout: 90, maxTurns: 500 },
  { name: 'dead-end-hunter', prefix: 'feat', timeout: 90, maxTurns: 500 },
  { name: 'qa-design',       prefix: 'fix',  timeout: 90, maxTurns: 500 },
  { name: 'e2e-writer',      prefix: 'feat', timeout: 90, maxTurns: 500 },
  { name: 'resumen-ceo',     prefix: null,   timeout: 30, maxTurns: 40 },
];

const runner = createNightRunner({
  repoRoot: REPO_ROOT,
  logsDir: LOGS_DIR,
  locksDir: LOCKS_DIR,
  promptsDir: PROMPTS_DIR,
  scriptPath: __filename,
  agents: AGENTS,
  refreshAuth: () => checkAuth(m => runner.log(m)),
});

const args = process.argv.slice(2);
mkdirSync(LOGS_DIR, { recursive: true });

if (args.includes('--night')) {
  await runner.runNight();
  await safeExit(0);
}

if (args.includes('--watchdog') || args.includes('--deadman')) {
  await runner.runWatchdog();
  await safeExit(0);
}

if (args.includes('--warmup')) {
  runner.log('Token warmup: refrescando OAuth...');
  if (await refreshTokenDirect(m => runner.log(m))) runner.log('✓ Token warmup OK.');
  else await sendNew('⚠️ CEO Autónomo — no pude refrescar el token OAuth. Los agentes de esta noche pueden fallar. Abre Claude Code y corre /login.', m => runner.log(m));
  await safeExit(0);
}

if (args.includes('--status')) {
  console.log(runner.status());
  await safeExit(0);
}

if (args.includes('--quota')) {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  const q = probeQuota({ env, cwd: REPO_ROOT });
  const ceiling = weeklyCeiling({ now: Date.now(), sevenResetsAt: q.seven.resetsAt, dailyUse: DEFAULT_DAILY_USE });
  console.log(`5 h:     ${pct(q.five.utilization)} (${q.five.status ?? '?'}) · se renueva ${q.five.resetsAt ? new Date(q.five.resetsAt).toLocaleString('es-CL') : '?'}`);
  console.log(`Semanal: ${pct(q.seven.utilization)} · se renueva ${q.seven.resetsAt ? new Date(q.seven.resetsAt).toLocaleString('es-CL') : '?'} · techo de hoy ${pct(ceiling)}`);
  if (q.estimated) console.log('(estimado: el CLI no entregó unifiedWindows)');
  await safeExit(0);
}

if (args.includes('--dry-run')) {
  for (const a of AGENTS) {
    const ok = existsSync(resolve(PROMPTS_DIR, `${a.name}.md`));
    console.log(`  ${a.name.padEnd(18)} timeout ${a.timeout}m  turnos ${a.maxTurns}  ${ok ? '✓' : '✘ SIN PROMPT'}`);
  }
  await safeExit(0);
}

if (args.includes('--now')) {
  console.error('--now ya no existe en v4: usa --night (respeta el candado, el cupo y la cola).');
  await safeExit(1);
}

console.log(`CEO Autónomo v4 — uso:
  --night      corre o retoma la noche (cola persistente)
  --watchdog   verifica que la noche siga viva; relanza una vez si murió
  --warmup     refresca el token OAuth
  --status     estado de la noche activa
  --quota      lee el cupo actual del plan
  --dry-run    agentes configurados
Pausa: crear .claude/ceo-locks/PAUSE`);
