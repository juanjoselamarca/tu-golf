/**
 * Backfill del tope WHS 3.1 (Adjusted Gross Score) sobre el historial (#545, PR3).
 *
 * NUNCA escribe en la base: muestra, por jugador, cuántas rondas se topan y cómo se
 * movería su Índice Golfers. Con --migracion deja el resultado como migración
 * (`supabase/migrations/`) y su rollback (`supabase/migrations/rollback/`): las
 * escrituras de datos en prod van por PR y las aplica `migraciones-prod` tras la
 * aprobación (docs/CONVENCIONES_TECNICAS.md). El workflow ya frena con evento en vivo.
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/backfill-adjusted-gross.ts                 # dry-run, todos
 *   npx tsx --env-file=.env.local scripts/backfill-adjusted-gross.ts --user <uuid>   # dry-run, un jugador
 *   npx tsx --env-file=.env.local scripts/backfill-adjusted-gross.ts --detalle       # + fila por fila
 *   npx tsx --env-file=.env.local scripts/backfill-adjusted-gross.ts --migracion     # genera migración + rollback
 *
 * Reglas (las aplica `src/lib/data/backfill-tope-whs.ts`): FedeGolf, filas sin golpes
 * por hoyo y excluidas a mano no entran; una fila cuyo diferencial guardado no se
 * reproduce no se toca, ni una cuyos golpes por hoyo no suman el bruto (se reportan);
 * nunca crea un diferencial nuevo. Idempotente: re-correrlo no re-escribe filas ya
 * topadas. Migración y rollback sólo pisan filas que siguen como se leyeron.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { computeGolfersIndex } from '@/golf/core/whs-index'
import type { CacheAjusteWHS } from '@/lib/data/ajuste-whs-fila'
import {
  COLS_BACKFILL_TOPE,
  entraAlBackfill,
  indiceDelDia,
  indiceGolfersAntesDe,
  recalcularTopeDeFila,
  sqlDelBackfill,
  ultimosVeinte,
  type FilaBackfillTope,
  type RegistroIndice,
  type ResultadoBackfillFila,
} from '@/lib/data/backfill-tope-whs'

const args = process.argv.slice(2)
const flag = (n: string) => args.includes(n)
const valor = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
const MIGRACION = flag('--migracion')
const USER = valor('--user')
if (MIGRACION && USER) { console.error('--migracion es para todos los jugadores (sin --user).'); process.exit(1) }

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const sb = createClient(url, key, { auth: { persistSession: false } })

/** Todas las filas (PostgREST corta en 1.000: se pagina por id). */
async function leerTodo<T>(armar: (desde: string | null) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, id: (t: T) => string): Promise<T[]> {
  const out: T[] = []
  let desde: string | null = null
  for (;;) {
    const { data, error } = await armar(desde)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < 1000) break
    desde = id(data[data.length - 1])
  }
  return out
}

type FilaIndice = { id: string; user_id: string; played_at: string; diferencial: number | null; slope_rating: number | null; course_rating: number | null; excluded_from_handicap: boolean | null }

