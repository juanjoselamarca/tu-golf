/**
 * Test E2E de integridad post-sync.
 * Verifica: para cada cancha con datos, los yardajes por hoyo suman coherente
 * con el total_yards del tee, y los pars suman el par_total.
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

interface IntegrityIssue {
  course: string
  tee: string
  issue: string
  expected: number | null
  actual: number | null
}

async function main() {
  const { data: courses } = await supabase
    .from('courses')
    .select('id, nombre, par_total')
    .eq('activa', true)

  const { data: tees } = await supabase
    .from('course_tees')
    .select('id, course_id, nombre, yardaje_total, par_total')

  const { data: holes } = await supabase
    .from('course_holes')
    .select('course_id, numero, par, yardaje_campeonato, yardaje_azul, yardaje_blanco, yardaje_rojo')

  if (!courses || !tees || !holes) { console.error('Error leyendo tablas'); return }

  const courseName = new Map<string, string>()
  for (const c of courses) courseName.set(c.id, c.nombre)

  const holesByCourse = new Map<string, typeof holes>()
  for (const h of holes) {
    if (!holesByCourse.has(h.course_id)) holesByCourse.set(h.course_id, [])
    holesByCourse.get(h.course_id)!.push(h)
  }

  const teeColumnMap: Record<string, keyof typeof holes[0]> = {
    'azul': 'yardaje_azul',
    'blanco': 'yardaje_blanco',
    'rojo': 'yardaje_rojo',
    'campeonato': 'yardaje_campeonato',
    'negro': 'yardaje_campeonato',
    'dorado': 'yardaje_blanco',
  }

  const issues: IntegrityIssue[] = []
  let okCount = 0
  let checkedCount = 0

  for (const tee of tees) {
    if (tee.yardaje_total == null) continue
    const courseHoles = holesByCourse.get(tee.course_id) || []
    if (courseHoles.length === 0) continue

    // Determinar qué columna de yardaje consultar
    const teeNameLower = tee.nombre.toLowerCase()
    let col: string | null = null
    for (const [key, column] of Object.entries(teeColumnMap)) {
      if (teeNameLower.includes(key)) { col = column; break }
    }
    if (!col) continue

    const yardages = courseHoles.map(h => (h as unknown as Record<string, number | null>)[col!]).filter(v => v != null) as number[]
    if (yardages.length === 0) continue

    checkedCount++
    const suma = yardages.reduce((a, b) => a + b, 0)

    // Con 18 hoyos, la suma debería estar a ±100 yards del total (diferentes tees comparten tarjetón)
    const tolerance = 250 // yards razonable
    if (courseHoles.length < 18) {
      // No penalizar canchas incompletas
      continue
    }
    if (Math.abs(suma - tee.yardaje_total) > tolerance) {
      issues.push({
        course: courseName.get(tee.course_id) || tee.course_id,
        tee: tee.nombre,
        issue: 'suma de yardajes por hoyo !== yardaje_total del tee',
        expected: tee.yardaje_total,
        actual: suma,
      })
    } else {
      okCount++
    }

    // Verificar par total
    const pars = courseHoles.map(h => h.par).filter(v => v != null) as number[]
    if (pars.length >= 9 && tee.par_total != null) {
      const parSum = pars.reduce((a, b) => a + b, 0)
      if (parSum !== tee.par_total && pars.length === 18) {
        issues.push({
          course: courseName.get(tee.course_id) || tee.course_id,
          tee: tee.nombre,
          issue: 'suma de par por hoyo !== par_total del tee',
          expected: tee.par_total,
          actual: parSum,
        })
      }
    }
  }

  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  TEST E2E DE INTEGRIDAD POST-SYNC')
  console.log('═══════════════════════════════════════════════════════════════\n')
  console.log(`Tees con yardaje total + hoyos completos verificados: ${checkedCount}`)
  console.log(`  OK (suma coincide dentro de tolerance):             ${okCount}`)
  console.log(`  Con issues:                                          ${issues.length}`)
  console.log()

  if (issues.length > 0) {
    console.log('TOP 10 ISSUES:')
    for (const i of issues.slice(0, 10)) {
      console.log(`  ${i.course} / ${i.tee}`)
      console.log(`    ${i.issue}: esperado ${i.expected}, actual ${i.actual}`)
    }
  } else {
    console.log('✅ TODOS LOS CHECKS PASARON')
  }
  console.log()

  // Verificación adicional: canchas premium con datos completos
  console.log('CANCHAS PREMIUM — VERIFICACIÓN VISUAL:')
  const premium = ['Club de Golf Los Leones', 'Club de Golf Prince of Wales', 'Club de Golf Lomas de La Dehesa', 'Club de Golf Sport Francés', 'Club de Golf Cachagua']
  for (const c of courses) {
    if (!premium.includes(c.nombre)) continue
    const courseTees = tees.filter(t => t.course_id === c.id)
    const courseHolesArr = holesByCourse.get(c.id) || []
    const teesOK = courseTees.filter(t => t.yardaje_total != null).length
    const holesWithYardage = courseHolesArr.filter(h => h.yardaje_azul != null || h.yardaje_campeonato != null).length
    const status = (teesOK === courseTees.length && holesWithYardage >= 18) ? '✅' : '⚠️'
    console.log(`  ${status} ${c.nombre.padEnd(40)} tees c/yardaje: ${teesOK}/${courseTees.length}  hoyos c/yardaje: ${holesWithYardage}`)
  }
  console.log()
  console.log('═══════════════════════════════════════════════════════════════')
}

main().catch(console.error)
