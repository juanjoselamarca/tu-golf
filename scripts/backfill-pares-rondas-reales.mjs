#!/usr/bin/env node
/**
 * scripts/backfill-pares-rondas-reales.mjs
 *
 * Backfill de `par_per_hole` en `historical_rounds` para rondas de USUARIOS REALES
 * que tienen score hoyo-a-hoyo pero NINGUNA fuente de par (par_per_hole vacío Y
 * course_holes ausente/vacío para su course_id). Sin par, el coach ve golpes pero
 * no calcula vs-par ni detecta patrones. Ver memoria project_backfill_pares_rondas_reales.
 *
 * FORMA CANÓNICA: `par_per_hole` se guarda como OBJETO indexado por número de hoyo
 * en string: {"1":4,"2":4,...} (así lo escribe el import garmin-zip y así lo leen
 * src/golf/core/compare.ts::parPerHoleArray y parPlayedFromRound, que consumen las
 * pantallas historial/stats/coach). NUNCA como array — un array se lee corrido un
 * hoyo por compare.ts (arr["1"] = índice 1 = par del hoyo 2). Este script escribe
 * SIEMPRE objeto y REPARA filas que hayan quedado como array por error.
 *
 * FUENTE DE PAR (auditada 2026-06-30):
 *   Catálogo (FedeGolf VARONES + loops manuales verificados; el par NO depende del
 *   género, solo CR/slope):
 *     Las Brisas de Santo Domingo (club 16) — Este [5,3,4,4,5,4,3,4,4],
 *       Norte [4,4,4,3,5,4,3,5,4], Sur [4,4,4,3,5,4,3,5,4] (Sur≡Norte).
 *       Verificado: las 6 combinaciones 18h VARONES descomponen exacto en estos nueves.
 *     Rocas de Santo Domingo (club 17) — Roja [4,4,5,4,4,3,5,3,4],
 *       Azul [4,5,4,3,4,5,4,3,4], Blanca [4,4,3,5,4,4,4,3,5].
 *     Prince of Wales / Polo San Cristóbal (ruiz) — FedeGolf VARONES; el par
 *       escaneado por ruiz coincidió EXACTO con el catálogo.
 *   Canchas fuera de catálogo (investigadas 2026-06-30, Hole19 + GolfPass coinciden
 *   hoyo-a-hoyo; confirmadas por Juanjo, cruzadas con sus scores):
 *     Lima Golf Club — par 71.  La Planicie — par 72.  Gávea — par 69.
 *
 * CONVENCIÓN 9H: una ronda de 9 hoyos sobre un layout 18h "A-B" = nueve DELANTERO
 * (loop A). Confirmado porque estas rondas 9h traen el course_rating de 18h (~73):
 * Garmin tenía cargado el layout 18h completo y el jugador caminó la ida.
 *
 * SEGURIDAD:
 *   - Solo toca los IDs pinneados abajo (auditados uno por uno).
 *   - Escribe objeto {"1":p,...}. Salta solo si la fila YA tiene par en forma de
 *     OBJETO canónico; si está vacía o quedó como array, la (re)escribe correcto.
 *   - Verifica contra la fila viva: holes_played, largo de scores == largo de par,
 *     largo de par == holes esperados, y suma de par == `esum` (total DECLARADO
 *     como literal independiente por target — NO derivado del array, así un typo en
 *     un par literal hace fallar el chequeo). Si algo no calza, salta y reporta.
 *   - Dry-run por defecto. Escribe solo con --apply.
 *
 * Uso:
 *   node --env-file=.env.local scripts/backfill-pares-rondas-reales.mjs           # dry-run
 *   node --env-file=.env.local scripts/backfill-pares-rondas-reales.mjs --apply   # aplica
 */
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local'); process.exit(1) }
const sb = createClient(url, key)

