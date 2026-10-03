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
 * Avisa solo en CAMBIOS de estado (caída / vuelta) y nunca por un blip aislado:
 *   --local   Task Scheduler del PC cada 5 min. Caída = 2 chequeos fallidos seguidos.
 *             Estado fuera de OneDrive (%LOCALAPPDATA%\GolfersPlus\monitor), escritura atómica.
 *   --gha     GitHub Actions cada 10 min (respaldo con el PC apagado). Caída = falla dos veces
 *             con 25 s de diferencia. Estado = conclusión (success/failure) de la última corrida
 *             terminada; la conclusión significa "caída AVISADA", así un Telegram fallido se reintenta.
 *   --notify "<texto>"  Aviso suelto (lo usa el scorer smoke cuando falla fuera de un PR).
 *
 * Límite conocido del modo --gha (respaldo): si la API de GitHub falla justo en la corrida en que
 * prod vuelve, ese "volvió" se pierde (no hay estado externo). El monitor del PC no tiene ese límite.
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendNew } from '../ceo/telegram.mjs';

const SITE = 'https://golfersplus.vercel.app';
const TIMEOUT_MS = 15_000;
const GHA_RETRY_MS = 25_000;
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

/** Estado leído de disco, saneado campo a campo (un archivo corrupto no puede silenciar la alerta). */
export function sanitizeState(raw) {
  const num = x => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  return {
    fails: Number.isInteger(raw?.fails) && raw.fails >= 0 ? raw.fails : 0,
    down: raw?.down === true,
    downSince: num(raw?.downSince),
    firstFail: num(raw?.firstFail),
  };
}

/**
 * Máquina de estados del monitor local (pura).
 * → { state, alert: null | 'down' | 'up', downSince? }
 */
export function nextState(rawState, ok, now) {
  const s = sanitizeState(rawState);
  if (ok) {
    if (s.down) return { state: { fails: 0, down: false, downSince: null, firstFail: null }, alert: 'up', downSince: s.downSince };
    return { state: { ...s, fails: 0, firstFail: null }, alert: null };
  }
  const fails = s.fails + 1;
  const firstFail = s.fails === 0 || s.firstFail == null ? now : s.firstFail;
  if (!s.down && fails >= FAILS_TO_ALERT) {
    return { state: { fails, down: true, downSince: firstFail, firstFail }, alert: 'down' };
  }
  return { state: { ...s, fails, firstFail }, alert: null };
}

/**
 * Auto-recuperación (03-oct-2026). Juanjo: "no me interesa la alerta si tú no te enteras… te tiene que
 * saltar a ti". El arreglo que funcionó el 02-oct fue reiniciar la instancia por la Management API, así
 * que el monitor lo hace solo, con salvaguardas contra un reinicio injustificado:
 *   - la caída ya está confirmada (FAILS_TO_ALERT chequeos seguidos) y lo que falla es db o auth;
 *   - la web SÍ responde: si tampoco responde, lo más probable es que el PC perdió internet;
 *   - la API de Supabase no dice que la base está sana (si lo dice, el problema es otro);
 *   - como máximo un reinicio cada RESTART_COOLDOWN_MS.
 * Pura → testeable.
 */
export const RESTART_COOLDOWN_MS = 60 * 60_000;
export function debeReiniciar({ down, results, dbSanaSegunApi, lastRestart, now }) {
  if (!down) return { reiniciar: false, motivo: 'arriba' };
  const falla = n => results.find(r => r.name === n)?.ok === false;
  if (!falla('db') && !falla('auth')) return { reiniciar: false, motivo: 'falla solo la web (Vercel), no la base' };
  if (falla('web')) return { reiniciar: false, motivo: 'la web tampoco responde: probable falta de internet del PC' };
  if (dbSanaSegunApi === true) return { reiniciar: false, motivo: 'la API de Supabase dice que la base está sana' };
  if (typeof lastRestart === 'number' && now - lastRestart < RESTART_COOLDOWN_MS) return { reiniciar: false, motivo: 'ya se reinició hace menos de 1 h' };
  return { reiniciar: true, motivo: 'base caída confirmada' };
}

const refDe = url => new URL(url).hostname.split('.')[0];

