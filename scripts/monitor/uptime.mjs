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
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { sendNew } from '../ceo/telegram.mjs';
import { projectRefDe } from '../lib/supabase-ref.mjs';

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
    return { name, ok: r.status >= 200 && r.status < 400, status: r.status, detail: `${r.status} en ${Date.now() - t} ms` };
  } catch (e) {
    return { name, ok: false, status: 0, detail: e.name === 'TimeoutError' ? `sin respuesta en ${TIMEOUT_MS / 1000} s` : e.message };
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
 * que el monitor lo hace solo, con salvaguardas contra un reinicio injustificado o en bucle:
 *   - la caída ya está confirmada (FAILS_TO_ALERT chequeos seguidos);
 *   - falla db o auth y la falla es de base COLGADA (timeout, red o ≥500). Un 4xx es la base respondiendo
 *     (RLS, key vencida): reiniciar no lo arregla;
 *   - la web SÍ responde: si tampoco responde, lo más probable es que el PC perdió internet;
 *   - la API de Supabase no dice que la base está sana ni que ya está reiniciando/levantando;
 *   - como máximo un reinicio cada RESTART_COOLDOWN_MS y MAX_REINICIOS_POR_CAIDA por caída; después se escala
 *     a acción manual (un reinicio que no la levanta no se repite para siempre);
 *   - el estado (`lastRestart`) se guarda ANTES de reiniciar: si no se puede guardar, no se reinicia
 *     (sin estado persistido, el próximo chequeo volvería a reiniciar encima del primero).
 */
export const RESTART_COOLDOWN_MS = 60 * 60_000;
export const MAX_REINICIOS_POR_CAIDA = 2;
// Tras un reinicio la base tarda ~5-6 min en volver: antes de este plazo no se escala ni se reintenta.
export const GRACIA_TRAS_REINICIO_MS = 10 * 60_000;
// `/health?services=db` solo emite COMING_UP | ACTIVE_HEALTHY | UNHEALTHY: COMING_UP = ya está levantando.
export const ESTADOS_EN_TRANSICION = ['COMING_UP'];

const colgada = r => r && r.ok === false && (r.status === 0 || r.status >= 500);

/** Pura → testeable. apiDb = { healthy, status } de la health API de Supabase, o null si no se pudo leer. */
export function debeReiniciar({ down, results, apiDb, lastRestart, reinicios = 0, now }) {
  if (!down) return { reiniciar: false, motivo: 'arriba' };
  const por = n => results.find(r => r.name === n);
  if (!colgada(por('db')) && !colgada(por('auth'))) {
    const falla4xx = [por('db'), por('auth')].some(r => r?.ok === false);
    return { reiniciar: false, motivo: falla4xx ? 'la base responde 4xx: no está colgada, reiniciar no lo arregla' : 'falla solo la web (Vercel), no la base' };
  }
  if (por('web')?.ok === false) return { reiniciar: false, motivo: 'la web tampoco responde: probable falta de internet del PC' };
  // Sin confirmación de Supabase no se reinicia a ciegas: un corte parcial de red del PC (Vercel sí, Supabase no)
  // tumbaría prod ~6 min por nada (hallazgo del diagnóstico automático, 03-oct). El 02-oct la health API SÍ
  // respondía (db no sana), así que la caída real se sigue cubriendo.
  if (apiDb == null) return { reiniciar: false, motivo: 'no pude confirmar con la API de Supabase: no reinicio a ciegas' };
  if (apiDb.healthy === true) return { reiniciar: false, motivo: 'la API de Supabase dice que la base está sana' };
  if (apiDb?.status && ESTADOS_EN_TRANSICION.includes(apiDb.status)) return { reiniciar: false, motivo: `Supabase ya la está levantando (${apiDb.status})` };
  const desdeUltimo = typeof lastRestart === 'number' ? now - lastRestart : Infinity;
  if (desdeUltimo < GRACIA_TRAS_REINICIO_MS) return { reiniciar: false, motivo: 'esperando que el último reinicio levante' };
  if (reinicios >= MAX_REINICIOS_POR_CAIDA) return { reiniciar: false, motivo: 'escalar', escalar: true };
  if (desdeUltimo < RESTART_COOLDOWN_MS) return { reiniciar: false, motivo: 'ya se reinició hace menos de 1 h' };
  return { reiniciar: true, motivo: 'base colgada confirmada' };
}

/**
 * Ejecuta la decisión con dependencias inyectadas (testeable): guardar ANTES de reiniciar, avisos honestos.
 * → { lastRestart, reinicios, escalado } para el estado.
 */
export async function aplicarReinicio({ decision, estado, now, guardar, reiniciar, avisar }) {
  const { lastRestart = null, reinicios = 0, escalado = false } = estado;
  if (decision.escalar) {
    // escalado solo queda en true si el aviso salió: si Telegram falla, se reintenta en el próximo chequeo.
    if (escalado) return { lastRestart, reinicios, escalado };
    const salio = await avisar(`🆘 Golfers+: la base sigue sin responder después de ${reinicios} intentos de reinicio automático. Necesita acción manual.\n${RUNBOOK}`);
    return { lastRestart, reinicios, escalado: salio === true };
  }
  if (!decision.reiniciar) return { lastRestart, reinicios, escalado };
  const nuevo = { lastRestart: now, reinicios: reinicios + 1, escalado };
  if (!guardar(nuevo)) {
    await avisar(`⚠️ Golfers+: la base no responde y NO la reinicié: no pude guardar el estado del monitor (reiniciar sin estado puede encadenar reinicios). Hazlo a mano.\n${RUNBOOK}`);
    return { lastRestart, reinicios, escalado };
  }
  // lastRestart queda en `now` aunque el POST falle: un timeout puede haber disparado el reinicio igual.
  const res = await reiniciar();
  await avisar(res.ok
    ? `🔧 Golfers+: la base no respondía y la reinicié automáticamente (${res.texto}). Te aviso cuando vuelva.`
    : `❌ Golfers+: la base no responde y el reinicio automático falló (${res.texto}). Necesita acción manual.\n${RUNBOOK}`)
  return nuevo;
}

/** Salud de la base según la API de Supabase → { healthy, status } o null si no se pudo consultar. */
async function apiSaludDb(env = process.env) {
  const ref = projectRefDe(env.NEXT_PUBLIC_SUPABASE_URL);
  if (!env.SUPABASE_ACCESS_TOKEN || !ref) return null;
  try {
    const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/health?services=db`, {
      headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` }, signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) return null;
    const db = (await r.json()).find?.(s => s.name === 'db');
    return db ? { healthy: db.healthy === true, status: db.status ?? null } : null;
  } catch { return null; }
}

