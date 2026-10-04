#!/usr/bin/env node
/**
 * scripts/ci/evento-en-vivo.mjs — ¿hay gente jugando AHORA con la app? Fuente única del
 * "congelamiento por evento en vivo".
 *
 * Por qué (incidente 04-oct-2026, torneo Los Leones — docs/INCIDENTE_TORNEO_LEONES_2026-10-04.md):
 * durante la ronda, sesiones autónomas mergearon 3 PRs → 5 deploys y ~6 tandas de CI contra la BD
 * de PRODUCCIÓN (plan free, 0,5 GB). La base se saturó y la API cayó ~25 min en plena ronda.
 *
 * Regla: mientras haya evento en vivo NO se toca prod — ni tests contra la BD, ni merges, ni deploys,
 * ni SQL. El paso de turno de los jobs de prod (wait-prod-turn.mjs) falla con este mensaje → los
 * checks del PR quedan rojos → nadie mergea (merge sólo con checks verdes).
 *
 * Evento en vivo =
 *   (a) una ventana declarada en config/eventos-en-vivo.json (torneos agendados), o
 *   (b) una ronda libre REAL en curso: estado en_curso, creada hace entre 15 min y 6 h, no demo,
 *       no QA (course_name 'QA_%'), no del usuario de E2E, y con al menos un hoyo anotado.
 *       Los fixtures de tests viven minutos y se borran: el piso de 15 min los deja fuera.
 * Si la BD no responde se trata como evento (fail-closed): con prod caída lo último que
 * conviene es amontonarle tráfico de CI.
 *
 * Uso: node scripts/ci/evento-en-vivo.mjs  → exit 0 sin evento · exit 3 evento (motivo por stdout)
 * Env: EVENTO_SUPABASE_URL + EVENTO_SUPABASE_KEY (service role); sin ellas no se puede saber → exit 0
 * con aviso (PR de un fork / entorno local sin secrets).
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const HORAS_RONDA_VIVA = 6
export const MINUTOS_PISO_FIXTURE = 15
/** Usuario de los tests E2E (e2e-test@golfersplus-test.local). */
export const USUARIOS_DE_PRUEBA = ['ac9a76d7-0511-4d2c-9a8a-e61913a52228']
export const EXIT_EVENTO = 3

/** Puro: ¿alguna ventana declarada cubre `ahora`? */
export function ventanaActiva(ventanas, ahora) {
  return (ventanas ?? []).find(v => Date.parse(v.desde) <= ahora && ahora <= Date.parse(v.hasta)) ?? null
}

/** Puro: rondas que cuentan como juego real en vivo. */
export function rondasEnVivo(rondas, ahora) {
  const max = HORAS_RONDA_VIVA * 3_600_000
  const min = MINUTOS_PISO_FIXTURE * 60_000
  return (rondas ?? []).filter(r => {
    const edad = ahora - Date.parse(r.created_at)
    if (r.estado !== 'en_curso' || r.es_demo) return false
    if (edad < min || edad > max) return false
    if (/^QA_/i.test(r.course_name ?? '')) return false
    if (USUARIOS_DE_PRUEBA.includes(r.creador_id)) return false
    return (r.ronda_libre_jugadores ?? []).some(j => Object.keys(j.scores ?? {}).length > 0)
  })
}

function leerVentanas() {
  try {
    const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
    return JSON.parse(readFileSync(join(raiz, 'config', 'eventos-en-vivo.json'), 'utf8')).ventanas ?? []
  } catch {
    return []
  }
}

/** { evento: boolean, motivo: string } — nunca lanza. */
export async function consultarEvento({ url, key, ahora = Date.now(), ventanas = leerVentanas(), fetchImpl = fetch } = {}) {
  const v = ventanaActiva(ventanas, ahora)
  if (v) return { evento: true, motivo: `ventana declarada: ${v.motivo ?? 'evento'} (${v.desde} → ${v.hasta})` }
  if (!url || !key) return { evento: false, motivo: 'sin credenciales: no se puede consultar (se asume sin evento)' }
  const desde = new Date(ahora - HORAS_RONDA_VIVA * 3_600_000).toISOString()
  const q = `${url}/rest/v1/rondas_libres?select=codigo,estado,es_demo,course_name,creador_id,created_at,ronda_libre_jugadores(scores)` +
    `&estado=eq.en_curso&created_at=gte.${encodeURIComponent(desde)}`
  try {
    const res = await fetchImpl(q, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return { evento: true, motivo: `la BD respondió ${res.status}: se congela por precaución` }
    const vivas = rondasEnVivo(await res.json(), ahora)
    if (vivas.length) return { evento: true, motivo: `${vivas.length} ronda(s) en juego: ${vivas.map(r => r.codigo).join(', ')}` }
    return { evento: false, motivo: 'sin rondas reales en juego' }
  } catch (e) {
    return { evento: true, motivo: `la BD no respondió (${e.message}): se congela por precaución` }
  }
}

export const MENSAJE_CONGELADO = (motivo) =>
  `Congelado por EVENTO EN VIVO (${motivo}). No se toca producción mientras hay gente jugando: ` +
  'ni tests contra la BD, ni merges, ni deploys. Re-ejecuta este job cuando termine la ronda.'

if (process.argv[1]?.endsWith('evento-en-vivo.mjs')) {
  const r = await consultarEvento({ url: process.env.EVENTO_SUPABASE_URL, key: process.env.EVENTO_SUPABASE_KEY })
  console.log(r.evento ? MENSAJE_CONGELADO(r.motivo) : `Sin evento en vivo (${r.motivo}).`)
  setTimeout(() => process.exit(r.evento ? EXIT_EVENTO : 0), 200)
}
