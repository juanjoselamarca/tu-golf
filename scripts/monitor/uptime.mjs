#!/usr/bin/env node
/**
 * scripts/monitor/uptime.mjs — monitor de disponibilidad de Golfers+ con alerta Telegram.
 *
 * Por qué: el 02-oct-2026 la instancia de Supabase se colgó de 19:33 a 23:55 (Chile) y
 * NADIE se enteró en 4 h 20 min: el scorer smoke programado falló sin avisar a nadie y
 * los usuarios lo reportaron a Juanjo. Ver memoria project_incidente_caida_supabase_02oct.
 *
 * Qué revisa (lo mismo que ve un jugador, sin crear datos):
 *   web   — https://golfersplus.vercel.app/login responde 200
 *   db    — PostgREST: select trivial a `courses` con la anon key (pública)
 *   auth  — /auth/v1/health de Supabase
 *
 * Alerta solo en CAMBIOS de estado (caída / vuelta), no en cada chequeo.
 *
 * Modos:
 *   --local   Task Scheduler del PC cada 5 min. Estado en .claude/monitor/state.json.
 *             Avisa la caída tras 2 chequeos fallidos seguidos (10 min) para no alertar por un blip.
 *   --gha     GitHub Actions (respaldo cuando el PC está apagado). El estado anterior es la
 *             conclusión de la corrida anterior del mismo workflow.
 *   --notify "<texto>"  Manda un aviso suelto (lo usa el scorer smoke programado cuando falla).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = 'https://golfersplus.vercel.app';
const TIMEOUT_MS = 15_000;
export const FAILS_TO_ALERT = 2;
const RUNBOOK = 'Runbook: memoria project_incidente_caida_supabase_02oct (health API → logs → restart por Management API).';

async function probe(name, url, init = {}) {
  const t = Date.now();
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    await r.arrayBuffer();
    return { name, ok: r.status >= 200 && r.status < 400, detail: `${r.status} en ${Date.now() - t} ms` };
  } catch (e) {
    return { name, ok: false, detail: e.name === 'TimeoutError' ? `sin respuesta en ${TIMEOUT_MS / 1000} s` : e.message };
  }
}

/** Corre los 3 chequeos en paralelo. → { ok, results } */
export async function checkAll(env = process.env) {
  const sb = env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const results = await Promise.all([
    probe('web', `${SITE}/login`),
    probe('db', `${sb}/rest/v1/courses?select=id&limit=1`, { headers: { apikey: anon, Authorization: `Bearer ${anon}` } }),
    probe('auth', `${sb}/auth/v1/health`, { headers: { apikey: anon } }),
  ]);
  return { ok: results.every(r => r.ok), results };
}

/**
 * Máquina de estados del monitor local (pura).
 * state = { fails, down, downSince } → { state, alert: null | 'down' | 'up' }
 */
export function nextState(state, ok, now) {
  const s = { fails: 0, down: false, downSince: null, ...state };
  if (ok) {
    if (s.down) return { state: { fails: 0, down: false, downSince: null }, alert: 'up', downSince: s.downSince };
    return { state: { ...s, fails: 0 }, alert: null };
  }
  const fails = s.fails + 1;
  const firstFail = s.fails === 0 ? now : s.firstFail;
  if (!s.down && fails >= FAILS_TO_ALERT) {
    return { state: { fails, down: true, downSince: firstFail, firstFail }, alert: 'down' };
  }
  return { state: { ...s, fails, firstFail }, alert: null };
}

const hora = ms => new Date(ms).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Santiago' });

export function downMessage(results, since, source) {
  const lines = results.map(r => `${r.ok ? '✅' : '❌'} ${r.name}: ${r.detail}`);
  return `🔴 Golfers+ CAÍDA (${source})${since ? ` desde ${hora(since)}` : ''}\n${lines.join('\n')}\n\n${RUNBOOK}`;
}

export function upMessage(since, now, source) {
  const min = since ? Math.round((now - since) / 60000) : null;
  return `✅ Golfers+ volvió (${source})${min != null ? ` — estuvo caída ~${min} min` : ''}.`;
}

export async function telegram(text) {
  if (process.env.MONITOR_TEST === '1') text = `[PRUEBA] ${text}`;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !chat) { console.log('⚠ Telegram sin credenciales; aviso solo en consola:\n' + text); return false; }
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text }), signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return (await r.json()).ok === true;
  } catch { return false; }
}

async function runLocal() {
  const stateFile = resolve(dirname(fileURLToPath(import.meta.url)), '../../.claude/monitor/state.json');
  let state = {};
  try { state = JSON.parse(readFileSync(stateFile, 'utf8')); } catch { /* primera corrida */ }
  const now = Date.now();
  const { ok, results } = await checkAll();
  const next = nextState(state, ok, now);
  let sent = true;
  if (next.alert === 'down') sent = await telegram(downMessage(results, next.state.downSince, 'monitor PC'));
  if (next.alert === 'up') sent = await telegram(upMessage(next.downSince, now, 'monitor PC'));
  // Si Telegram falló, no se marca como avisado: se reintenta en el próximo chequeo.
  if (!sent && next.alert === 'down') next.state.down = false;
  if (!sent && next.alert === 'up') next.state.down = true;
  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, JSON.stringify({ ...next.state, lastCheck: new Date(now).toISOString(), last: results }, null, 2));
  console.log(`${new Date(now).toISOString()} ${ok ? 'OK' : 'FALLA'} ${results.map(r => `${r.name}=${r.detail}`).join(' | ')}${next.alert ? ` → aviso ${next.alert}` : ''}`);
}

async function previousRunConclusion() {
  const { GITHUB_REPOSITORY: repo, GITHUB_TOKEN: token, GITHUB_RUN_ID: runId, GITHUB_WORKFLOW_REF: wfRef } = process.env;
  const wfFile = (wfRef || '').split('@')[0].split('/').pop();
  const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${wfFile}/runs?status=completed&per_page=5`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const runs = (await r.json()).workflow_runs || [];
  return runs.find(x => String(x.id) !== String(runId))?.conclusion ?? 'success';
}

async function runGha() {
  const { ok, results } = await checkAll();
  console.log(results.map(r => `${r.ok ? 'OK ' : 'FALLA'} ${r.name}: ${r.detail}`).join('\n'));
  let prev = 'success';
  try { prev = await previousRunConclusion(); } catch (e) { console.log(`⚠ No pude leer la corrida anterior: ${e.message}`); }
  if (!ok && prev === 'success') await telegram(downMessage(results, null, 'monitor GitHub'));
  if (ok && prev === 'failure') await telegram(upMessage(null, Date.now(), 'monitor GitHub'));
  process.exitCode = ok ? 0 : 1; // rojo mientras esté caída: el próximo verde manda el "volvió"
}

if (process.argv[1]?.endsWith('uptime.mjs')) {
  const i = process.argv.indexOf('--notify');
  const run = i > 0 ? () => telegram(process.argv[i + 1] || 'Aviso sin texto')
    : process.argv.includes('--gha') ? runGha : runLocal;
  // 200 ms antes de salir: en Windows, process.exit con fetch abiertos dispara UV_HANDLE_CLOSING.
  run().then(() => setTimeout(() => process.exit(process.exitCode ?? 0), 200));
}
