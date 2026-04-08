require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function run() {
  // Get parent ID
  const { data: parent } = await s.from('courses').select('id').eq('nombre', 'Club de Golf Brisas de Santo Domingo').is('parent_id', null).single()
  if (!parent) { console.log('ERROR: parent not found'); return }
  console.log('Parent ID:', parent.id)

  // 1. Update parent tipo
  const { error: e1 } = await s.from('courses').update({ tipo_recorrido: '27h', datos_verificados: true }).eq('id', parent.id)
  console.log('1. Update parent tipo:', e1?.message || 'OK')

  // 2. Delete partial holes from parent
  const { error: e2, count: c2 } = await s.from('course_holes').delete({ count: 'exact' }).eq('course_id', parent.id)
  console.log('2. Delete parent holes:', e2?.message || 'OK', 'deleted:', c2)

  // 3. Create children
  const loops = ['Norte', 'Sur', 'Este']
  const childIds = {}
  for (const loop of loops) {
    const { data: existing } = await s.from('courses').select('id').eq('parent_id', parent.id).eq('loop_nombre', loop).single()
    if (existing) { childIds[loop] = existing.id; console.log('3. Child', loop, 'exists:', existing.id); continue }
    const { data: child, error: e3 } = await s.from('courses').insert({
      nombre: 'Club de Golf Brisas de Santo Domingo',
      par_total: 36, course_rating: 36, slope_rating: 120,
      tipo_recorrido: '9h', parent_id: parent.id, loop_nombre: loop,
      datos_verificados: true, activa: true
    }).select('id').single()
    console.log('3. Create child', loop, ':', e3?.message || child.id)
    if (child) childIds[loop] = child.id
  }

  // 4. Norte holes (GolfPass)
  const norteHoles = [
    { numero: 1, par: 4, stroke_index: 15, recorrido: 'Norte', yardaje_campeonato: 316, yardaje_azul: 297, yardaje_blanco: 284, yardaje_rojo: 251 },
    { numero: 2, par: 4, stroke_index: 13, recorrido: 'Norte', yardaje_campeonato: 377, yardaje_azul: 347, yardaje_blanco: 328, yardaje_rojo: 290 },
    { numero: 3, par: 4, stroke_index: 3,  recorrido: 'Norte', yardaje_campeonato: 436, yardaje_azul: 394, yardaje_blanco: 380, yardaje_rojo: 339 },
    { numero: 4, par: 3, stroke_index: 11, recorrido: 'Norte', yardaje_campeonato: 206, yardaje_azul: 182, yardaje_blanco: 174, yardaje_rojo: 147 },
    { numero: 5, par: 5, stroke_index: 9,  recorrido: 'Norte', yardaje_campeonato: 564, yardaje_azul: 530, yardaje_blanco: 517, yardaje_rojo: 426 },
    { numero: 6, par: 4, stroke_index: 1,  recorrido: 'Norte', yardaje_campeonato: 429, yardaje_azul: 384, yardaje_blanco: 364, yardaje_rojo: 310 },
    { numero: 7, par: 3, stroke_index: 17, recorrido: 'Norte', yardaje_campeonato: 164, yardaje_azul: 139, yardaje_blanco: 129, yardaje_rojo: 112 },
    { numero: 8, par: 5, stroke_index: 7,  recorrido: 'Norte', yardaje_campeonato: 534, yardaje_azul: 510, yardaje_blanco: 495, yardaje_rojo: 463 },
    { numero: 9, par: 4, stroke_index: 5,  recorrido: 'Norte', yardaje_campeonato: 424, yardaje_azul: 398, yardaje_blanco: 377, yardaje_rojo: 328 },
  ]
  const { error: e4 } = await s.from('course_holes').insert(norteHoles.map(h => ({ ...h, course_id: childIds['Norte'] })))
  console.log('4. Norte holes:', e4?.message || '9 OK')

  // 5. Sur holes (GolfPass)
  const surHoles = [
    { numero: 1, par: 4, stroke_index: 15, recorrido: 'Sur', yardaje_campeonato: 385, yardaje_azul: 351, yardaje_blanco: 335, yardaje_rojo: 268 },
    { numero: 2, par: 4, stroke_index: 1,  recorrido: 'Sur', yardaje_campeonato: 440, yardaje_azul: 417, yardaje_blanco: 387, yardaje_rojo: 372 },
    { numero: 3, par: 4, stroke_index: 5,  recorrido: 'Sur', yardaje_campeonato: 397, yardaje_azul: 378, yardaje_blanco: 355, yardaje_rojo: 317 },
    { numero: 4, par: 3, stroke_index: 11, recorrido: 'Sur', yardaje_campeonato: 205, yardaje_azul: 186, yardaje_blanco: 176, yardaje_rojo: 158 },
    { numero: 5, par: 5, stroke_index: 9,  recorrido: 'Sur', yardaje_campeonato: 499, yardaje_azul: 468, yardaje_blanco: 445, yardaje_rojo: 409 },
    { numero: 6, par: 4, stroke_index: 13, recorrido: 'Sur', yardaje_campeonato: 378, yardaje_azul: 349, yardaje_blanco: 321, yardaje_rojo: 275 },
    { numero: 7, par: 3, stroke_index: 17, recorrido: 'Sur', yardaje_campeonato: 123, yardaje_azul: 95,  yardaje_blanco: 95,  yardaje_rojo: 94 },
    { numero: 8, par: 5, stroke_index: 3,  recorrido: 'Sur', yardaje_campeonato: 611, yardaje_azul: 576, yardaje_blanco: 550, yardaje_rojo: 523 },
    { numero: 9, par: 4, stroke_index: 7,  recorrido: 'Sur', yardaje_campeonato: 414, yardaje_azul: 394, yardaje_blanco: 370, yardaje_rojo: 317 },
  ]
  const { error: e5 } = await s.from('course_holes').insert(surHoles.map(h => ({ ...h, course_id: childIds['Sur'] })))
  console.log('5. Sur holes:', e5?.message || '9 OK')

  // 6. Este holes (Hole19 - only white tee yardage available)
  const esteHoles = [
    { numero: 1, par: 5, stroke_index: 15, recorrido: 'Este', yardaje_blanco: 461 },
    { numero: 2, par: 3, stroke_index: 9,  recorrido: 'Este', yardaje_blanco: 174 },
    { numero: 3, par: 4, stroke_index: 13, recorrido: 'Este', yardaje_blanco: 330 },
    { numero: 4, par: 4, stroke_index: 1,  recorrido: 'Este', yardaje_blanco: 388 },
    { numero: 5, par: 5, stroke_index: 3,  recorrido: 'Este', yardaje_blanco: 513 },
    { numero: 6, par: 4, stroke_index: 7,  recorrido: 'Este', yardaje_blanco: 353 },
    { numero: 7, par: 3, stroke_index: 17, recorrido: 'Este', yardaje_blanco: 139 },
    { numero: 8, par: 4, stroke_index: 11, recorrido: 'Este', yardaje_blanco: 344 },
    { numero: 9, par: 4, stroke_index: 5,  recorrido: 'Este', yardaje_blanco: 353 },
  ]
  const { error: e6 } = await s.from('course_holes').insert(esteHoles.map(h => ({ ...h, course_id: childIds['Este'] })))
  console.log('6. Este holes:', e6?.message || '9 OK')

  // 7. Tees by combination (FGCh official)
  const tees = [
    { nombre: 'negro_norte_sur',   rating: 74.0, slope: 136, yardaje_total: 6902, genero: 'M' },
    { nombre: 'azul_norte_sur',    rating: 71.9, slope: 132, yardaje_total: 6395, genero: 'M' },
    { nombre: 'blanco_norte_sur',  rating: 70.5, slope: 130, yardaje_total: 6082, genero: 'M' },
    { nombre: 'dorado_norte_sur',  rating: 67.3, slope: 118, yardaje_total: 5575, genero: 'M' },
    { nombre: 'rojo_norte_sur',    rating: 72.7, slope: 130, yardaje_total: 5399, genero: 'F' },
    { nombre: 'negro_norte_este',  rating: 74.7, slope: 138, yardaje_total: 7079, genero: 'M' },
    { nombre: 'azul_norte_este',   rating: 72.0, slope: 128, yardaje_total: 6526, genero: 'M' },
    { nombre: 'blanco_norte_este', rating: 70.4, slope: 127, yardaje_total: 6183, genero: 'M' },
    { nombre: 'dorado_norte_este', rating: 68.2, slope: 119, yardaje_total: 5815, genero: 'M' },
    { nombre: 'rojo_norte_este',   rating: 72.3, slope: 124, yardaje_total: 5464, genero: 'F' },
    { nombre: 'negro_sur_este',    rating: 74.7, slope: 132, yardaje_total: 7081, genero: 'M' },
    { nombre: 'azul_sur_este',     rating: 72.3, slope: 128, yardaje_total: 6559, genero: 'M' },
    { nombre: 'blanco_sur_este',   rating: 70.2, slope: 126, yardaje_total: 6169, genero: 'M' },
    { nombre: 'dorado_sur_este',   rating: 67.8, slope: 116, yardaje_total: 5708, genero: 'M' },
    { nombre: 'rojo_sur_este',     rating: 73.0, slope: 127, yardaje_total: 5531, genero: 'F' },
  ]
  const { error: e7 } = await s.from('course_tees').insert(tees.map(t => ({ ...t, course_id: parent.id })))
  console.log('7. Tees:', e7?.message || '15 OK')

  // 8. Clean Rocas parent holes
  const { data: rocasParent } = await s.from('courses').select('id').eq('nombre', 'Club de Golf Rocas de Santo Domingo').is('parent_id', null).single()
  if (rocasParent) {
    const { error: e8, count: c8 } = await s.from('course_holes').delete({ count: 'exact' }).eq('course_id', rocasParent.id)
    console.log('8. Clean Rocas parent holes:', e8?.message || 'OK', 'deleted:', c8)
  }

  // Verify
  const { data: verifyHoles } = await s.from('course_holes').select('course_id,recorrido').in('course_id', Object.values(childIds))
  const counts = {}
  for (const h of verifyHoles || []) { counts[h.recorrido] = (counts[h.recorrido] || 0) + 1 }
  console.log('\nVerification holes per loop:', JSON.stringify(counts))
  const { data: verifyTees } = await s.from('course_tees').select('nombre').eq('course_id', parent.id)
  console.log('Verification tees:', verifyTees?.length, 'records')
}
run().catch(console.error)