async function main() {
  const filas = (await leerTodo<FilaBackfillTope>(desde => {
    let q = sb.from('historical_rounds').select(COLS_BACKFILL_TOPE)
      .neq('import_source', 'fedegolf').not('scores', 'is', null).eq('excluded_from_handicap', false)
      .order('id').limit(1000)
    if (USER) q = q.eq('user_id', USER)
    if (desde) q = q.gt('id', desde)
    return q as never
  }, f => f.id))
  // Golpes guardados como objeto {"1":4,…} (formulario antiguo): nunca tuvieron diferencial; no entran.
  const formatoAntiguo = filas.filter(f => f.scores != null && !Array.isArray(f.scores)).length
  filas.splice(0, filas.length, ...filas.filter(entraAlBackfill))

  // `.neq` deja fuera import_source NULL: se suman aparte (no son FedeGolf).
  const nulas = await leerTodo<FilaBackfillTope>(desde => {
    let q = sb.from('historical_rounds').select(COLS_BACKFILL_TOPE)
      .is('import_source', null).not('scores', 'is', null).eq('excluded_from_handicap', false).order('id').limit(1000)
    if (USER) q = q.eq('user_id', USER)
    if (desde) q = q.gt('id', desde)
    return q as never
  }, f => f.id)
  filas.push(...nulas.filter(entraAlBackfill))
  if (filas.some(f => f.import_source === 'fedegolf')) throw new Error('una fila FedeGolf entró al backfill')

  const usuarios = [...new Set(filas.map(f => f.user_id))]
  const { data: perfiles, error: errPerfiles } = await sb.from('profiles').select('id, name, indice, indice_golfers').in('id', usuarios)
  if (errPerfiles) throw new Error(errPerfiles.message)
  const perfil = new Map((perfiles ?? []).map(p => [p.id as string, p]))
  // Decide el índice del tope: un error o un corte silencioso caería al federado de HOY.
  const hist = await leerTodo<{ id: string; user_id: string; indice: number; fecha: string }>(desde => {
    let q = sb.from('indice_historial').select('id, user_id, indice, fecha').in('user_id', usuarios).order('id').limit(1000)
    if (desde) q = q.gt('id', desde)
    return q as never
  }, h => h.id)
  const historial = new Map<string, RegistroIndice[]>()
  for (const h of hist) historial.set(h.user_id, [...(historial.get(h.user_id) ?? []), { indice: Number(h.indice), fecha: h.fecha }])

  // Todas las filas de los jugadores (FedeGolf incluidas: el RPC las promedia), para
  // reconstruir el índice Golfers+ de cada fecha y estimar el antes/después.
  const todas = await leerTodo<FilaIndice>(desde => {
    let q = sb.from('historical_rounds').select('id, user_id, played_at, diferencial, slope_rating, course_rating, excluded_from_handicap')
      .in('user_id', usuarios).order('id').limit(1000)
    if (desde) q = q.gt('id', desde)
    return q as never
  }, f => f.id)

  // Por jugador: cada ronda se topa con el índice que daban las rondas ANTERIORES (nunca con
  // uno que salió de esa misma ronda), con sus diferenciales GUARDADOS: ése es el índice que
  // el jugador tenía ese día. Propagar el re-topado lo bajaría y toparía de más (ante la duda,
  // tope más alto).
  const cache: CacheAjusteWHS = new Map()
  const resultados: ResultadoBackfillFila[] = []
  const federadoHoy = new Set<string>()
  for (const u of usuarios) {
    const p = perfil.get(u)
    const mias = todas.filter(f => f.user_id === u)
    for (const f of filas.filter(x => x.user_id === u).sort((a, b) => a.played_at.localeCompare(b.played_at))) {
      // Sin historial federado ni ajuste_whs propio, el tope usa el federado de HOY (puede ser más bajo que el de ese día).
      if (!historial.get(u)?.length && p?.indice != null && !(f.metadata != null && 'ajuste_whs' in f.metadata)) federadoHoy.add(f.id)
      const indice = indiceDelDia({
        historial: historial.get(u) ?? [], playedAt: f.played_at,
        federadoActual: p?.indice ?? null, golfersAntes: indiceGolfersAntesDe(mias, f.played_at),
      })
      const r = await recalcularTopeDeFila(sb, f, indice, cache)
      resultados.push(r)
    }
  }
  const porIdFila = new Map(filas.map(f => [f.id, f]))
  const nuevoDif = new Map(resultados.filter(r => r.update).map(r => [r.id, r.despues.diferencial]))

  console.log(`\n═══ Backfill tope WHS 3.1 — ${MIGRACION ? 'MIGRACIÓN' : 'DRY-RUN'} (no escribe en la base) ═══`)
  console.log(`Filas evaluadas: ${filas.length} · jugadores: ${usuarios.length}`)
  const por = (e: string) => resultados.filter(r => r.estado === e).length
  const cambiaSinTope = resultados.filter(r => r.estado === 'cambia' && r.hoyosTopados === 0).length
  console.log(`  con algún hoyo topado: ${por('cambia') - cambiaSinTope}`)
  console.log(`  cambia el diferencial SIN ningún hoyo topado (debe ser 0): ${cambiaSinTope}`)
  console.log(`  sin hoyos sobre el tope: ${por('igual')}`)
  console.log(`  diferencial guardado no reproducible (NO se tocan): ${por('no_reproducible')}`)
  console.log(`  golpes por hoyo que no suman el bruto (NO se tocan): ${por('bruto_no_calza')}`)
  console.log(`  topadas con el federado de HOY (sin historial de ese día): ${resultados.filter(r => federadoHoy.has(r.id) && r.hoyosTopados > 0).length} de ${federadoHoy.size} evaluadas así`)
  console.log(`  sin tope posible (bola compartida, etc.): ${por('sin_tope')}`)
  console.log(`  fuera: ${formatoAntiguo} con golpes en formato antiguo (objeto, sin diferencial; no tocan el índice)`)
  console.log(`  filas a escribir: ${nuevoDif.size}\n`)

  const filasReporte = usuarios.map(u => {
    const mias = todas.filter(f => f.user_id === u)
    const antes = computeGolfersIndex(ultimosVeinte(mias))
    const despues = computeGolfersIndex(ultimosVeinte(mias.map(f => (nuevoDif.has(f.id) ? { ...f, diferencial: nuevoDif.get(f.id)! } : f))))
    const r = resultados.filter(x => x.user_id === u)
    const p = perfil.get(u)
    return {
      jugador: String(p?.name ?? u.slice(0, 8)),
      enBD: p?.indice_golfers ?? null,
      antes, despues,
      delta: antes != null && despues != null ? +(despues - antes).toFixed(1) : null,
      topadas: r.filter(x => x.hoyosTopados > 0).length,
      hoyos: r.reduce((a, x) => a + x.hoyosTopados, 0),
      noRepro: r.filter(x => x.estado === 'no_reproducible' || x.estado === 'bruto_no_calza').length,
      fedHoy: r.filter(x => federadoHoy.has(x.id) && x.hoyosTopados > 0).length,
    }
  }).sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))
  console.table(filasReporte)
  if (cambiaSinTope > 0) { console.error(`✗ ${cambiaSinTope} fila(s) cambiarían el diferencial sin topar ningún hoyo: no se genera.`); if (MIGRACION) process.exit(1) }
  const descuadre = filasReporte.filter(f => f.enBD != null && f.antes != null && Math.abs(Number(f.enBD) - f.antes) > 0.05)
  if (descuadre.length) console.log(`⚠ ${descuadre.length} jugador(es) con índice en BD distinto al estimado "antes" (el RPC manda al aplicar).`)

  if (flag('--detalle')) {
    for (const r of resultados.filter(x => x.estado !== 'igual' && x.estado !== 'sin_tope')) {
      const f = porIdFila.get(r.id)!
      const a = (r.update?.metadata as { ajuste_whs?: { indice: number | null; course_hcp: number | null; si_fuente: string; hoyos_topados: unknown[] } } | undefined)?.ajuste_whs
      console.log(`${String(perfil.get(r.user_id)?.name ?? r.user_id.slice(0, 8))} | ${f.played_at} | ${f.import_source} | ${f.holes_played}h | bruto ${f.total_gross} → ${r.despues.adjusted_gross} | dif ${r.antes.diferencial} → ${r.despues.diferencial} | ${r.estado} | índice ${a?.indice ?? '—'} CH ${a?.course_hcp ?? '—'} SI ${a?.si_fuente ?? '—'} | ${JSON.stringify(a?.hoyos_topados ?? [])}`)
    }
  }

  if (!MIGRACION) { console.log('\nDry-run: no se escribió nada. Para generar la migración: --migracion'); return }

  const { migracion, rollback, filas: n } = sqlDelBackfill(resultados, porIdFila)
  // AAAAMMDDHHMMSS en UTC, como el resto de supabase/migrations/.
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  const archivo = path.join('supabase', 'migrations', `${ts}_backfill_tope_whs_545.sql`)
  const archivoRollback = path.join('supabase', 'migrations', 'rollback', `${ts.slice(0, 8)}_backfill_tope_whs_545_rollback.sql`)
  fs.writeFileSync(archivo, migracion)
  fs.writeFileSync(archivoRollback, rollback)
  console.log(`Migración (${n} filas): ${archivo}\nRollback: ${archivoRollback}`)
}

main().catch(e => { console.error(e); process.exit(1) })
