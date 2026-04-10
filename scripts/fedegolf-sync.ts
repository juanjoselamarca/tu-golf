/**
 * Script de sincronización de canchas desde fedegolf.cl
 *
 * Descarga todas las canchas federadas con slope/rating y las inserta
 * en Supabase. Diseñado para ejecución única o periódica.
 *
 * Uso: npx tsx scripts/fedegolf-sync.ts
 *
 * Requiere en .env.local:
 *   FEDEGOLF_RUT, FEDEGOLF_PASSWORD,
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Cargar .env.local desde la raíz del proyecto
config({ path: resolve(__dirname, '..', '.env.local') })

import { createClient } from '@supabase/supabase-js'
import { fedegolfLogin, fedegolfDownloadAll } from '../src/lib/fedegolf/client'
import type { FedegolfCourseData, FedegolfTeeInfo } from '../src/lib/fedegolf/types'

// ─── Validar env vars ────────────────────────────────────────────────

const FEDEGOLF_RUT = process.env.FEDEGOLF_RUT
const FEDEGOLF_PASSWORD = process.env.FEDEGOLF_PASSWORD
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!FEDEGOLF_RUT || !FEDEGOLF_PASSWORD) {
  console.error('❌ Faltan FEDEGOLF_RUT y/o FEDEGOLF_PASSWORD en .env.local')
  process.exit(1)
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

// Service role bypasses RLS
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// ─── Tipos de resultado ──────────────────────────────────────────────

interface SyncStats {
  nuevas: number
  actualizadas: number
  errores: number
  teesInsertados: number
}

// ─── Upsert de una cancha + tees ────────────────────────────────────

async function upsertCancha(
  data: FedegolfCourseData,
  canchaIndex: number
): Promise<'new' | 'updated' | 'error'> {
  const { club, canchas } = data
  const canchaData = canchas[canchaIndex]
  if (!canchaData.info) return 'error'

  const { info } = canchaData
  const canchaIdNumeric = parseInt(canchaData.cancha, 10)
  const nombreCurso = `${club.nombre} - ${info.nombre}`

  const courseRow = {
    nombre: nombreCurso,
    ciudad: '',
    pais: 'Chile',
    par_total: info.par,
    fuente: 'fedegolf',
    fuente_id: String(canchaData.cancha),
    activa: true,
    datos_verificados: true,
    tipo_recorrido: '18h',
    fedegolf_club_id: club.id,
    fedegolf_cancha_id: canchaIdNumeric,
    fedegolf_synced_at: new Date().toISOString(),
  }

  // Buscar si ya existe
  const { data: existing, error: findError } = await supabase
    .from('courses')
    .select('id')
    .eq('fedegolf_club_id', club.id)
    .eq('fedegolf_cancha_id', canchaIdNumeric)
    .maybeSingle()

  if (findError) {
    console.error(`  ❌ Error buscando curso ${nombreCurso}:`, findError.message)
    return 'error'
  }

  let courseId: string
  let isNew: boolean

  if (existing) {
    // UPDATE existente
    const { error: updateError } = await supabase
      .from('courses')
      .update(courseRow)
      .eq('id', existing.id)

    if (updateError) {
      console.error(`  ❌ Error actualizando ${nombreCurso}:`, updateError.message)
      return 'error'
    }

    // Borrar tees anteriores de fedegolf (no tocar los manuales)
    await supabase
      .from('course_tees')
      .delete()
      .eq('course_id', existing.id)
      .eq('fuente', 'fedegolf')

    courseId = existing.id
    isNew = false
  } else {
    // INSERT nuevo
    const { data: inserted, error: insertError } = await supabase
      .from('courses')
      .insert(courseRow)
      .select('id')
      .single()

    if (insertError || !inserted) {
      console.error(`  ❌ Error insertando ${nombreCurso}:`, insertError?.message)
      return 'error'
    }

    courseId = inserted.id
    isNew = true
  }

  // Insertar tees (solo los que tienen datos)
  const genero = info.genero === 'femenino' ? 'F' : 'M'
  const teesToInsert = info.tees
    .filter((tee: FedegolfTeeInfo) => tee.slope > 0 || tee.rating > 0)
    .map((tee: FedegolfTeeInfo) => ({
      course_id: courseId,
      nombre: tee.label,
      slope: tee.slope > 0 ? Math.round(tee.slope) : null,
      rating: tee.rating > 0 ? tee.rating : null,
      genero,
      fuente: 'fedegolf',
    }))

  if (teesToInsert.length > 0) {
    const { error: teesError } = await supabase
      .from('course_tees')
      .insert(teesToInsert)

    if (teesError) {
      console.error(`  ⚠️ Error insertando tees de ${nombreCurso}:`, teesError.message)
    }
  }

  return isNew ? 'new' : 'updated'
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log('🏌️ FedeGolf Sync — Descarga de canchas federadas')
  console.log('─'.repeat(50))

  // 1. Login
  console.log('\n📡 Conectando a fedegolf.cl...')
  const session = await fedegolfLogin(FEDEGOLF_RUT!, FEDEGOLF_PASSWORD!)
  console.log('✅ Login exitoso')

  // 2. Descargar todas las canchas
  console.log('\n📥 Descargando canchas de todos los clubes...\n')

  const allData = await fedegolfDownloadAll(session, (progress) => {
    if (progress.phase === 'canchas') {
      console.log(
        `[${progress.clubIndex + 1}/${progress.totalClubs}] ${progress.clubName}`
      )
    }
  })

  // 3. Upsert en Supabase
  console.log('\n💾 Sincronizando con Supabase...\n')

  const stats: SyncStats = {
    nuevas: 0,
    actualizadas: 0,
    errores: 0,
    teesInsertados: 0,
  }

  for (const courseData of allData) {
    for (let j = 0; j < courseData.canchas.length; j++) {
      const cancha = courseData.canchas[j]
      if (!cancha.info) {
        console.log(`  ⏭️ ${courseData.club.nombre} - cancha ${cancha.cancha} (sin info)`)
        continue
      }

      const nombre = `${courseData.club.nombre} - ${cancha.info.nombre}`
      try {
        const result = await upsertCancha(courseData, j)
        if (result === 'new') {
          stats.nuevas++
          const nTees = cancha.info.tees.filter(
            (t: FedegolfTeeInfo) => t.slope > 0 || t.rating > 0
          ).length
          stats.teesInsertados += nTees
          console.log(`  ✅ NUEVA: ${nombre} (${nTees} tees)`)
        } else if (result === 'updated') {
          stats.actualizadas++
          const nTees = cancha.info.tees.filter(
            (t: FedegolfTeeInfo) => t.slope > 0 || t.rating > 0
          ).length
          stats.teesInsertados += nTees
          console.log(`  🔄 ACTUALIZADA: ${nombre} (${nTees} tees)`)
        } else {
          stats.errores++
        }
      } catch (err) {
        stats.errores++
        console.error(`  ❌ Error procesando ${nombre}:`, err)
      }
    }
  }

  // 4. Resumen
  console.log('\n' + '─'.repeat(50))
  console.log('✅ Sync completado:')
  console.log(`   ${stats.nuevas} nuevas`)
  console.log(`   ${stats.actualizadas} actualizadas`)
  console.log(`   ${stats.teesInsertados} tees insertados`)
  if (stats.errores > 0) {
    console.log(`   ⚠️ ${stats.errores} errores`)
  }
}

main().catch((err) => {
  console.error('❌ Error fatal:', err)
  process.exit(1)
})
