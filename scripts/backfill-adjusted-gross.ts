/**
 * Backfill del tope WHS 3.1 (Adjusted Gross Score) sobre el historial (#545, PR3).
 *
 * Por defecto NO escribe (dry-run): muestra, por jugador, cuántas rondas se topan
 * y cómo se movería su Índice Golfers. Con --apply escribe `adjusted_gross`,
 * `diferencial` y `metadata.ajuste_whs`, guarda antes un snapshot de lo que pisa
 * (fuera del repo) y recalcula el índice con `calcular_indice_golfers`.
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/backfill-adjusted-gross.ts                 # dry-run, todos
 *   npx tsx --env-file=.env.local scripts/backfill-adjusted-gross.ts --user <uuid>   # dry-run, un jugador
 *   npx tsx --env-file=.env.local scripts/backfill-adjusted-gross.ts --apply [--user <uuid>]
 *   npx tsx --env-file=.env.local scripts/backfill-adjusted-gross.ts --revertir <snapshot.json>
 *
 * Reglas (las aplica `src/lib/data/backfill-tope-whs.ts`): FedeGolf, filas sin golpes
 * por hoyo y excluidas a mano no entran; una fila cuyo diferencial guardado no se
 * reproduce desde el bruto no se toca (se reporta); nunca crea un diferencial nuevo.
 * Idempotente: re-correrlo no re-escribe filas ya topadas.
 */
import { createClient } from '@supabase/supabase-js'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { calcularIndiceGolfersLocal } from '@/lib/indice-golfers'
import type { CacheAjusteWHS } from '@/lib/data/ajuste-whs-fila'
import {
  COLS_BACKFILL_TOPE,
  entraAlBackfill,
  indiceDelDia,
  indiceGolfersAntesDe,
  recalcularTopeDeFila,
  ultimosVeinte,
  type FilaBackfillTope,
  type RegistroIndice,
  type ResultadoBackfillFila,
} from '@/lib/data/backfill-tope-whs'

const args = process.argv.slice(2)
const flag = (n: string) => args.includes(n)
const valor = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
const APPLY = flag('--apply')
const USER = valor('--user')
const REVERTIR = valor('--revertir')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const sb = createClient(url, key, { auth: { persistSession: false } })

const DIR_RESPALDOS = path.join(os.homedir(), 'OneDrive', 'GolfersPlus-Respaldos', 'backfill-tope-whs')

/** Prod congelada si hay gente jugando (CLAUDE.md, regla 6). */
function exigirSinEventoEnVivo() {
  const r = spawnSync(process.execPath, ['scripts/ci/evento-en-vivo.mjs'], {
    stdio: 'inherit',
    env: { ...process.env, EVENTO_SUPABASE_URL: url, EVENTO_SUPABASE_KEY: key },
  })
  if (r.status !== 0) { console.error(`evento-en-vivo salió con ${r.status}: no se escribe nada.`); process.exit(3) }
}

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

async function revertir(archivo: string) {
  const snap = JSON.parse(fs.readFileSync(archivo, 'utf-8')) as { filas: Array<{ id: string; user_id: string; adjusted_gross: number | null; diferencial: number | null; metadata: unknown }> }
  exigirSinEventoEnVivo()
  let fallas = 0
  for (const f of snap.filas) {
    const { error } = await sb.from('historical_rounds')
      .update({ adjusted_gross: f.adjusted_gross, diferencial: f.diferencial, metadata: f.metadata }).eq('id', f.id)
    if (error) { fallas++; console.error(f.id, error.message) }
  }
  for (const u of new Set(snap.filas.map(f => f.user_id))) await sb.rpc('calcular_indice_golfers', { p_user_id: u })
  console.log(`Revertidas ${snap.filas.length - fallas}/${snap.filas.length} filas; índices recalculados.`)
  process.exit(fallas ? 1 : 0)
}

