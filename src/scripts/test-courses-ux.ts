/**
 * Test integral: 6 canchas × flujo completo de usuario
 * Simula crear ronda → llenar score hoyo a hoyo → verificar datos UI
 * Ejecutar: npx tsx src/scripts/test-courses-ux.ts
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const COURSES = [
  'Club de Golf Lomas de La Dehesa',
  'Club de Golf Los Leones',
  'Polo San Cristóbal',
  'Club de Golf Prince of Wales',
  'Club de Golf Sport Francés',
  'Club de Golf Mapocho',
]

async function test() {
  console.log('╔══════════════════════════════════════════════════════╗')
  console.log('║  TEST INTEGRAL — 6 canchas × flujo completo        ║')
  console.log('╚══════════════════════════════════════════════════════╝\n')

  // ── TEST 1: Integridad de datos ───────────────────────────
  console.log('TEST 1 — Integridad de datos por cancha\n')
  let dataIssues = 0

  for (const name of COURSES) {
    const { data: course } = await sb.from('courses').select('id, nombre, par_total, slope_rating, course_rating').eq('nombre', name).single()
    if (!course) { console.log('❌ ' + name + ': NO ENCONTRADO'); dataIssues++; continue }

    const { data: holes } = await sb.from('course_holes').select('numero, par, stroke_index, yardaje_campeonato, yardaje_azul, yardaje_blanco, yardaje_rojo').eq('course_id', course.id).order('numero')
    const { data: tees } = await sb.from('course_tees').select('nombre, yardaje_total, rating, slope').eq('course_id', course.id)

    const holeCount = holes?.length || 0
    const parSum = holes?.reduce((s, h) => s + h.par, 0) || 0
    const siValues = holes?.map(h => h.stroke_index).filter(v => v != null).sort((a, b) => (a as number) - (b as number)) as number[]
    const siComplete = siValues.length === 18 && siValues[0] === 1 && siValues[17] === 18
    const hasYardajes = holes?.every(h => h.yardaje_azul != null || h.yardaje_campeonato != null) || false
    const parOk = parSum === course.par_total

    if (holeCount !== 18 || !parOk || !siComplete || !hasYardajes) dataIssues++
    const icon = (holeCount === 18 && parOk && siComplete && hasYardajes) ? '✅' : '⚠️'

    console.log(`${icon} ${name}`)
    console.log(`  Hoyos: ${holeCount}/18 | Par: ${parSum}/${course.par_total}${parOk ? ' ✓' : ' ✗'}`)
    console.log(`  SI: ${siComplete ? '1-18 completo ✓' : 'INCOMPLETO ✗'}`)
    console.log(`  Yardajes: ${hasYardajes ? 'completos ✓' : 'FALTAN ✗'}`)
    console.log(`  Tees: ${tees?.length || 0} | CR: ${course.course_rating} | Slope: ${course.slope_rating}\n`)
  }

  // ── TEST 2: Simular flujo usuario ─────────────────────────
  console.log('TEST 2 — Simular crear ronda + llenar score\n')

  const { data: users } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const testUser = users?.users?.find(u => u.email === 'test-jugador-a@golfers.plus')
  if (!testUser) { console.log('❌ Test user not found'); return }

  const cleanup: Array<{ rondaId: string; jugadorId: string }> = []
  let flowIssues = 0

  for (const name of COURSES) {
    const { data: course } = await sb.from('courses').select('id, par_total').eq('nombre', name).single()
    if (!course) continue

    const { data: holes } = await sb.from('course_holes')
      .select('numero, par, stroke_index, yardaje_azul, yardaje_blanco')
      .eq('course_id', course.id).order('numero')
    if (!holes || holes.length !== 18) { flowIssues++; continue }

    // Step 1: Crear ronda (como /ronda-libre/nueva)
    const codigo = 'TX' + Math.random().toString(36).substring(2, 6).toUpperCase()
    const { data: ronda, error: rErr } = await sb.from('rondas_libres').insert({
      codigo, creador_id: testUser.id, course_id: course.id,
      course_name: name, tees: 'azul', holes: 18,
      fecha: new Date().toISOString().split('T')[0], estado: 'en_curso',
    }).select('id').single()

    if (rErr) { console.log(`❌ ${name} ronda: ${rErr.message}`); flowIssues++; continue }

    // Step 2: Crear jugador
    const { data: jugador, error: jErr } = await sb.from('ronda_libre_jugadores').insert({
      ronda_id: ronda!.id, nombre: 'Test Player', user_id: testUser.id, scores: {},
    }).select('id').single()

    if (jErr) { console.log(`❌ ${name} jugador: ${jErr.message}`); flowIssues++; continue }

    cleanup.push({ rondaId: ronda!.id, jugadorId: jugador!.id })

    // Step 3: Llenar score hoyo a hoyo (simula taps en +/-)
    const scores: Record<string, number> = {}
    let totalGross = 0, birdies = 0, pars = 0, bogeys = 0

    for (const hole of holes) {
      const r = Math.random()
      let gross: number
      if (r < 0.08) gross = hole.par - 2
      else if (r < 0.25) gross = hole.par - 1
      else if (r < 0.55) gross = hole.par
      else if (r < 0.80) gross = hole.par + 1
      else if (r < 0.95) gross = hole.par + 2
      else gross = hole.par + 3

      gross = Math.max(1, gross)
      scores[String(hole.numero)] = gross
      totalGross += gross

      const d = gross - hole.par
      if (d <= -1) birdies++
      else if (d === 0) pars++
      else bogeys++

      // Debounced save (every hole, like real app)
      await sb.from('ronda_libre_jugadores').update({ scores }).eq('id', jugador!.id)
    }

    // Step 4: Verificar persistencia
    const { data: saved } = await sb.from('ronda_libre_jugadores').select('scores').eq('id', jugador!.id).single()
    const savedCount = Object.keys(saved?.scores || {}).length
    const overUnder = totalGross - (course.par_total || 72)

    // Step 5: Verificar que la UI tendría toda la info necesaria
    const hoyo1 = holes[0]
    const hoyo18 = holes[17]

    const allGood = savedCount === 18
    if (!allGood) flowIssues++

    console.log(`${allGood ? '✅' : '❌'} ${name} (${codigo})`)
    console.log(`  Score: ${totalGross} (${overUnder >= 0 ? '+' : ''}${overUnder}) | 🐦${birdies} Par:${pars} Bog:${bogeys}`)
    console.log(`  Guardado: ${savedCount}/18 ${savedCount === 18 ? '✓' : '✗ PÉRDIDA DE DATOS'}`)
    console.log(`  UI hoyo 1: Par ${hoyo1.par} | HDCP ${hoyo1.stroke_index} | ${hoyo1.yardaje_azul || hoyo1.yardaje_blanco} yds`)
    console.log(`  UI hoyo 18: Par ${hoyo18.par} | HDCP ${hoyo18.stroke_index} | ${hoyo18.yardaje_azul || hoyo18.yardaje_blanco} yds\n`)
  }

  // ── TEST 3: Verificar que score page muestra todo ─────────
  console.log('TEST 3 — Datos para UI del score page\n')
  let uiIssues = 0

  for (const name of COURSES) {
    const { data: course } = await sb.from('courses').select('id').eq('nombre', name).single()
    if (!course) continue

    const { data: holes } = await sb.from('course_holes')
      .select('numero, par, stroke_index, yardaje_campeonato, yardaje_azul, yardaje_blanco, yardaje_rojo')
      .eq('course_id', course.id).order('numero')

    const issues: string[] = []
    for (const h of holes || []) {
      if (h.par == null) issues.push(`H${h.numero}: sin par`)
      if (h.stroke_index == null) issues.push(`H${h.numero}: sin HDCP`)
      if (!h.yardaje_azul && !h.yardaje_blanco && !h.yardaje_campeonato) issues.push(`H${h.numero}: sin yardaje`)
    }

    if (issues.length > 0) uiIssues++
    console.log(`${issues.length === 0 ? '✅' : '❌'} ${name}: ${issues.length === 0 ? 'Todo OK' : issues.join(', ')}`)
  }

  // ── TEST 4: Verificar autocomplete funciona ───────────────
  console.log('\nTEST 4 — Autocomplete de canchas\n')

  const { data: allCourses } = await sb.from('courses').select('id, nombre, ciudad').eq('activa', true).order('nombre')
  const withHoles = new Set<string>()
  for (const c of allCourses || []) {
    const { count } = await sb.from('course_holes').select('*', { count: 'exact', head: true }).eq('course_id', c.id)
    if ((count || 0) > 0) withHoles.add(c.id)
  }

  console.log(`  Total canchas activas: ${allCourses?.length}`)
  console.log(`  Con datos de hoyos: ${withHoles.size}`)
  console.log(`  Sin datos (solo nombre): ${(allCourses?.length || 0) - withHoles.size}`)

  // ── CLEANUP ───────────────────────────────────────────────
  console.log('\n🧹 Limpieza...')
  for (const { rondaId, jugadorId } of cleanup) {
    await sb.from('ronda_libre_jugadores').delete().eq('id', jugadorId)
    await sb.from('rondas_libres').delete().eq('id', rondaId)
  }
  console.log(`  ${cleanup.length} rondas de test eliminadas`)

  // ── REPORTE FINAL ─────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════╗')
  console.log(`║  RESULTADO: ${dataIssues + flowIssues + uiIssues === 0 ? '🟢 TODO OK' : '🔴 HAY PROBLEMAS'}`)
  console.log(`║  Datos: ${dataIssues} issues | Flujo: ${flowIssues} issues | UI: ${uiIssues} issues`)
  console.log('╚══════════════════════════════════════════════════════╝')

  if (dataIssues + flowIssues + uiIssues > 0) process.exit(1)
}

test().catch(e => { console.error('❌ Fatal:', e); process.exit(1) })
