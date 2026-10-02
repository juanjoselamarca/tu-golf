/**
 * scripts/ceo/state.mjs — estado persistente de la noche (cola de trabajos).
 *
 * Reemplaza el array de eventos `{fecha}--orch-state.json`, donde un error
 * contaba como "ya corrió" (bug: el deadman del 30-sep dijo 4/4 OK con 4 fallas).
 *
 * Estados de un trabajo:
 *   pending → running → ok | failed_real | timeout | stuck
 *                     ↘ paused_limit  (se acabó el cupo de 5 h: se retoma tras el reset)
 *                     ↘ paused_weekly (se acabó el semanal: se retoma la noche siguiente)
 *
 * Las funciones de transición son puras; load/save son la única E/S.
 */

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const RUNNABLE = new Set(['pending', 'paused_limit', 'running']);
export const TERMINAL = new Set(['ok', 'failed_real', 'timeout', 'stuck', 'expired']);
export const MAX_STALLS = 2;          // pausas seguidas sin avance → stuck
export const MAX_CARRY_NIGHTS = 3;    // ramas pausadas más viejas se descartan
export const MAX_WAITS_PER_NIGHT = 6; // red de seguridad contra un bucle de esperas
export const MEANINGFUL_TURNS = 5;    // menos turnos = el límite cortó al arrancar (no es "atasco")

export function jobKey(agent, round) {
  return `r${round}:${agent}`;
}

export function newJob(agent, round, extra = {}) {
  return {
    key: jobKey(agent, round), agent, round, status: 'pending',
    attempts: [], stalls: 0, carriedNights: 0,
    wtPath: null, branch: null, ...extra,
  };
}

export function createNight({ nightId, agents, now, carried = [] }) {
  return {
    version: 4,
    nightId,
    startedAt: new Date(now).toISOString(),
    status: 'running',            // running | waiting | frozen_weekly | done
    resumeAt: null,
    waits: 0,
    watchdogRelaunches: 0,
    roundsPlanned: 1,
    jobs: [...carried, ...agents.map(a => newJob(a, 1))],
    notifications: [],
    lastQuota: null,
    summarySent: false,
    lastTelegramText: null,
  };
}

/** Trabajos de la noche anterior que se retoman esta noche. */
export function carryOver(prevNight) {
  if (!prevNight) return { carried: [], expired: [] };
  const carried = [];
  const expired = [];
  for (const j of prevNight.jobs) {
    if (!['paused_limit', 'paused_weekly', 'running'].includes(j.status)) continue;
    if (!j.wtPath) continue; // nunca arrancó: no hay nada que retomar
    const next = { ...j, carriedNights: (j.carriedNights || 0) + 1, carriedFrom: prevNight.nightId, status: 'paused_limit', key: `carry:${j.key}` };
    if (next.carriedNights > MAX_CARRY_NIGHTS) expired.push(next);
    else carried.push(next);
  }
  return { carried, expired };
}

/** Próximo trabajo a ejecutar (los retomados primero, luego en orden de ronda). */
export function nextJob(night) {
  return night.jobs.find(j => j.status === 'running')
    || night.jobs.find(j => j.status === 'paused_limit' && j.key.startsWith('carry:'))
    || night.jobs.find(j => j.status === 'paused_limit')
    || night.jobs.find(j => j.status === 'pending')
    || null;
}

export function addRound(night, agents, round) {
  night.roundsPlanned = round;
  for (const a of agents) {
    if (!night.jobs.some(j => j.key === jobKey(a, round))) night.jobs.push(newJob(a, round));
  }
}

/**
 * Aplica el resultado de un intento. `progress` = la rama cambió (commits o archivos).
 * Devuelve el estado nuevo del trabajo.
 */
export function applyAttempt(job, { kind, progress, numTurns }) {
  switch (kind) {
    case 'ok': job.status = 'ok'; break;
    case 'timeout': job.status = 'timeout'; break;
    case 'real': job.status = 'failed_real'; break;
    case 'limit_seven': job.status = 'paused_weekly'; break;
    case 'limit_five': {
      const ranMeaningfully = (numTurns ?? 0) >= MEANINGFUL_TURNS;
      if (ranMeaningfully && !progress) job.stalls = (job.stalls || 0) + 1;
      else if (progress) job.stalls = 0;
      job.status = job.stalls >= MAX_STALLS ? 'stuck' : 'paused_limit';
      break;
    }
    default: job.status = 'failed_real';
  }
  return job.status;
}

/** Congela la cola por el semanal: lo empezado queda pausado; lo no empezado, pendiente. */
export function freezeWeekly(night) {
  night.status = 'frozen_weekly';
  for (const j of night.jobs) {
    if (j.status === 'running' || j.status === 'paused_limit') j.status = 'paused_weekly';
  }
}

export function isQueueDone(night) {
  return !night.jobs.some(j => RUNNABLE.has(j.status));
}

export function notify(night, text, { now = Date.now(), kind = 'info' } = {}) {
  const id = `${now}-${night.notifications.length}`;
  night.notifications.push({ id, text, kind, sent: false, at: new Date(now).toISOString() });
  return id;
}

export function summarizeJobs(night) {
  const count = s => night.jobs.filter(j => j.status === s).length;
  return {
    ok: count('ok'), failed: count('failed_real'), timeout: count('timeout'), stuck: count('stuck'),
    pausedWeekly: count('paused_weekly'), pausedLimit: count('paused_limit'), pending: count('pending'),
    total: night.jobs.length,
  };
}

// ─── E/S ──────────────────────────────────────────────────────────────────────

export function loadJson(file, fallback = null) {
  try {
    if (!existsSync(file)) return fallback;
    const data = JSON.parse(readFileSync(file, 'utf8'));
    return data ?? fallback;
  } catch { return fallback; }
}

/** Escritura atómica: un corte a mitad nunca deja un JSON truncado. */
export function saveJson(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, file);
}