async function main() {
  if (REVERTIR) return revertir(REVERTIR)

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
  const { data: hist } = await sb.from('indice_historial').select('user_id, indice, fecha').in('user_id', usuarios)
  const historial = new Map<string, RegistroIndice[]>()
  for (const h of hist ?? []) historial.set(h.user_id, [...(historial.get(h.user_id) ?? []), { indice: Number(h.indice), fecha: h.fecha }])

  // Todas las filas de los jugadores (FedeGolf incluidas: el RPC las promedia), para
  // reconstruir el índice Golfers+ de cada fecha y estimar el antes/después.
  const todas = await leerTodo<FilaIndice>(desde => {
    let q = sb.from('historical_rounds').select('id, user_id, played_at, diferencial, slope_rating, course_rating, excluded_from_handicap')
      .in('user_id', usuarios).order('id').limit(1000)
    if (desde) q = q.gt('id', desde)
    return q as never
  }, f => f.id)

  // Por jugador y en orden de fecha: cada ronda se topa con el índice que daban las rondas
  // ANTERIORES ya re-topadas (nunca con un índice que salió de esa misma ronda).
  const cache: CacheAjusteWHS = new Map()
  const resultados: ResultadoBackfillFila[] = []
  for (const u of usuarios) {
    const p = perfil.get(u)
    const mias = todas.filter(f => f.user_id === u).map(f => ({ ...f }))
    const miaPorId = new Map(mias.map(f => [f.id, f]))
    for (const f of filas.filter(x => x.user_id === u).sort((a, b) => a.played_at.localeCompare(b.played_at))) {
      const indice = indiceDelDia({
        historial: historial.get(u) ?? [], playedAt: f.played_at,
        federadoActual: p?.indice ?? null, golfersAntes: indiceGolfersAntesDe(mias, f.played_at),
      })
      const r = await recalcularTopeDeFila(sb, f, indice, cache)
      resultados.push(r)
      const mia = miaPorId.get(f.id)
      if (mia && r.update) mia.diferencial = r.despues.diferencial
    }
  }
  const porIdFila = new Map(filas.map(f => [f.id, f]))
  const nuevoDif = new Map(resultados.filter(r => r.update).map(r => [r.id, r.despues.diferencial]))

  console.log(`\n═══ Backfill tope WHS 3.1 — ${APPLY ? 'APPLY' : 'DRY-RUN (no escribe)'} ═══`)
  console.log(`Filas evaluadas: ${filas.length} · jugadores: ${usuarios.length}`)
  const por = (e: string) => resultados.filter(r => r.estado === e).length
  console.log(`  con algún hoyo topado o diferencial distinto: ${por('cambia')}`)
  console.log(`  sin hoyos sobre el tope: ${por('igual')}`)
  console.log(`  diferencial guardado no reproducible (NO se tocan): ${por('no_reproducible')}`)
  console.log(`  sin tope posible (bola compartida, etc.): ${por('sin_tope')}`)
  console.log(`  fuera: ${formatoAntiguo} con golpes en formato antiguo (objeto, sin diferencial; no tocan el índice)`)
  console.log(`  filas a escribir: ${nuevoDif.size}\n`)

  const filasReporte = usuarios.map(u => {
    const mias = todas.filter(f => f.user_id === u)
    const antes = calcularIndiceGolfersLocal(ultimosVeinte(mias))
    const despues = calcularIndiceGolfersLocal(ultimosVeinte(mias.map(f => (nuevoDif.has(f.id) ? { ...f, diferencial: nuevoDif.get(f.id)! } : f))))
    const r = resultados.filter(x => x.user_id === u)
    const p = perfil.get(u)
    return {
      jugador: String(p?.name ?? u.slice(0, 8)),
      enBD: p?.indice_golfers ?? null,
      antes, despues,
      delta: antes != null && despues != null ? +(despues - antes).toFixed(1) : null,
      topadas: r.filter(x => x.hoyosTopados > 0).length,
      hoyos: r.reduce((a, x) => a + x.hoyosTopados, 0),
      noRepro: r.filter(x => x.estado === 'no_reproducible').length,
    }
  }).sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))
  console.table(filasReporte)
  const descuadre = filasReporte.filter(f => f.enBD != null && f.antes != null && Math.abs(Number(f.enBD) - f.antes) > 0.05)
  if (descuadre.length) console.log(`⚠ ${descuadre.length} jugador(es) con índice en BD distinto al estimado "antes" (el RPC manda al aplicar).`)

  if (flag('--detalle')) {
    for (const r of resultados.filter(x => x.estado === 'cambia' || x.estado === 'no_reproducible')) {
      const f = porIdFila.get(r.id)!
      const a = (r.update?.metadata as { ajuste_whs?: { indice: number | null; course_hcp: number | null; si_fuente: string; hoyos_topados: unknown[] } } | undefined)?.ajuste_whs
      console.log(`${String(perfil.get(r.user_id)?.name ?? r.user_id.slice(0, 8))} | ${f.played_at} | ${f.import_source} | ${f.holes_played}h | bruto ${f.total_gross} → ${r.despues.adjusted_gross} | dif ${r.antes.diferencial} → ${r.despues.diferencial} | ${r.estado} | índice ${a?.indice ?? '—'} CH ${a?.course_hcp ?? '—'} SI ${a?.si_fuente ?? '—'} | ${JSON.stringify(a?.hoyos_topados ?? [])}`)
    }
  }

  if (!APPLY) { console.log('\nDry-run: no se escribió nada. Para aplicar: --apply'); return }

  exigirSinEventoEnVivo()
  const aEscribir = resultados.filter(r => r.update)
  const porId = new Map(filas.map(f => [f.id, f]))
  fs.mkdirSync(DIR_RESPALDOS, { recursive: true })
  const snapPath = path.join(DIR_RESPALDOS, `snapshot-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  fs.writeFileSync(snapPath, JSON.stringify({ creado: new Date().toISOString(), filas: aEscribir.map(r => {
    const f = porId.get(r.id)!
    return { id: f.id, user_id: f.user_id, adjusted_gross: f.adjusted_gross, diferencial: f.diferencial, metadata: f.metadata }
  }) }))
  console.log(`Snapshot (para --revertir): ${snapPath}`)

  let ok = 0, saltadas = 0
  for (const r of aEscribir) {
    const f = porId.get(r.id)!
    // Sólo si la fila no cambió desde que se leyó (alguien la editó en medio: se salta).
    let q = sb.from('historical_rounds').update(r.update!).eq('id', r.id)
    q = f.diferencial == null ? q.is('diferencial', null) : q.eq('diferencial', f.diferencial)
    q = f.adjusted_gross == null ? q.is('adjusted_gross', null) : q.eq('adjusted_gross', f.adjusted_gross)
    const { data, error } = await q.select('id')
    if (error) { console.error(r.id, error.message); continue }
    if (!data?.length) { saltadas++; continue }
    ok++
  }
  console.log(`Escritas ${ok}/${aEscribir.length} (saltadas por cambio concurrente: ${saltadas}).`)
  for (const u of new Set(aEscribir.map(r => r.user_id))) {
    const { data, error } = await sb.rpc('calcular_indice_golfers', { p_user_id: u })
    console.log(`  ${String(perfil.get(u)?.name ?? u.slice(0, 8))}: índice ${error ? `ERROR ${error.message}` : data}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