const BRISAS_SD = { este: [5,3,4,4,5,4,3,4,4], norte: [4,4,4,3,5,4,3,5,4], sur: [4,4,4,3,5,4,3,5,4] }
const ROCAS_SD  = { roja: [4,4,5,4,4,3,5,3,4], azul: [4,5,4,3,4,5,4,3,4], blanca: [4,4,3,5,4,4,4,3,5] }
// Canchas fuera de catálogo — par hoyo-a-hoyo (18h)
const LIMA_GC      = [5,5,4,3,4,4,3,4,3, 4,3,5,3,4,4,4,5,4] // par 71
const LA_PLANICIE  = [4,4,3,4,5,4,4,3,4, 5,3,5,4,4,4,4,3,5] // par 72
const GAVEA        = [4,3,5,3,4,3,4,3,5, 3,4,4,5,4,4,3,4,4] // par 69
// Clubes chilenos en catálogo FedeGolf VARONES (verificados; el scan de ruiz coincidió exacto)
const PRINCE_WALES = [4,4,5,3,4,4,3,4,5, 4,3,4,4,5,3,4,4,5] // par 72
const POLO_SC      = [4,5,3,4,4,3,5,4,4, 4,4,5,3,4,4,3,5,4] // par 72
const BRISAS_NAME  = 'Club De Golf Las Brisas De Santo Domingo'

const sum = (a) => a.reduce((x, y) => x + y, 0)

