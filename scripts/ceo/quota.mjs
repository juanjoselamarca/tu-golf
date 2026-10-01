/**
 * scripts/ceo/quota.mjs — lectura del cupo del plan Max y decisión de arranque.
 *
 * Fuente: eventos `rate_limit_event` del stream-json de `claude -p`.
 * Desde CLI 2.1.286 cada evento trae `unifiedWindows` con la utilización EXACTA
 * de las dos ventanas (five_hour y seven_day), incluso con uso bajo
 * (medido 01-oct-2026: five 0.53, seven 0.05 con status "allowed").
 * Si el campo no viene (CLI viejo), cae al formato legacy, donde solo hay
 * número sobre el umbral de aviso (five ≥0.90, seven ≥~0.56). En ese caso la
 * lectura se marca `estimated: true` y se informa así.
 *
 * Funciones puras salvo `probeQuota` (lanza una llamada Haiku de ~6 s, ~US$0,03).
 */

import { spawnSync } from 'node:child_process';

export const WAIT_MARGIN_MS = 3 * 60 * 1000;      // margen tras resetsAt
export const ROUND_COST_WEEKLY = 0.08;            // una ronda de 4 agentes: 5-8 % semanal (medido 24 y 26-sep)
export const DEFAULT_DAILY_USE = 0.08;            // uso diurno de Juanjo, conservador (semana 23-29 sep)
export const MIN_DAILY_USE = 0.05;
export const CEILING_MIN = 0.60;
export const CEILING_MAX = 0.97;
const FIVE_WAIT_UTIL = 0.5;                       // con ≥50 % usado y reset cerca, conviene esperar
const FIVE_WAIT_WINDOW_MS = 90 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function emptyWindow() {
  return { status: null, utilization: null, resetsAt: null };
}

/**
 * Parsea todo el texto stream-json y devuelve la última lectura de cada ventana.
 * resetsAt en milisegundos epoch.
 */
export function parseQuota(text) {
  const five = emptyWindow();
  const seven = emptyWindow();
  let seen = false;
  let unified = false;

  for (const line of String(text || '').split('\n')) {
    if (!line.includes('"rate_limit_event"')) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    const info = ev?.rate_limit_info;
    if (!info) continue;
    seen = true;

    const target = info.rateLimitType === 'seven_day' ? seven : info.rateLimitType === 'five_hour' ? five : null;
    if (target) {
      if (info.status) target.status = info.status;
      if (typeof info.resetsAt === 'number') target.resetsAt = info.resetsAt * 1000;
      if (typeof info.utilization === 'number') target.utilization = info.utilization;
    }

    const uw = info.unifiedWindows;
    if (uw && typeof uw === 'object') {
      unified = true;
      for (const [key, win] of [['five_hour', five], ['seven_day', seven]]) {
        const w = uw[key];
        if (!w) continue;
        if (typeof w.utilization === 'number') win.utilization = w.utilization;
        if (typeof w.resetsAt === 'number') win.resetsAt = w.resetsAt * 1000;
        // Ventana no nombrada por el evento: si está al 100 % está agotada.
        if (target !== win && win.utilization != null) {
          win.status = win.utilization >= 1 ? 'rejected' : (win.status === 'rejected' ? 'rejected' : 'allowed');
        }
      }
    }
  }

  return { five, seven, seen, estimated: seen && !unified };
}

/** Techo semanal dinámico: deja a Juanjo su uso diario × días hasta el reset. */
export function weeklyCeiling({ now, sevenResetsAt, dailyUse = DEFAULT_DAILY_USE }) {
  if (!sevenResetsAt) return CEILING_MIN;
  const days = Math.max(0, (sevenResetsAt - now) / DAY_MS);
  const use = Math.max(MIN_DAILY_USE, dailyUse);
  return Math.min(CEILING_MAX, Math.max(CEILING_MIN, 1 - use * days));
}

/** ¿El semanal está agotado o sobre el techo? Devuelve null si se puede seguir. */
export function weeklyBlock(q, { now, dailyUse }) {
  const { seven } = q;
  if (seven.status === 'rejected' || (seven.utilization != null && seven.utilization >= 1)) {
    return { reason: 'semanal agotado', resetsAt: seven.resetsAt, utilization: seven.utilization };
  }
  if (seven.utilization == null) return null; // legacy bajo ~55 %: bajo cualquier techo (mínimo 0,60)
  const ceiling = weeklyCeiling({ now, sevenResetsAt: seven.resetsAt, dailyUse });
  if (seven.utilization >= ceiling) {
    return { reason: `semanal sobre el techo de hoy (${pct(seven.utilization)} ≥ ${pct(ceiling)})`, resetsAt: seven.resetsAt, utilization: seven.utilization, ceiling };
  }
  return null;
}

