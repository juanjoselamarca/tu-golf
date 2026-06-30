#!/usr/bin/env node
/**
 * scripts/backfill-pares-rondas-reales.mjs
 *
 * Backfill de `par_per_hole` en `historical_rounds` para rondas de USUARIOS REALES
 * que tienen score hoyo-a-hoyo pero NINGUNA fuente de par (par_per_hole vacío Y
 * course_holes ausente/vacío para su course_id). Sin par, el coach ve golpes pero
 * no calcula vs-par ni detecta patrones. Ver memoria project_backfill_pares_rondas_reales.
 *
 * FUENTE DE PAR (auditada 2026-06-30 contra el catálogo FedeGolf VARONES + loops
 * manuales verificados; el par NO depende del género, solo CR/slope):
 *
 *   Las Brisas de Santo Domingo (club FedeGolf 16) — loops de 9 hoyos:
 *     Este  = [5,3,4,4,5,4,3,4,4]  (sum 36)
 *     Norte = [4,4,4,3,5,4,3,5,4]  (sum 36)
 *     Sur   = [4,4,4,3,5,4,3,5,4]  (sum 36)   ← idéntico a Norte
 *   Verificado: las 6 combinaciones 18h VARONES (Este-Norte, Este-Sur, Norte-Este,
 *   Norte-Sur, Sur-Este, Sur-Norte) descomponen exactamente en estos nueves.
 *
 *   Rocas de Santo Domingo (club FedeGolf 17) — loops de 9 hoyos:
 *     Roja   = [4,4,5,4,4,3,5,3,4]  (sum 36)
 *     Azul   = [4,5,4,3,4,5,4,3,4]  (sum 36)
 *     Blanca = [4,4,3,5,4,4,4,3,5]  (sum 36)
 *   Verificado: combo "Roja-Azul" VARONES = Roja+Azul.
 *
 * CONVENCIÓN: una ronda de 9 hoyos sobre un layout 18h "A-B" = se jugó el NUEVE
 * DELANTERO (loop A). Confirmado porque estas rondas 9h traen el course_rating de
 * 18 hoyos (~73), es decir Garmin tenía cargado el layout 18h completo y el jugador
 * caminó la ida. Para "Sur-Este"/"Norte-Este" el par del nueve delantero (Sur/Norte)
 * difiere de Este; asumimos delantero (estándar de golf: se arranca en el hoyo 1).
 *
 * SEGURIDAD:
 *   - Solo toca los IDs pinneados abajo (auditados uno por uno).
 *   - NUNCA pisa un par_per_hole ya poblado.
 *   - Verifica contra la fila viva: course_name esperado, holes_played, y que la
 *     cantidad de scores coincida con la cantidad de pares. Si algo no calza, salta
 *     la ronda y lo reporta (no escribe).
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

// Rondas auditadas (19). expected = par_per_hole a escribir. holes = hoyos jugados.
const TARGETS = [
  // Las Brisas SD — 9h (nueve delantero)
  { id: '85ad1fdf-272d-400c-b1b2-aca151816812', holes: 9,  par: BRISAS_SD.sur },                     // 2019-12-31 Sur-Este
  { id: '221183e1-d679-485a-a52a-1a4a52fa0c39', holes: 9,  par: BRISAS_SD.norte },                   // 2020-01-02 Norte-Este
  { id: 'd405a40d-98ab-45ce-936d-871738b45252', holes: 9,  par: BRISAS_SD.norte },                   // 2023-12-29 Norte-Este
  { id: '9f59b424-a587-46b8-a18b-04ce91b3b29e', holes: 9,  par: BRISAS_SD.sur },                     // 2023-12-29 Sur-Este
  { id: 'a5c33ca0-b266-48bb-bb22-f8ce3b26a294', holes: 9,  par: BRISAS_SD.sur },                     // 2024-02-25 Sur-Este
  { id: '977a5c48-064d-47e2-9425-8f4a4f13ef5c', holes: 9,  par: BRISAS_SD.norte },                   // 2024-02-25 Norte-Este
  { id: '1e707061-9370-45c6-b199-04b4bbd8e3e7', holes: 9,  par: BRISAS_SD.sur },                     // 2024-12-14 Sur-Este
  { id: '0b6f2e35-6e81-4523-bc3a-eb1755df7149', holes: 9,  par: BRISAS_SD.norte },                   // 2024-12-28 Norte-Este
  { id: 'f97511a6-96e0-4df6-94f3-951c6abb8bba', holes: 9,  par: BRISAS_SD.sur },                     // 2024-12-28 Sur-Este
  { id: '7d8853e1-ce8a-4c5a-aa23-532fbe2f1a99', holes: 9,  par: BRISAS_SD.sur },                     // 2024-12-28 Sur-Este
  { id: 'cd720a0a-4c89-4da3-b248-c8142d65ceac', holes: 9,  par: BRISAS_SD.norte },                   // 2025-02-12 Norte-Este
  { id: '9ca0de2b-7b25-42ad-864d-14338d60e2bf', holes: 9,  par: BRISAS_SD.norte },                   // 2025-02-13 Norte-Este
  { id: '27ff6244-ea89-4935-af92-b63f82ee1dcc', holes: 9,  par: BRISAS_SD.sur },                     // 2025-08-16 Sur-Este
  { id: '772edd6e-5ee9-4076-8c19-86ff6a7e975d', holes: 9,  par: BRISAS_SD.sur },                     // 2025-09-19 Sur-Este
  { id: '21b43ffc-6b37-45e0-bda8-860cc06b80ef', holes: 9,  par: BRISAS_SD.sur },                     // 2025-09-20 Sur-Este
  { id: 'f913b438-62ad-4a62-98ef-4bb22b8c568a', holes: 9,  par: BRISAS_SD.norte },                   // 2025-12-13 Norte-Sur (front=Norte; Norte≡Sur)
  { id: 'eb565c58-f18c-4616-92dc-9c5b42b5858b', holes: 9,  par: BRISAS_SD.norte },                   // 2026-01-03 Norte-Este
  // Las Brisas SD — 18h Norte-Sur
  { id: 'e4ce4a43-41ac-4a52-b267-f26d21398512', holes: 18, par: [...BRISAS_SD.norte, ...BRISAS_SD.sur] }, // 2025-02-22
  // Rocas SD — 18h Roja-Azul
  { id: 'c02396ac-c7d5-496e-b0d8-92e8915e3866', holes: 18, par: [...ROCAS_SD.roja, ...ROCAS_SD.azul] },   // 2025-09-17
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

const ids = TARGETS.map(t => t.id)
const { data: rows, error } = await sb.from('historical_rounds')
  .select('id, course_name, holes_played, scores, par_per_hole, user_id')
  .in('id', ids)
if (error) { console.error(error); process.exit(1) }
const byId = Object.fromEntries(rows.map(r => [r.id, r]))

console.log(`Modo: ${APPLY ? 'APPLY (escribe)' : 'DRY-RUN (no escribe)'}`)
console.log(`Targets: ${TARGETS.length}\n`)

let willWrite = 0, skipExisting = 0, errors = 0
for (const t of TARGETS) {
  const r = byId[t.id]
  if (!r) { console.log(`✘ NO EXISTE ${t.id}`); errors++; continue }
  const tag = `${r.course_name} | ${t.holes}h | ${t.id.slice(0,8)}`
  // safety: ya tiene par
  if (parCount(r.par_per_hole) > 0) { console.log(`• YA TIENE PAR (skip): ${tag}`); skipExisting++; continue }
  // safety: holes_played calza
  if ((r.holes_played || 0) !== t.holes) { console.log(`✘ holes_played=${r.holes_played} ≠ ${t.holes}: ${tag}`); errors++; continue }
  // safety: cantidad de scores == cantidad de pares
  const sc = scoresCount(r.scores)
  if (sc !== t.par.length) { console.log(`✘ scoresN=${sc} ≠ par.length=${t.par.length}: ${tag}`); errors++; continue }
  // safety: par esperado coherente (9→36, 18→72)
  const sum = t.par.reduce((a,b)=>a+b,0)
  if ((t.holes===9 && sum!==36) || (t.holes===18 && sum!==72)) { console.log(`✘ sum par=${sum} incoherente: ${tag}`); errors++; continue }

  if (APPLY) {
    const { error: upErr } = await sb.from('historical_rounds').update({ par_per_hole: t.par }).eq('id', t.id)
    if (upErr) { console.log(`✘ UPDATE falló: ${tag} → ${upErr.message}`); errors++; continue }
    console.log(`✔ ESCRITO par(sum ${sum}): ${tag}`)
  } else {
    console.log(`→ escribiría par=${JSON.stringify(t.par)} (sum ${sum}): ${tag}`)
  }
  willWrite++
}

console.log(`\nResumen: ${willWrite} ${APPLY?'escritas':'a escribir'}, ${skipExisting} ya tenían par, ${errors} con problema`)
if (!APPLY) console.log('Para aplicar: agregá --apply')