// Rondas auditadas. `esum` = total de par DECLARADO como literal (chequeo independiente
// del array: un typo en un par hace que sum(par) ≠ esum y el target se rechaza).
const TARGETS = [
  // ── Juanjo — Las Brisas SD 9h (nueve delantero) ──
  { id: '85ad1fdf-272d-400c-b1b2-aca151816812', holes: 9,  par: BRISAS_SD.sur,   esum: 36 }, // 2019-12-31 Sur-Este
  { id: '221183e1-d679-485a-a52a-1a4a52fa0c39', holes: 9,  par: BRISAS_SD.norte, esum: 36 }, // 2020-01-02 Norte-Este
  { id: 'd405a40d-98ab-45ce-936d-871738b45252', holes: 9,  par: BRISAS_SD.norte, esum: 36 }, // 2023-12-29 Norte-Este
  { id: '9f59b424-a587-46b8-a18b-04ce91b3b29e', holes: 9,  par: BRISAS_SD.sur,   esum: 36 }, // 2023-12-29 Sur-Este
  { id: 'a5c33ca0-b266-48bb-bb22-f8ce3b26a294', holes: 9,  par: BRISAS_SD.sur,   esum: 36 }, // 2024-02-25 Sur-Este
  { id: '977a5c48-064d-47e2-9425-8f4a4f13ef5c', holes: 9,  par: BRISAS_SD.norte, esum: 36 }, // 2024-02-25 Norte-Este
  { id: '1e707061-9370-45c6-b199-04b4bbd8e3e7', holes: 9,  par: BRISAS_SD.sur,   esum: 36 }, // 2024-12-14 Sur-Este
  { id: '0b6f2e35-6e81-4523-bc3a-eb1755df7149', holes: 9,  par: BRISAS_SD.norte, esum: 36 }, // 2024-12-28 Norte-Este
  { id: 'f97511a6-96e0-4df6-94f3-951c6abb8bba', holes: 9,  par: BRISAS_SD.sur,   esum: 36 }, // 2024-12-28 Sur-Este
  { id: '7d8853e1-ce8a-4c5a-aa23-532fbe2f1a99', holes: 9,  par: BRISAS_SD.sur,   esum: 36 }, // 2024-12-28 Sur-Este
  { id: 'cd720a0a-4c89-4da3-b248-c8142d65ceac', holes: 9,  par: BRISAS_SD.norte, esum: 36 }, // 2025-02-12 Norte-Este
  { id: '9ca0de2b-7b25-42ad-864d-14338d60e2bf', holes: 9,  par: BRISAS_SD.norte, esum: 36 }, // 2025-02-13 Norte-Este
  { id: '27ff6244-ea89-4935-af92-b63f82ee1dcc', holes: 9,  par: BRISAS_SD.sur,   esum: 36 }, // 2025-08-16 Sur-Este
  { id: '772edd6e-5ee9-4076-8c19-86ff6a7e975d', holes: 9,  par: BRISAS_SD.sur,   esum: 36 }, // 2025-09-19 Sur-Este
  { id: '21b43ffc-6b37-45e0-bda8-860cc06b80ef', holes: 9,  par: BRISAS_SD.sur,   esum: 36 }, // 2025-09-20 Sur-Este
  { id: 'f913b438-62ad-4a62-98ef-4bb22b8c568a', holes: 9,  par: BRISAS_SD.norte, esum: 36 }, // 2025-12-13 Norte-Sur (front=Norte; Norte≡Sur)
  { id: 'eb565c58-f18c-4616-92dc-9c5b42b5858b', holes: 9,  par: BRISAS_SD.norte, esum: 36 }, // 2026-01-03 Norte-Este
  // ── Juanjo — Las Brisas SD 18h Norte-Sur ──
  { id: 'e4ce4a43-41ac-4a52-b267-f26d21398512', holes: 18, par: [...BRISAS_SD.norte, ...BRISAS_SD.sur], esum: 72 }, // 2025-02-22
  // ── Juanjo — Rocas SD 18h Roja-Azul ──
  { id: 'c02396ac-c7d5-496e-b0d8-92e8915e3866', holes: 18, par: [...ROCAS_SD.roja, ...ROCAS_SD.azul], esum: 72 },   // 2025-09-17
  // ── Juanjo — canchas fuera de catálogo (18h) ──
  { id: '3432f884-a9ba-40c9-b636-0ddba924167e', holes: 18, par: LIMA_GC,     esum: 71 }, // 2025-11-21 Lima Golf Club
  { id: '2a9e45c4-4e93-4d67-bdf2-2db14ba9b1fa', holes: 18, par: LA_PLANICIE, esum: 72 }, // 2025-11-22 Country Club La Planicie
  { id: '85fe015d-63be-4ad8-b15c-07e57c330349', holes: 18, par: GAVEA,       esum: 69 }, // 2025-12-02 Gávea Golf
  // ── Juanjo — photo_scan Las Brisas SD sin recorrido en el nombre. El re-scan
  //    (import_job c6445242, nunca aplicado) capturó el par de la tarjeta: front
  //    Norte/Sur + back Este ⇒ recorrido {Sur|Norte}-Este. Par = [...Sur,...Este]
  //    coincide EXACTO con el par escaneado. Se corrige el nombre a "~ Sur-Este".
  { id: '33f3124f-fdc3-407c-977d-1bc017b2396e', holes: 18, par: [...BRISAS_SD.sur, ...BRISAS_SD.este], esum: 72, courseName: `${BRISAS_NAME} ~ Sur-Este` }, // 2025-04-19

  // ── ruiz (usuario real) — todas photo_scan; par del scan cuando es coherente,
  //    catálogo/investigación cuando el scan fue basura. ──
  // Lima y La Planicie: el scan leyó par sum=78 (imposible) idéntico en ambas →
  // basura; se usa el par investigado (mismas canchas que Juanjo, par 71/72).
  { id: 'd15a9521-13d3-47d9-97f6-8cf28b478917', holes: 18, par: LIMA_GC,     esum: 71 }, // 2025-11-21 Lima Golf Club
  { id: 'f9b4a94d-02d6-4f69-9d8d-b6c0d4bf5469', holes: 18, par: LA_PLANICIE, esum: 72 }, // 2025-11-22 Country Club La Planicie
  // Brisas: scan = [...Norte,...Sur] exacto ⇒ recorrido Norte-Sur. Se corrige nombre.
  { id: 'a2fdf3d1-ab89-4d85-bea2-1f5741c3a520', holes: 18, par: [...BRISAS_SD.norte, ...BRISAS_SD.sur], esum: 72, courseName: `${BRISAS_NAME} ~ Norte-Sur` }, // 2026-01-10
  // Prince of Wales y Polo San Cristóbal: el scan coincidió EXACTO con FedeGolf VARONES.
  { id: 'b3b7184d-d187-4e7e-9d32-570926bf2f1f', holes: 18, par: PRINCE_WALES, esum: 72 }, // 2025-11-27 Prince of Wales
  { id: '6f6324a3-490d-4e5c-b268-3412e667b83a', holes: 18, par: POLO_SC,      esum: 72 }, // 2025-12-24 Polo San Cristóbal
]

