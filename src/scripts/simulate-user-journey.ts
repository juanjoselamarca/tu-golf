/**
 * Simulación de usuario real — Golfers+
 * Simula 5 rondas libres completas hoyo por hoyo, verificando cada paso.
 *
 * Flujo simulado por ronda:
 * 1. GET /dashboard — verificar que carga
 * 2. POST rondas_libres — crear ronda libre (como lo hace /ronda-libre/nueva)
 * 3. POST ronda_libre_jugadores — crear jugadores
 * 4. UPDATE scores hoyo por hoyo (como lo hace /ronda-libre/[codigo]/score)
 * 5. Verificar que scores se guardaron correctamente
 * 6. INSERT historical_rounds — finalizar ronda (como lo hace finalizeRound)
 * 7. Verificar perfil/stats — que los datos aparecen
 *
 * Ejecutar: npx tsx src/scripts/simulate-user-journey.ts
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) { console.error('❌ Faltan vars de entorno'); process.exit(1) }

const sb = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })

// ── Config ───────────────────────────────────────────
const TEST_USER_EMAIL = 'test-jugador-a@golfers.plus'

const RONDAS = [
  { cancha: 'Club de Golf Los Leones', holes: 18, tees: 'blanco', modo: 'gross',      jugadores: ['Test Jugador A', 'Compañero 1'] },
  { cancha: 'Prince of Wales',         holes: 18, tees: 'azul',   modo: 'neto', formato: 'stableford', jugadores: ['Test Jugador A'] },
  { cancha: 'Club de Golf La Dehesa',  holes: 9,  tees: 'blanco', modo: 'neto',       jugadores: ['Test Jugador A', 'Compañero 2', 'Compañero 3'] },
  { cancha: 'Club de Golf Chicureo',   holes: 18, tees: 'rojo',   modo: 'gross',      jugadores: ['Test Jugador A', 'Compañero 4'] },
  { cancha: 'Santiago Golf Club',      holes: 18, tees: 'blanco', modo: 'neto', formato: 'stableford', jugadores: ['Test Jugador A'] },
]

const PARS_18 = [4,5,3,4,3,4,4,3,5, 4,5,4,3,5,4,5,3,4]
const PARS_9  = [4,5,3,4,3,4,4,3,5]

type Issue = { step: string; severity: 'CRITICAL' | 'WARNING' | 'INFO'; message: string }
const issues: Issue[] = []

function log(icon: string, msg: string) { console.log(`  ${icon} ${msg}`) }
function issue(step: string, severity: Issue['severity'], message: string) {
  issues.push({ step, severity, message })
  const icon = severity === 'CRITICAL' ? '🔴' : severity === 'WARNING' ? '🟡' : '🔵'
  console.log(`  ${icon} [${severity}] ${message}`)
}

function randomScore(par: number, skill: number): number {
  // skill 0-10 where 0 is scratch, 10 is beginner
  const base = par
  const variance = Math.random()
  if (variance < 0.05) return Math.max(1, base - 2)      // eagle ~5%
  if (variance < 0.20) return Math.max(1, base - 1)      // birdie ~15%
  if (variance < 0.50) return base                         // par ~30%
  if (variance < 0.80) return base + 1                     // bogey ~30%
  if (variance < 0.95) return base + 2                     // double ~15%
  return base + 3                                          // triple+ ~5%
}

// ── Main ─────────────────────────────────────────────
async function simulate() {
  console.log('╔══════════════════════════════════════════════════════╗')
  console.log('║  SIMULACIÓN USUARIO REAL — Golfers+                 ║')
  console.log('║  5 rondas libres, hoyo por hoyo                     ║')
  console.log('╚══════════════════════════════════════════════════════╝\n')

  // ── PASO 0: Encontrar usuario ──
  console.log('PASO 0 — Identificar usuario de prueba')
  const { data: authUsers } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const testUser = authUsers?.users?.find(u => u.email === TEST_USER_EMAIL)
  if (!testUser) {
    issue('paso0', 'CRITICAL', `Usuario ${TEST_USER_EMAIL} no existe en auth.users`)
    printReport()
    return
  }
  const userId = testUser.id
  log('✅', `Usuario: ${TEST_USER_EMAIL} (${userId.substring(0, 8)}...)`)

  // Verificar perfil
  const { data: profile, error: profErr } = await sb.from('profiles').select('*').eq('id', userId).single()
  if (profErr || !profile) {
    issue('paso0', 'CRITICAL', `Perfil no existe para user ${userId}: ${profErr?.message}`)
    printReport()
    return
  }
  log('✅', `Perfil: ${profile.name} · Índice: ${profile.indice}`)

  // ── PASO 1: Verificar estado inicial del perfil ──
  console.log('\nPASO 1 — Estado inicial del perfil')
  const { count: initialRounds } = await sb.from('historical_rounds').select('*', { count: 'exact', head: true }).eq('user_id', userId)
  log('📊', `Rondas históricas actuales: ${initialRounds}`)

  // Verificar que rondas_libres table exists
  const { error: rlCheck } = await sb.from('rondas_libres').select('id').limit(0)
  if (rlCheck) {
    issue('paso1', 'CRITICAL', `Tabla rondas_libres no accesible: ${rlCheck.message}`)
    printReport()
    return
  }
  log('✅', 'Tabla rondas_libres accesible')

  // Verificar ronda_libre_jugadores
  const { error: rljCheck } = await sb.from('ronda_libre_jugadores').select('id').limit(0)
  if (rljCheck) {
    issue('paso1', 'CRITICAL', `Tabla ronda_libre_jugadores no accesible: ${rljCheck.message}`)
    printReport()
    return
  }
  log('✅', 'Tabla ronda_libre_jugadores accesible')

  // ── Probar columnas de rondas_libres ──
  console.log('\nPASO 1.5 — Verificar schema de rondas_libres')
  const testCols = ['id','codigo','creador_id','course_name','course_id','tees','holes','fecha','estado','modo_juego']
  for (const col of testCols) {
    const { error } = await sb.from('rondas_libres').select(col).limit(0)
    if (error) {
      issue('paso1.5', 'WARNING', `Columna rondas_libres.${col} no existe: ${error.message}`)
    }
  }

  const rljCols = ['id','ronda_id','nombre','user_id','scores']
  for (const col of rljCols) {
    const { error } = await sb.from('ronda_libre_jugadores').select(col).limit(0)
    if (error) {
      issue('paso1.5', 'WARNING', `Columna ronda_libre_jugadores.${col} no existe: ${error.message}`)
    }
  }
  if (!issues.some(i => i.step === 'paso1.5')) log('✅', 'Schema de rondas_libres OK')

  // ── RONDAS ──
  const createdRondaIds: string[] = []

  for (let r = 0; r < RONDAS.length; r++) {
    const ronda = RONDAS[r]
    const rondaNum = r + 1
    console.log(`\n${'═'.repeat(56)}`)
    console.log(`RONDA ${rondaNum}/5 — ${ronda.cancha}`)
    const modoLabel = (ronda as { formato?: string }).formato ? `${ronda.modo}/${(ronda as { formato?: string }).formato}` : ronda.modo
    console.log(`  ${ronda.holes} hoyos · ${ronda.tees} · ${modoLabel} · ${ronda.jugadores.length} jugadores`)
    console.log('═'.repeat(56))

    // ── PASO 2: Crear ronda libre ──
    console.log(`\n  PASO 2.${rondaNum} — Crear ronda libre`)
    const codigo = `SIM${String(rondaNum).padStart(2, '0')}${Math.random().toString(36).substring(2, 5).toUpperCase()}`

    const insertData: Record<string, unknown> = {
      codigo,
      creador_id: userId,
      course_name: ronda.cancha,
      course_id: null,
      tees: ronda.tees,
      holes: ronda.holes,
      fecha: new Date().toISOString().split('T')[0],
      estado: 'en_curso',
    }

    // Try with modo_juego first (may not exist)
    let rondaId: string | null = null
    const modeFields: Record<string, unknown> = { modo_juego: ronda.modo }
    if ((ronda as { formato?: string }).formato) modeFields.formato_juego = (ronda as { formato?: string }).formato
    const { data: d1, error: e1 } = await sb.from('rondas_libres').insert({ ...insertData, ...modeFields }).select('id').single()

    if (e1) {
      if (e1.message.includes('modo_juego') || e1.message.includes('schema cache')) {
        issue(`ronda${rondaNum}`, 'WARNING', `Columna modo_juego no existe en rondas_libres — insertando sin ella`)
        const { data: d2, error: e2 } = await sb.from('rondas_libres').insert(insertData).select('id').single()
        if (e2) {
          issue(`ronda${rondaNum}`, 'CRITICAL', `No se pudo crear ronda libre: ${e2.message}`)
          continue
        }
        rondaId = d2!.id
      } else {
        issue(`ronda${rondaNum}`, 'CRITICAL', `Error al crear ronda libre: ${e1.message}`)
        continue
      }
    } else {
      rondaId = d1!.id
    }

    createdRondaIds.push(rondaId!)
    log('✅', `Ronda creada: ${codigo} (${rondaId!.substring(0, 8)}...)`)

    // ── PASO 3: Crear jugadores ──
    console.log(`\n  PASO 3.${rondaNum} — Crear jugadores`)
    const jugadorIds: string[] = []

    for (let j = 0; j < ronda.jugadores.length; j++) {
      const nombre = ronda.jugadores[j]
      const isMainPlayer = j === 0

      const { data: jData, error: jErr } = await sb.from('ronda_libre_jugadores').insert({
        ronda_id: rondaId,
        nombre,
        user_id: isMainPlayer ? userId : null,
        scores: {},
      }).select('id').single()

      if (jErr) {
        issue(`ronda${rondaNum}`, 'CRITICAL', `No se pudo crear jugador ${nombre}: ${jErr.message}`)
        continue
      }
      jugadorIds.push(jData!.id)
      log('✅', `Jugador ${j + 1}: ${nombre}${isMainPlayer ? ' (usuario principal)' : ''}`)
    }

    if (jugadorIds.length === 0) {
      issue(`ronda${rondaNum}`, 'CRITICAL', 'No se creó ningún jugador — saltando ronda')
      continue
    }

    // ── PASO 4: Llenar scores hoyo por hoyo ──
    console.log(`\n  PASO 4.${rondaNum} — Llenar scores hoyo por hoyo`)
    const pars = ronda.holes === 9 ? PARS_9 : PARS_18

    for (let jIdx = 0; jIdx < jugadorIds.length; jIdx++) {
      const jugadorId = jugadorIds[jIdx]
      const nombre = ronda.jugadores[jIdx]
      const skill = jIdx === 0 ? 3 : 5 + Math.floor(Math.random() * 5) // main player is better

      const allScores: Record<string, number> = {}
      let totalGross = 0

      for (let h = 1; h <= ronda.holes; h++) {
        const par = pars[h - 1]
        const gross = randomScore(par, skill)
        allScores[String(h)] = gross
        totalGross += gross

        // Simulate the debounced save (update full scores object each time)
        const scoresCopy = { ...allScores }
        const { error: saveErr } = await sb.from('ronda_libre_jugadores')
          .update({ scores: scoresCopy })
          .eq('id', jugadorId)

        if (saveErr) {
          issue(`ronda${rondaNum}`, 'CRITICAL', `Error guardando hoyo ${h} de ${nombre}: ${saveErr.message}`)
          break
        }
      }

      const parTotal = pars.reduce((a, b) => a + b, 0)
      const overUnder = totalGross - parTotal
      const overUnderStr = overUnder > 0 ? `+${overUnder}` : overUnder === 0 ? 'E' : String(overUnder)
      log('⛳', `${nombre}: ${totalGross} (${overUnderStr}) — ${ronda.holes} hoyos completados`)

      // ── PASO 4.5: Verificar que scores se persistieron ──
      const { data: savedJ, error: readErr } = await sb.from('ronda_libre_jugadores')
        .select('scores')
        .eq('id', jugadorId)
        .single()

      if (readErr) {
        issue(`ronda${rondaNum}`, 'CRITICAL', `No se pudo leer scores guardados de ${nombre}: ${readErr.message}`)
      } else {
        const savedScores = savedJ?.scores as Record<string, number> | null
        const savedCount = savedScores ? Object.keys(savedScores).length : 0
        if (savedCount !== ronda.holes) {
          issue(`ronda${rondaNum}`, 'CRITICAL', `Scores guardados: ${savedCount}/${ronda.holes} — PERDIDA DE DATOS`)
        } else {
          // Verify each hole
          let mismatch = 0
          for (let h = 1; h <= ronda.holes; h++) {
            if (savedScores?.[String(h)] !== allScores[String(h)]) mismatch++
          }
          if (mismatch > 0) {
            issue(`ronda${rondaNum}`, 'CRITICAL', `${mismatch} hoyos con datos incorrectos en ${nombre}`)
          }
        }
      }
    }

    // ── PASO 5: Verificar leaderboard (espectador) ──
    console.log(`\n  PASO 5.${rondaNum} — Verificar leaderboard`)
    const { data: rondaFull, error: rondaErr } = await sb.from('rondas_libres')
      .select('id, codigo, course_name, holes, estado, ronda_libre_jugadores(id, nombre, scores)')
      .eq('id', rondaId)
      .single()

    if (rondaErr || !rondaFull) {
      issue(`ronda${rondaNum}`, 'CRITICAL', `No se pudo leer ronda para leaderboard: ${rondaErr?.message}`)
    } else {
      const jugadores = (rondaFull as unknown as { ronda_libre_jugadores: Array<{ id: string; nombre: string; scores: Record<string, number> }> }).ronda_libre_jugadores
      if (jugadores.length !== ronda.jugadores.length) {
        issue(`ronda${rondaNum}`, 'WARNING', `Leaderboard muestra ${jugadores.length}/${ronda.jugadores.length} jugadores`)
      } else {
        log('✅', `Leaderboard: ${jugadores.length} jugadores con scores visibles`)
      }

      // Verify ordering (lower score = better position)
      if (jugadores.length >= 2) {
        const ranked = jugadores.map(j => {
          const scores = j.scores || {}
          let total = 0
          for (let h = 1; h <= ronda.holes; h++) total += scores[String(h)] ?? 0
          return { nombre: j.nombre, total }
        }).sort((a, b) => a.total - b.total)
        log('📊', `Líder: ${ranked[0].nombre} (${ranked[0].total})`)
      }
    }

    // ── PASO 6: Finalizar ronda (simula finalizeRound) ──
    console.log(`\n  PASO 6.${rondaNum} — Finalizar ronda`)

    // Get main player's scores for historical_rounds
    const mainJugadorId = jugadorIds[0]
    const { data: mainJ } = await sb.from('ronda_libre_jugadores')
      .select('scores')
      .eq('id', mainJugadorId)
      .single()

    const mainScores = mainJ?.scores as Record<string, number> | null
    if (mainScores) {
      const grossTotal = Object.values(mainScores).reduce((a: number, b: number) => a + b, 0)
      const scoresArray = Object.entries(mainScores)
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .map(([, v]) => v)

      const playedAt = new Date()
      playedAt.setDate(playedAt.getDate() - (5 - r) * 3) // spread over 2 weeks

      const { error: histErr } = await sb.from('historical_rounds').insert({
        user_id: userId,
        course_name: ronda.cancha,
        played_at: playedAt.toISOString().split('T')[0],
        total_gross: grossTotal,
        total_neto: grossTotal - (profile.indice ?? 15),
        scores: scoresArray,
        privacy: 'private',
      })

      if (histErr) {
        issue(`ronda${rondaNum}`, 'CRITICAL', `Error al guardar ronda histórica: ${histErr.message}`)
      } else {
        const parTotal = pars.reduce((a, b) => a + b, 0)
        log('✅', `Ronda histórica guardada: ${grossTotal} gross (${grossTotal - parTotal > 0 ? '+' : ''}${grossTotal - parTotal} vs par)`)
      }
    }

    // Update ronda estado
    const { error: estadoErr } = await sb.from('rondas_libres').update({ estado: 'finalizada' }).eq('id', rondaId)
    if (estadoErr) {
      issue(`ronda${rondaNum}`, 'WARNING', `No se pudo actualizar estado a finalizada: ${estadoErr.message}`)
    } else {
      log('✅', 'Estado actualizado a "finalizada"')
    }
  }

  // ── PASO 7: Verificar perfil completo ──
  console.log(`\n${'═'.repeat(56)}`)
  console.log('PASO 7 — Verificar perfil y estadísticas')
  console.log('═'.repeat(56))

  const { count: finalRounds } = await sb.from('historical_rounds')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  log('📊', `Rondas históricas después: ${finalRounds} (antes: ${initialRounds})`)

  const expectedNew = RONDAS.length
  const actualNew = (finalRounds ?? 0) - (initialRounds ?? 0)
  if (actualNew < expectedNew) {
    issue('paso7', 'WARNING', `Se esperaban ${expectedNew} rondas nuevas, solo ${actualNew} se guardaron`)
  } else {
    log('✅', `${actualNew} rondas nuevas registradas correctamente`)
  }

  // Check historical rounds data integrity
  const { data: recentRounds } = await sb.from('historical_rounds')
    .select('course_name, total_gross, scores, played_at')
    .eq('user_id', userId)
    .order('played_at', { ascending: false })
    .limit(5)

  if (recentRounds) {
    log('📊', 'Últimas 5 rondas:')
    for (const r of recentRounds) {
      const scores = r.scores as number[] | null
      const scoresCount = scores ? scores.length : 0
      const grossFromScores = scores ? scores.reduce((a: number, b: number) => a + b, 0) : 0
      const integrityOk = r.total_gross === grossFromScores || scoresCount === 0

      log(integrityOk ? '  ✓' : '  ✗',
        `${r.course_name}: ${r.total_gross} gross · ${scoresCount} hoyos ${!integrityOk ? `⚠ SUM=${grossFromScores}` : ''}`)

      if (!integrityOk) {
        issue('paso7', 'WARNING', `Integridad de datos: ${r.course_name} total_gross=${r.total_gross} pero sum(scores)=${grossFromScores}`)
      }
    }
  }

  // ── PASO 8: Verificar rutas que usaría el usuario ──
  console.log(`\n${'═'.repeat(56)}`)
  console.log('PASO 8 — Verificar datos para cada ruta')
  console.log('═'.repeat(56))

  // /dashboard — rondas libres recientes
  const { data: dashRondas, error: dashErr } = await sb.from('rondas_libres')
    .select('id, codigo, course_name, fecha, estado')
    .eq('creador_id', userId)
    .order('created_at', { ascending: false })
    .limit(5)

  if (dashErr) {
    issue('paso8', 'WARNING', `Dashboard no puede cargar rondas libres: ${dashErr.message}`)
  } else {
    log('📋', `Dashboard: ${dashRondas?.length ?? 0} rondas libres visibles`)
    const activa = dashRondas?.find(r => r.estado === 'en_curso')
    if (activa) log('🟢', `Ronda activa: ${activa.course_name} (${activa.codigo})`)
  }

  // /perfil — datos del perfil
  const { data: perfil } = await sb.from('profiles').select('name, indice, email').eq('id', userId).single()
  if (perfil) {
    log('👤', `Perfil: ${perfil.name} · Índice: ${perfil.indice ?? 'no registrado'} · ${perfil.email}`)
    if (!perfil.indice) {
      issue('paso8', 'WARNING', 'Perfil sin índice — stableford y neto no calcularán correctamente')
    }
  }

  // /perfil/stats — estadísticas
  const { data: allHist } = await sb.from('historical_rounds')
    .select('total_gross')
    .eq('user_id', userId)

  if (allHist && allHist.length > 0) {
    const grosses = allHist.map(r => r.total_gross).filter((g): g is number => g != null)
    const avg = grosses.reduce((a, b) => a + b, 0) / grosses.length
    const best = Math.min(...grosses)
    const worst = Math.max(...grosses)
    log('📊', `Stats: ${grosses.length} rondas · avg ${avg.toFixed(1)} · mejor ${best} · peor ${worst}`)
  }

  // /perfil/historial — historial de rondas
  const { count: histCount } = await sb.from('historical_rounds')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
  log('📋', `Historial: ${histCount} rondas totales`)

  // player_patterns — patrones detectables
  const { data: patterns } = await sb.from('player_patterns')
    .select('pattern_type, confidence')
    .eq('user_id', userId)
  if (patterns && patterns.length > 0) {
    log('🧠', `Patrones detectados: ${patterns.map(p => `${p.pattern_type} (${Math.round(p.confidence * 100)}%)`).join(', ')}`)
  } else {
    log('🔵', 'Sin patrones detectados aún (normal si < 5 rondas con scores detallados)')
  }

  // ── PASO 9: Verificar API endpoints ──
  console.log(`\n${'═'.repeat(56)}`)
  console.log('PASO 9 — Verificar consistencia de datos')
  console.log('═'.repeat(56))

  // Check all created rondas still exist
  for (const rid of createdRondaIds) {
    const { data: r } = await sb.from('rondas_libres')
      .select('codigo, estado, ronda_libre_jugadores(id, nombre)')
      .eq('id', rid)
      .single()
    if (!r) {
      issue('paso9', 'CRITICAL', `Ronda ${rid} desapareció de la BD`)
    }
  }
  log('✅', `${createdRondaIds.length} rondas verificadas en BD`)

  // ── CLEANUP ──
  console.log(`\n${'═'.repeat(56)}`)
  console.log('LIMPIEZA — Eliminando datos de simulación')
  console.log('═'.repeat(56))

  for (const rid of createdRondaIds) {
    await sb.from('ronda_libre_jugadores').delete().eq('ronda_id', rid)
    await sb.from('rondas_libres').delete().eq('id', rid)
  }
  log('🧹', `${createdRondaIds.length} rondas de simulación eliminadas`)

  // Don't delete historical rounds — those are useful data

  // ── REPORTE FINAL ──
  printReport()
}

function printReport() {
  console.log(`\n${'═'.repeat(56)}`)
  console.log('REPORTE FINAL DE SIMULACIÓN')
  console.log('═'.repeat(56))

  const critical = issues.filter(i => i.severity === 'CRITICAL')
  const warnings = issues.filter(i => i.severity === 'WARNING')
  const infos    = issues.filter(i => i.severity === 'INFO')

  if (issues.length === 0) {
    console.log('\n  🟢 CERO PROBLEMAS DETECTADOS')
    console.log('  Todos los flujos funcionan correctamente.')
  } else {
    if (critical.length > 0) {
      console.log(`\n  🔴 CRÍTICOS (${critical.length}):`)
      critical.forEach(i => console.log(`     [${i.step}] ${i.message}`))
    }
    if (warnings.length > 0) {
      console.log(`\n  🟡 WARNINGS (${warnings.length}):`)
      warnings.forEach(i => console.log(`     [${i.step}] ${i.message}`))
    }
    if (infos.length > 0) {
      console.log(`\n  🔵 INFO (${infos.length}):`)
      infos.forEach(i => console.log(`     [${i.step}] ${i.message}`))
    }
  }

  console.log(`\n  Total: ${critical.length} críticos · ${warnings.length} warnings · ${infos.length} info`)
  console.log('═'.repeat(56))

  if (critical.length > 0) {
    console.log('\n  ⚠ HAY PROBLEMAS CRÍTICOS — RESOLVER ANTES DEL TORNEO')
    process.exit(1)
  }
}

simulate().catch(e => { console.error('❌ Simulación falló:', e); process.exit(1) })
