/**
 * Audit de cobertura de datos de canchas.
 * Cuenta cuántas canchas tienen datos completos vs parciales vs vacíos.
 * Output: reporte tabular para decidir siguiente paso del sync.
 *
 * Uso: npx tsx src/scripts/audit-courses-coverage.ts
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

function pct(n: number, total: number): string {
  if (total === 0) return '0%'
  return `${Math.round((n / total) * 100)}%`
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  AUDIT DE COBERTURA — CANCHAS EN PRODUCCIÓN')
  console.log('═══════════════════════════════════════════════════════════════\n')

  const { data: courses, error: cErr } = await supabase
    .from('courses')
    .select('id, nombre, pais, course_rating, slope_rating, par_total, fuente, fedegolf_club_id, parent_id, tipo_recorrido, activa')
    .order('nombre')
  if (cErr || !courses) return console.error('courses:', cErr?.message)

  console.log(`TOTAL CANCHAS: ${courses.length}`)
  console.log(`  activas: ${courses.filter(c => c.activa).length}`)
  console.log(`  tipo_recorrido completo: ${courses.filter(c => c.tipo_recorrido === 'completo').length}`)
  console.log(`  tipo_recorrido loop:     ${courses.filter(c => c.tipo_recorrido === 'loop').length}`)
  console.log(`  con parent_id:           ${courses.filter(c => c.parent_id).length}`)
  console.log()

  // Fuente de datos
  const byFuente: Record<string, number> = {}
  for (const c of courses) byFuente[c.fuente || 'null'] = (byFuente[c.fuente || 'null'] || 0) + 1
  console.log('Distribución por fuente:')
  for (const [f, n] of Object.entries(byFuente).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${f.padEnd(20)} ${n}`)
  }
  console.log()

  // Cobertura por país
  const byPais: Record<string, number> = {}
  for (const c of courses) byPais[c.pais || 'null'] = (byPais[c.pais || 'null'] || 0) + 1
  console.log('Distribución por país:')
  for (const [p, n] of Object.entries(byPais).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${p.padEnd(20)} ${n}`)
  }
  console.log()

  // Campos críticos en courses
  console.log('COURSES — campos a nivel cancha:')
  console.log(`  con course_rating:  ${courses.filter(c => c.course_rating != null).length}  (${pct(courses.filter(c => c.course_rating != null).length, courses.length)})`)
  console.log(`  con slope_rating:   ${courses.filter(c => c.slope_rating != null).length}  (${pct(courses.filter(c => c.slope_rating != null).length, courses.length)})`)
  console.log(`  con par_total:      ${courses.filter(c => c.par_total != null).length}  (${pct(courses.filter(c => c.par_total != null).length, courses.length)})`)
  console.log(`  con fedegolf_id:    ${courses.filter(c => c.fedegolf_club_id != null).length}  (${pct(courses.filter(c => c.fedegolf_club_id != null).length, courses.length)})`)
  console.log()

  const { data: tees, error: tErr } = await supabase
    .from('course_tees')
    .select('course_id, nombre, rating, slope, yardaje_total, par_total, genero, fuente')
  if (tErr || !tees) return console.error('course_tees:', tErr?.message)

  console.log(`COURSE_TEES (filas totales: ${tees.length}):`)
  console.log(`  con rating:        ${tees.filter(t => t.rating != null).length}  (${pct(tees.filter(t => t.rating != null).length, tees.length)})`)
  console.log(`  con slope:         ${tees.filter(t => t.slope != null).length}  (${pct(tees.filter(t => t.slope != null).length, tees.length)})`)
  console.log(`  con yardaje_total: ${tees.filter(t => t.yardaje_total != null).length}  (${pct(tees.filter(t => t.yardaje_total != null).length, tees.length)})`)
  console.log(`  con par_total:     ${tees.filter(t => t.par_total != null).length}  (${pct(tees.filter(t => t.par_total != null).length, tees.length)})`)
  console.log(`  con genero:        ${tees.filter(t => t.genero != null).length}  (${pct(tees.filter(t => t.genero != null).length, tees.length)})`)
  console.log()

  const teesByFuente: Record<string, number> = {}
  for (const t of tees) teesByFuente[t.fuente || 'null'] = (teesByFuente[t.fuente || 'null'] || 0) + 1
  console.log('  tees por fuente:')
  for (const [f, n] of Object.entries(teesByFuente).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${f.padEnd(20)} ${n}`)
  }
  console.log()

  const { data: holes, error: hErr } = await supabase
    .from('course_holes')
    .select('course_id, numero, par, stroke_index, yardaje_negras, yardaje_azul, yardaje_blanco, yardaje_rojo, recorrido')
  if (hErr || !holes) return console.error('course_holes:', hErr?.message)

  console.log(`COURSE_HOLES (filas totales: ${holes.length}):`)
  console.log(`  con par:            ${holes.filter(h => h.par != null).length}  (${pct(holes.filter(h => h.par != null).length, holes.length)})`)
  console.log(`  con stroke_index:   ${holes.filter(h => h.stroke_index != null).length}  (${pct(holes.filter(h => h.stroke_index != null).length, holes.length)})`)
  const hasAnyYard = holes.filter(h =>
    h.yardaje_negras != null || h.yardaje_azul != null ||
    h.yardaje_blanco != null || h.yardaje_rojo != null
  ).length
  console.log(`  con algún yardaje:  ${hasAnyYard}  (${pct(hasAnyYard, holes.length)})`)
  console.log(`    yardaje_negras: ${holes.filter(h => h.yardaje_negras != null).length}  (${pct(holes.filter(h => h.yardaje_negras != null).length, holes.length)})`)
  console.log(`    yardaje_azul:       ${holes.filter(h => h.yardaje_azul != null).length}  (${pct(holes.filter(h => h.yardaje_azul != null).length, holes.length)})`)
  console.log(`    yardaje_blanco:     ${holes.filter(h => h.yardaje_blanco != null).length}  (${pct(holes.filter(h => h.yardaje_blanco != null).length, holes.length)})`)
  console.log(`    yardaje_rojo:       ${holes.filter(h => h.yardaje_rojo != null).length}  (${pct(holes.filter(h => h.yardaje_rojo != null).length, holes.length)})`)
  console.log()

  // Cobertura por cancha
  interface CourseStats {
    name: string
    pais: string | null
    hoyos: number
    hoyosConPar: number
    hoyosConYardaje: number
    hoyosConSI: number
    tees: number
    teesCompletos: number
    teesConRating: number
    teesConSlope: number
    teesConYardaje: number
    fedegolf: boolean
    fuenteCourse: string | null
  }

  const stats = new Map<string, CourseStats>()
  for (const c of courses) {
    stats.set(c.id, {
      name: c.nombre,
      pais: c.pais,
      hoyos: 0, hoyosConPar: 0, hoyosConYardaje: 0, hoyosConSI: 0,
      tees: 0, teesCompletos: 0, teesConRating: 0, teesConSlope: 0, teesConYardaje: 0,
      fedegolf: c.fedegolf_club_id != null,
      fuenteCourse: c.fuente,
    })
  }

  for (const h of holes) {
    const s = stats.get(h.course_id); if (!s) continue
    s.hoyos++
    if (h.par != null) s.hoyosConPar++
    if (h.stroke_index != null) s.hoyosConSI++
    if (h.yardaje_negras != null || h.yardaje_azul != null || h.yardaje_blanco != null || h.yardaje_rojo != null) s.hoyosConYardaje++
  }
  for (const t of tees) {
    const s = stats.get(t.course_id); if (!s) continue
    s.tees++
    if (t.rating != null) s.teesConRating++
    if (t.slope != null) s.teesConSlope++
    if (t.yardaje_total != null) s.teesConYardaje++
    if (t.rating != null && t.slope != null && t.yardaje_total != null) s.teesCompletos++
  }

  let c100 = 0, cYardajes = 0, cSoloFG = 0, cVacio = 0
  const incomp: CourseStats[] = []
  stats.forEach((s) => {
    const hoyosOK = s.hoyos > 0 && s.hoyosConPar === s.hoyos
    const yardajeHoyosOK = s.hoyos > 0 && s.hoyosConYardaje === s.hoyos
    const teesOK = s.tees > 0 && s.teesConRating === s.tees && s.teesConSlope === s.tees
    const teesConYardajeOK = s.tees > 0 && s.teesConYardaje === s.tees
    if (hoyosOK && yardajeHoyosOK && teesOK && teesConYardajeOK) c100++
    else if (hoyosOK && teesOK && !yardajeHoyosOK) cSoloFG++
    else if (s.hoyos === 0 && s.tees === 0) cVacio++
    else { incomp.push(s); if (s.hoyosConYardaje > 0) cYardajes++ }
  })

  console.log('COBERTURA POR CANCHA')
  console.log(`  100% completas (CR+slope+yardaje cancha+por hoyo): ${c100}  (${pct(c100, courses.length)})`)
  console.log(`  Con pars+CR+slope pero sin yardajes:              ${cSoloFG}  (${pct(cSoloFG, courses.length)})`)
  console.log(`  Parciales (alguna cosa):                          ${incomp.length}  (${pct(incomp.length, courses.length)})`)
  console.log(`  Sin datos:                                        ${cVacio}  (${pct(cVacio, courses.length)})`)
  console.log()

  // Top canchas premium chilenas para verificar estado
  const criticas = ['Los Leones', 'Prince of Wales', 'Lomas de La Dehesa', 'Marbella', 'Brisas', 'Rocas de Santo Domingo', 'Santa Martina', 'Sport Francés', 'Polo', 'Cachagua', 'Papudo', 'Angostura']
  console.log('TOP CANCHAS CRÍTICAS CHILENAS:')
  stats.forEach((s) => {
    if (!criticas.some(c => s.name.toLowerCase().includes(c.toLowerCase()))) return
    const status =
      (s.hoyos > 0 && s.hoyosConPar === s.hoyos && s.hoyosConYardaje === s.hoyos && s.tees > 0 && s.teesCompletos === s.tees) ? '✅ 100%' :
      s.hoyos > 0 ? '⚠️ parcial' : '❌ vacía'
    console.log(`  ${status}  ${s.name.padEnd(45)} hoyos:${s.hoyosConYardaje}/${s.hoyos} · tees:${s.teesCompletos}/${s.tees} · FG:${s.fedegolf ? 'sí' : 'no'}`)
  })
  console.log()

  console.log('═══════════════════════════════════════════════════════════════')
}

main().catch(console.error)