function scoresCount(s) {
  if (Array.isArray(s)) return s.filter(v => typeof v === 'number' && v > 0).length
  if (s && typeof s === 'object') return Object.values(s).filter(v => typeof v === 'number' && v > 0).length
  return 0
}
function parCount(p) {
  if (Array.isArray(p)) return p.filter(v => typeof v === 'number' && v > 0).length
  if (p && typeof p === 'object') return Object.values(p).filter(v => typeof v === 'number' && v > 0).length
  return 0
}
function isCanonicalObject(p) {
  return !!p && typeof p === 'object' && !Array.isArray(p) && parCount(p) > 0
}
function toObject(arr) {
  return Object.fromEntries(arr.map((p, i) => [String(i + 1), p]))
}

const ids = TARGETS.map(t => t.id)
if (new Set(ids).size !== ids.length) { console.error('IDs duplicados en TARGETS'); process.exit(1) }
const { data: rows, error } = await sb.from('historical_rounds')
  .select('id, course_name, holes_played, scores, par_per_hole, user_id')
  .in('id', ids)
if (error) { console.error(error); process.exit(1) }
const byId = Object.fromEntries(rows.map(r => [r.id, r]))

console.log(`Modo: ${APPLY ? 'APPLY (escribe)' : 'DRY-RUN (no escribe)'}`)
console.log(`Targets: ${TARGETS.length}\n`)

let willWrite = 0, repaired = 0, skipCanonical = 0, errors = 0
for (const t of TARGETS) {
  const r = byId[t.id]
  if (!r) { console.log(`✘ NO EXISTE ${t.id}`); errors++; continue }
  const tag = `${r.course_name} | ${t.holes}h | ${t.id.slice(0,8)}`

  // safety: ya tiene par en forma de OBJETO canónico → no tocar
  if (isCanonicalObject(r.par_per_hole)) { console.log(`• YA TIENE PAR (objeto canónico, skip): ${tag}`); skipCanonical++; continue }
  const wasArray = Array.isArray(r.par_per_hole) && parCount(r.par_per_hole) > 0

  // safety: el par declarado es coherente ANTES de mirar la fila (independiente de esum)
  if (t.par.length !== t.holes) { console.log(`✘ par.length=${t.par.length} ≠ holes=${t.holes}: ${tag}`); errors++; continue }
  if (sum(t.par) !== t.esum) { console.log(`✘ sum(par)=${sum(t.par)} ≠ esum declarado=${t.esum} (typo en par): ${tag}`); errors++; continue }
  // safety: holes_played de la fila calza
  if ((r.holes_played || 0) !== t.holes) { console.log(`✘ holes_played=${r.holes_played} ≠ ${t.holes}: ${tag}`); errors++; continue }
  // safety: cantidad de scores == cantidad de pares
  const sc = scoresCount(r.scores)
  if (sc !== t.par.length) { console.log(`✘ scoresN=${sc} ≠ par.length=${t.par.length}: ${tag}`); errors++; continue }

  const parObj = toObject(t.par)
  const payload = { par_per_hole: parObj }
  const renaming = t.courseName && t.courseName !== r.course_name
  if (renaming) payload.course_name = t.courseName
  const renameNote = renaming ? ` | nombre → "${t.courseName}"` : ''
  if (APPLY) {
    const { error: upErr } = await sb.from('historical_rounds').update(payload).eq('id', t.id)
    if (upErr) { console.log(`✘ UPDATE falló: ${tag} → ${upErr.message}`); errors++; continue }
    console.log(`${wasArray ? '✔ REPARADO (array→objeto)' : '✔ ESCRITO'} par(sum ${t.esum}): ${tag}${renameNote}`)
  } else {
    console.log(`${wasArray ? '→ repararía (array→objeto)' : '→ escribiría'} par(sum ${t.esum}) obj={"1":${t.par[0]},…}: ${tag}${renameNote}`)
  }
  wasArray ? repaired++ : willWrite++
}

console.log(`\nResumen: ${willWrite} ${APPLY?'nuevas escritas':'nuevas a escribir'}, ${repaired} ${APPLY?'reparadas array→objeto':'a reparar array→objeto'}, ${skipCanonical} ya en objeto canónico, ${errors} con problema`)
if (!APPLY) console.log('Para aplicar: agregá --apply')
process.exitCode = errors ? 1 : 0