/**
 * Decisión de arranque/continuación.
 * → { action: 'run' } | { action: 'wait', until, reason } | { action: 'skip_weekly', reason, resetsAt }
 */
export function decideStart(q, { now, dailyUse = DEFAULT_DAILY_USE } = {}) {
  const wk = weeklyBlock(q, { now, dailyUse });
  if (wk) return { action: 'skip_weekly', reason: wk.reason, resetsAt: wk.resetsAt };

  const { five } = q;
  const resetMs = five.resetsAt;
  const waitUntil = resetMs ? resetMs + WAIT_MARGIN_MS : null;

  if (five.status === 'rejected' || (five.utilization != null && five.utilization >= 1)) {
    return { action: 'wait', until: waitUntil ?? now + 60 * 60 * 1000, reason: 'cupo de 5 h agotado' };
  }
  if (q.estimated && five.status === 'allowed_warning') {
    // Legacy: solo hay número desde 0,90 → casi agotado.
    if (waitUntil) return { action: 'wait', until: waitUntil, reason: 'cupo de 5 h ≥ 90 % (aviso del CLI)' };
  }
  if (five.utilization != null && five.utilization >= FIVE_WAIT_UTIL && resetMs && resetMs - now <= FIVE_WAIT_WINDOW_MS) {
    return { action: 'wait', until: waitUntil, reason: `cupo de 5 h al ${pct(five.utilization)} y se renueva en ${Math.round((resetMs - now) / 60000)} min` };
  }
  return { action: 'run' };
}

/** ¿Cabe una ronda más (ronda 2) bajo el techo semanal? */
export function canStartExtraRound(q, { now, dailyUse = DEFAULT_DAILY_USE }) {
  if (weeklyBlock(q, { now, dailyUse })) return false;
  // Legacy sin número = bajo el umbral de aviso (~0,56): se asume el peor caso dentro de eso.
  const u = q.seven.utilization ?? (q.estimated ? 0.55 : null);
  if (u == null) return false;
  const ceiling = weeklyCeiling({ now, sevenResetsAt: q.seven.resetsAt, dailyUse });
  return u + ROUND_COST_WEEKLY <= ceiling;
}

/** Une una lectura nueva sobre la anterior (lo que no trae la nueva se conserva). */
export function mergeQuota(prev, next) {
  if (!prev) return next;
  if (!next?.seen) return prev;
  const pick = (a, b) => ({
    status: b.status ?? a.status,
    utilization: b.utilization ?? a.utilization,
    resetsAt: b.resetsAt ?? a.resetsAt,
  });
  return { five: pick(prev.five, next.five), seven: pick(prev.seven, next.seven), seen: true, estimated: next.estimated };
}

/**
 * Uso diurno medido de Juanjo, desde el historial de lecturas:
 * subida del semanal entre las 08:00 y las 23:59 en días sin agentes de día.
 * Devuelve null si hay <5 días con datos.
 */
export function measuredDailyUse(history) {
  const byDay = new Map();
  for (const h of history) {
    if (h?.seven?.utilization == null || !h.at) continue;
    const d = new Date(h.at);
    const hour = d.getHours();
    if (hour < 8) continue; // de noche consumen los agentes
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}|${h.seven.resetsAt}`;
    const cur = byDay.get(key) || { min: Infinity, max: -Infinity };
    cur.min = Math.min(cur.min, h.seven.utilization);
    cur.max = Math.max(cur.max, h.seven.utilization);
    byDay.set(key, cur);
  }
  const deltas = [...byDay.values()].map(v => v.max - v.min).filter(x => x >= 0);
  if (deltas.length < 5) return null;
  deltas.sort((a, b) => a - b);
  // Percentil 75: protege los días pesados sin dejarse llevar por el máximo.
  return deltas[Math.floor(deltas.length * 0.75)];
}

export function pct(x) {
  return x == null ? '?' : `${Math.round(x * 100)} %`;
}

/** Llamada mínima para leer el cupo. Hooks desactivados (no dispara claude-mem ni inbox). */
export function probeQuota({ bin = 'claude', env = process.env, cwd } = {}) {
  const args = [
    '-p', 'ok', '--model', 'haiku', '--max-turns', '1',
    '--output-format', 'stream-json', '--verbose',
    '--settings', '{"disableAllHooks":true}',
  ];
  // CLI falso de pruebas (.mjs) se lanza con node.
  const [cmd, argv] = bin.endsWith('.mjs') ? [process.execPath, [bin, ...args]] : [bin, args];
  const res = spawnSync(cmd, argv, { env, cwd, encoding: 'utf8', timeout: 120000, shell: false, windowsHide: true });
  const text = `${res.stdout || ''}\n${res.stderr || ''}`;
  return { ...parseQuota(text), raw: text.slice(0, 4000), exitCode: res.status };
}
