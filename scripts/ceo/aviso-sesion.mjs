/**
 * scripts/ceo/aviso-sesion.mjs — hook SessionStart: avisa si los agentes nocturnos no corrieron.
 *
 * Por qué existe: del 15 al 17-nov-2026 el CLI de Claude se colgó al arrancar cada noche, el
 * scheduler mandó sus alertas P0 a Telegram y Telegram también estaba fallando por timeout.
 * Tres noches perdidas sin que nadie se enterara. Este aviso no depende de la red: lee el estado
 * de las noches en disco y lo muestra al abrir cualquier sesión de Claude Code.
 *
 * Silencio total si todo está bien. Nunca falla la sesión (exit 0 siempre).
 *
 * Uso: node scripts/ceo/aviso-sesion.mjs
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localDate } from './night.mjs';

const NOCHE_ID = /^(\d{4}-\d{2}-\d{2})(-\d+)?\.json$/;
const DIAS_A_MIRAR = 3;
// La noche abre a las 00:00; a las 08:00 ya debería haber archivo de la noche de hoy.
const HORA_NOCHE_DEBE_EXISTIR = 8;

/** Una noche corrió si al menos un trabajo tuvo un intento. */
export function nocheCorrio(night) {
  return (night.jobs ?? []).some(j => (j.attempts?.length ?? 0) > 0);
}

/**
 * Arma el aviso a partir de las noches en disco. Puro: recibe los datos y la hora.
 * @param {{ nights: object[], now: number, pausa: boolean }} p
 * @returns {string} '' si no hay nada que avisar.
 */
export function construirAviso({ nights, now, pausa }) {
  if (pausa) return '⏸️ Agentes nocturnos en PAUSE (.claude/ceo-locks/PAUSE): no corren hasta quitarlo.';

  const dias = new Set();
  for (let i = 0; i < DIAS_A_MIRAR; i++) dias.add(localDate(now - i * 86400000));
  const recientes = nights.filter(n => dias.has(String(n.nightId).slice(0, 10)));

  const problemas = [];
  const hoy = localDate(now);
  if (new Date(now).getHours() >= HORA_NOCHE_DEBE_EXISTIR && !recientes.some(n => String(n.nightId).startsWith(hoy))) {
    problemas.push(`la noche ${hoy} no abrió`);
  }
  const fallidas = recientes.filter(n => !nocheCorrio(n)).map(n => n.nightId).sort();
  if (fallidas.length) problemas.push(`${fallidas.length === 1 ? 'la noche' : 'las noches'} ${fallidas.join(', ')} no ${fallidas.length === 1 ? 'corrió' : 'corrieron'} ningún agente`);

  const p0SinEnviar = recientes.flatMap(n => (n.notifications ?? []).filter(x => x.kind === 'p0' && !x.sent));
  if (p0SinEnviar.length) {
    const ultimo = p0SinEnviar.sort((a, b) => String(a.at).localeCompare(String(b.at))).at(-1);
    problemas.push(`${p0SinEnviar.length} alerta(s) P0 que no llegaron a Telegram; la última: "${String(ultimo.text).replace(/\s+/g, ' ').trim().slice(0, 140)}"`);
  }

  if (!problemas.length) return '';
  return [
    '🚨 AGENTES NOCTURNOS — ' + problemas.join(' · ') + '.',
    '   Diagnóstico: node scripts/ceo-autonomo.mjs --status · --quota · logs en .claude/ceo-logs/<fecha>-scheduler.log',
  ].join('\n');
}

export function leerNoches(nightsDir) {
  if (!existsSync(nightsDir)) return [];
  const out = [];
  for (const f of readdirSync(nightsDir)) {
    if (!NOCHE_ID.test(f)) continue;
    try { out.push(JSON.parse(readFileSync(resolve(nightsDir, f), 'utf8'))); } catch { /* archivo a medio escribir: se ignora */ }
  }
  return out;
}

function main() {
  try {
    const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
    const logsDir = process.env.CEO_LOGS_DIR || resolve(repo, '.claude/ceo-logs');
    const aviso = construirAviso({
      nights: leerNoches(resolve(logsDir, 'nights')),
      now: Date.now(),
      pausa: existsSync(resolve(repo, '.claude/ceo-locks/PAUSE')),
    });
    if (aviso) process.stdout.write(aviso + '\n');
  } catch (e) {
    process.stdout.write(`(aviso de nocturnos falló: ${e.message})\n`);
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('ceo/aviso-sesion.mjs')) main();