/** Reinicia la instancia por la Management API → { ok, texto }. */
async function reiniciarBase(env = process.env) {
  const ref = projectRefDe(env.NEXT_PUBLIC_SUPABASE_URL);
  if (!env.SUPABASE_ACCESS_TOKEN || !ref) return { ok: false, texto: 'falta SUPABASE_ACCESS_TOKEN o la URL de Supabase' };
  try {
    const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/restart`, {
      method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` }, signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return r.ok ? { ok: true, texto: `HTTP ${r.status}, vuelve en ~5 min` } : { ok: false, texto: `HTTP ${r.status}` };
  } catch (e) { return { ok: false, texto: e.message }; }
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

function guardarEstado(file, obj) {
  try {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(obj, null, 2));
    renameSync(tmp, file);
    return true;
  } catch (e) {
    console.log(`⚠ No pude guardar el estado (${e.message}).`);
    return false;
  }
}

/**
 * Diagnóstico automático (scripts/monitor/incidente.mjs): sesión de Claude de solo lectura que explica la causa y
 * la deja en Telegram y en la memoria. Proceso desacoplado: el monitor termina su ciclo sin esperarlo (la tarea
 * tiene límite de 2 min; el diagnóstico tarda varios). Antes deja qué chequeo falló y cómo, para que el diagnóstico
 * no tenga que adivinarlo. Un solo diagnóstico por caída (lock en incidente.mjs).
 */
function lanzarDiagnostico({ results, downSince }) {
  try {
    const base = join(process.env.LOCALAPPDATA ?? join(homedir(), '.golfersplus'), 'GolfersPlus', 'incidentes');
    mkdirSync(base, { recursive: true });
    writeFileSync(join(base, 'ultimo-chequeo.json'), JSON.stringify({ detectada: new Date().toISOString(), desde: downSince ? new Date(downSince).toISOString() : null, chequeos: results }, null, 2));
    const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
    const hijo = spawn(process.execPath, ['--env-file=.env.local', 'scripts/monitor/incidente.mjs'], { cwd: repo, detached: true, stdio: 'ignore', windowsHide: true });
    hijo.unref();
    console.log('diagnóstico automático lanzado');
  } catch (e) {
    console.log(`⚠ No pude lanzar el diagnóstico automático (${e.message}).`);
  }
}

async function runLocal() {
  const file = stateFile();
  let raw = {};
  try { raw = JSON.parse(readFileSync(file, 'utf8')); } catch { /* primera corrida o archivo corrupto */ }
  const now = Date.now();
  const { ok, results } = await checkAll();
  const next = nextState(raw, ok, now);
  let sent = true;
  if (next.alert === 'down') {
    sent = await telegram(downMessage(results, next.state.downSince, 'monitor PC'));
    lanzarDiagnostico({ results, downSince: next.state.downSince });
  }
  if (next.alert === 'up') sent = await telegram(upMessage(next.downSince, now, 'monitor PC'));
  const state = afterSend(next, sent);
  const base = { ...state, lastCheck: new Date(now).toISOString(), last: results };
  // Auto-recuperación (ver debeReiniciar / aplicarReinicio). Los contadores son por caída: se reinician al volver.
  let rein = next.state.down
    ? { lastRestart: typeof raw?.lastRestart === 'number' ? raw.lastRestart : null, reinicios: Number.isInteger(raw?.reinicios) ? raw.reinicios : 0, escalado: raw?.escalado === true }
    : { lastRestart: typeof raw?.lastRestart === 'number' ? raw.lastRestart : null, reinicios: 0, escalado: false };
  if (next.state.down) {
    const decision = debeReiniciar({ down: true, results, apiDb: await apiSaludDb(), lastRestart: rein.lastRestart, reinicios: rein.reinicios, now });
    console.log(`auto-reinicio: ${decision.reiniciar ? 'SÍ' : 'no'} (${decision.motivo})`);
    rein = await aplicarReinicio({
      decision, estado: rein, now,
      guardar: r => guardarEstado(file, { ...base, ...r }),
      reiniciar: () => reiniciarBase(),
      avisar: texto => telegram(texto),
    });
  }
  guardarEstado(file, { ...base, ...rein });
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
