#!/usr/bin/env node
/**
 * Limpieza de los datos de la prueba de fuego Los Leones (prefijo QA_LEONES_).
 *
 * SOLO toca filas marcadas: rondas_libres con course_name 'QA_LEONES_%' y sus dependientes
 * (ronda_libre_jugadores / ronda_equipos / match_pairings caen por ON DELETE CASCADE;
 * round_watchers y historical_rounds se borran explícitamente por código / ronda_libre_id).
 * Aborta si alguna ronda tiene un jugador que NO se llame QA_LEONES_* (protección anti-error).
 *
 * Por defecto es DRY-RUN (sólo cuenta). Para borrar: --apply.
 *   node --env-file=.env.local scripts/qa-leones/limpieza.mjs          # cuenta
 *   node --env-file=.env.local scripts/qa-leones/limpieza.mjs --apply  # borra y verifica 0
 */
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function inventario() {
  const { data: rondas, error } = await admin
    .from('rondas_libres')
    .select('id, codigo, estado, ronda_libre_jugadores(id, nombre, user_id)')
    .like('course_name', 'QA_LEONES_%')
  if (error) throw new Error(error.message)
  const ids = (rondas ?? []).map(r => r.id)
  const codigos = (rondas ?? []).map(r => r.codigo)
  const { count: watchers } = codigos.length
    ? await admin.from('round_watchers').select('id', { count: 'exact', head: true }).in('ronda_codigo', codigos)
    : { count: 0 }
  const { data: hist } = ids.length
    ? await admin.from('historical_rounds').select('id, metadata').in('metadata->>ronda_libre_id', ids)
    : { data: [] }
  return { rondas: rondas ?? [], ids, codigos, watchers: watchers ?? 0, hist: hist ?? [] }
}

const inv = await inventario()
const jugadores = inv.rondas.flatMap(r => r.ronda_libre_jugadores ?? [])
const ajenos = jugadores.filter(j => !j.nombre.startsWith('QA_LEONES_') || j.user_id != null)
console.log(`rondas QA_LEONES_: ${inv.rondas.length} (${inv.codigos.join(', ') || '—'})`)
console.log(`jugadores: ${jugadores.length} · watchers: ${inv.watchers} · historical_rounds: ${inv.hist.length}`)
if (ajenos.length) {
  console.error('ABORTO: hay jugadores sin prefijo QA_LEONES_ o con cuenta real:', ajenos)
  process.exit(1)
}
if (!APPLY) {
  console.log('DRY-RUN: no se borró nada. Repetir con --apply.')
  process.exit(0)
}
if (inv.codigos.length) {
  const w = await admin.from('round_watchers').delete().in('ronda_codigo', inv.codigos)
  if (w.error) throw new Error(w.error.message)
}
if (inv.hist.length) {
  const h = await admin.from('historical_rounds').delete().in('id', inv.hist.map(x => x.id))
  if (h.error) throw new Error(h.error.message)
}
if (inv.ids.length) {
  const r = await admin.from('rondas_libres').delete().in('id', inv.ids)
  if (r.error) throw new Error(r.error.message)
}
const post = await inventario()
const { count: jugRestantes } = inv.ids.length
  ? await admin.from('ronda_libre_jugadores').select('id', { count: 'exact', head: true }).in('ronda_id', inv.ids)
  : { count: 0 }
console.log(`VERIFICACIÓN: rondas=${post.rondas.length} jugadores=${jugRestantes ?? 0} watchers=${post.watchers} historial=${post.hist.length}`)
process.exit(post.rondas.length + (jugRestantes ?? 0) + post.watchers + post.hist.length === 0 ? 0 : 1)