/** Salud de la base según Supabase. true/false, o null si no se pudo consultar. */
async function dbSanaSegunApi(env = process.env) {
  if (!env.SUPABASE_ACCESS_TOKEN) return null;
  try {
    const r = await fetch(`https://api.supabase.com/v1/projects/${refDe(env.NEXT_PUBLIC_SUPABASE_URL)}/health?services=db`, {
      headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` }, signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j.find?.(s => s.name === 'db')?.healthy === true;
  } catch { return null; }
}

/** Reinicia la instancia por la Management API. → texto con el resultado. */
async function reiniciarBase(env = process.env) {
  if (!env.SUPABASE_ACCESS_TOKEN) return 'sin SUPABASE_ACCESS_TOKEN: no pude reiniciar';
  try {
    const r = await fetch(`https://api.supabase.com/v1/projects/${refDe(env.NEXT_PUBLIC_SUPABASE_URL)}/restart`, {
      method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` }, signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return r.ok ? 'reinicio pedido (vuelve en ~5 min)' : `el reinicio falló: HTTP ${r.status}`;
  } catch (e) { return `el reinicio falló: ${e.message}`; }
}

/** Si el aviso no salió, el estado vuelve atrás para reintentarlo en el próximo chequeo. */
export function afterSend(next, sent) {
  if (sent || !next.alert) return next.state;
  return next.alert === 'down' ? { ...next.state, down: false } : { ...next.state, down: true, downSince: next.downSince };
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

/** Envía por Telegram (fuente única: scripts/ceo/telegram.mjs). → true si salió. */
export async function telegram(text) {
  const body = process.env.MONITOR_TEST === '1' ? `[PRUEBA] ${text}` : text;
  const id = await sendNew(body, msg => console.log(msg));
  if (!id) console.log(`Aviso NO enviado por Telegram:
${body}`);
  return Boolean(id);
}

/** Decisión del modo GitHub (pura). prev = conclusión de la última corrida terminada. */
export function ghaDecision({ ok, prev }) {
  if (!ok && prev !== 'failure') return { alert: 'down' };
  if (ok && prev === 'failure') return { alert: 'up' };
  return { alert: null };
}

/** Código de salida del modo GitHub: la conclusión de la corrida = "caída avisada". */
export function ghaExitCode({ ok, alert, sent }) {
  if (alert === 'down') return sent ? 1 : 0; // no salió el aviso → verde → la próxima lo reintenta
  if (alert === 'up') return sent ? 0 : 1;   // no salió el "volvió" → rojo → la próxima lo reintenta
  return ok ? 0 : 1;
}

function stateFile() {
  const base = process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, 'GolfersPlus', 'monitor')
    : resolve(dirname(fileURLToPath(import.meta.url)), '../../.claude/monitor');
  return join(base, 'state.json');
}

async function runLocal() {
  const file = stateFile();
  let raw = {};
  try { raw = JSON.parse(readFileSync(file, 'utf8')); } catch { /* primera corrida o archivo corrupto */ }
  const now = Date.now();
  const { ok, results } = await checkAll();
  const next = nextState(raw, ok, now);
  let sent = true;
  if (next.alert === 'down') sent = await telegram(downMessage(results, next.state.downSince, 'monitor PC'));
  if (next.alert === 'up') sent = await telegram(upMessage(next.downSince, now, 'monitor PC'));
  const state = afterSend(next, sent);
  // Auto-recuperación: ver debeReiniciar.
  let lastRestart = typeof raw?.lastRestart === 'number' ? raw.lastRestart : null;
  if (next.state.down) {
    const d = debeReiniciar({ down: true, results, dbSanaSegunApi: await dbSanaSegunApi(), lastRestart, now });
    if (d.reiniciar) {
      const res = await reiniciarBase();
      lastRestart = now;
      await telegram(`🔧 Golfers+: la base no respondía y la reinicié automáticamente (${res}). Te aviso cuando vuelva.`);
      console.log(`auto-reinicio: ${res}`);
    } else {
      console.log(`auto-reinicio no: ${d.motivo}`);
    }
  }
  try {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify({ ...state, lastRestart, lastCheck: new Date(now).toISOString(), last: results }, null, 2));
    renameSync(tmp, file);
  } catch (e) {
    console.log(`⚠ No pude guardar el estado (${e.message}).`);
  }
  console.log(`${new Date(now).toISOString()} ${ok ? 'OK' : 'FALLA'} ${results.map(r => `${r.name}=${r.detail}`).join(' | ')}${next.alert ? ` → aviso ${next.alert}${sent ? '' : ' (NO salió; se reintenta)'}` : ''}`);
}

async function previousRunConclusion() {
  const { GITHUB_REPOSITORY: repo, GITHUB_TOKEN: token, GITHUB_RUN_ID: runId, GITHUB_WORKFLOW_REF: wfRef } = process.env;
  const wfFile = (wfRef || '').split('@')[0].split('/').pop();
  const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${wfFile}/runs?status=completed&per_page=20`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`GitHub API ${r.status}`);
  return pickPreviousConclusion((await r.json()).workflow_runs || [], runId);
}

/** Conclusión de la última corrida terminada que no soy yo; ignora canceladas y timeouts. Pura. */
export function pickPreviousConclusion(runs, runId) {
  return runs.find(x => String(x.id) !== String(runId) && ['success', 'failure'].includes(x.conclusion))?.conclusion ?? 'success';
}

async function runGha() {
  let { ok, results } = await checkAll();
  if (!ok) {
    console.log(`Primer chequeo falló (${results.filter(r => !r.ok).map(r => r.name).join(', ')}); repito en ${GHA_RETRY_MS / 1000} s para descartar un blip...`);
    await new Promise(r => setTimeout(r, GHA_RETRY_MS));
    ({ ok, results } = await checkAll());
  }
  console.log(results.map(r => `${r.ok ? 'OK   ' : 'FALLA'} ${r.name}: ${r.detail}`).join('\n'));
  let prev = 'success';
  try { prev = await previousRunConclusion(); } catch (e) { console.log(`::warning::No pude leer la corrida anterior (${e.message}); asumo que estaba arriba. Si estaba caída, el aviso de 'volvió' de esta corrida no va a salir.`); }
  const { alert } = ghaDecision({ ok, prev });
  let sent = true;
  if (alert === 'down') sent = await telegram(downMessage(results, null, 'monitor GitHub'));
  if (alert === 'up') sent = await telegram(upMessage(null, Date.now(), 'monitor GitHub'));
  if (!sent) console.log('::warning::El aviso de Telegram no salió; la próxima corrida lo reintenta.');
  process.exitCode = ghaExitCode({ ok, alert, sent });
}

if (process.argv[1]?.endsWith('uptime.mjs')) {
  const i = process.argv.indexOf('--notify');
  const run = i > 0 ? () => telegram(process.argv[i + 1] || 'Aviso sin texto')
    : process.argv.includes('--gha') ? runGha : runLocal;
  // 200 ms antes de salir: en Windows, process.exit con fetch abiertos dispara UV_HANDLE_CLOSING.
  run().then(() => setTimeout(() => process.exit(process.exitCode ?? 0), 200));
}
