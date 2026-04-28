/**
 * Actualización masiva de canchas — usa fetch directo (no SDK)
 * Ejecutar: node src/scripts/update-courses-runner.mjs
 */

const SUPABASE_URL = 'https://hoswfwhvcgqlqdmzpnce.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhvc3dmd2h2Y2dxbHFkbXpwbmNlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzM1NzY0NiwiZXhwIjoyMDg4OTMzNjQ2fQ.gncfJlDKlsPeWws3s27VCW5FtgjPBBchRZL2LKLSHD4'
const API_KEY = 'PT4JTCIYP63XOIRLXXXDEI36NE'
const headers = { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' }

async function sql(query) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, { method: 'POST', headers, body: JSON.stringify({ query }) })
  return r.json()
}

async function fetchCourse(id) {
  const r = await fetch(`https://api.golfcourseapi.com/v1/courses/${id}`, { headers: { 'Authorization': `Key ${API_KEY}` } })
  if (!r.ok) return null
  const d = await r.json()
  return d.course || null
}

function estimateSI(holes) {
  const avg = { 3: 170, 4: 380, 5: 520 }
  const diffs = holes.map((h, i) => ({ i, d: h.yardage / (avg[h.par] || 380), front: i < 9 }))
  const front = diffs.filter(x => x.front).sort((a, b) => b.d - a.d)
  const back = diffs.filter(x => !x.front).sort((a, b) => b.d - a.d)
  const si = new Array(holes.length).fill(0)
  front.forEach((x, r) => si[x.i] = r * 2 + 1)
  back.forEach((x, r) => si[x.i] = r * 2 + 2)
  return si
}

function mapTee(name) {
  const l = name.toLowerCase()
  if (['negras','negro','negra','black','championship','campeonato'].includes(l)) return 'negras'
  if (['azul','blue'].includes(l)) return 'azul'
  if (['blanco','blanca','white'].includes(l)) return 'blanco'
  if (['rojo','roja','red'].includes(l)) return 'rojo'
  if (['dorado','dorada','gold'].includes(l)) return 'dorado'
  return l
}

async function getCourseId(nombre) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/courses?nombre=eq.${encodeURIComponent(nombre)}&select=id`, { headers })
  const d = await r.json()
  return d?.[0]?.id || null
}

async function upsertHole(courseId, numero, par, si, yards) {
  const body = { course_id: courseId, numero, par, stroke_index: si, ...yards }
  await fetch(`${SUPABASE_URL}/rest/v1/course_holes`, {
    method: 'POST', headers: { ...headers, 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify(body)
  })
}

async function upsertTee(courseId, tee, genero) {
  const body = {
    course_id: courseId, nombre: mapTee(tee.tee_name),
    rating: tee.course_rating, slope: tee.slope_rating, par_total: tee.par_total,
    yardaje_total: tee.total_yards, genero,
    bogey_rating: tee.bogey_rating, total_yards: tee.total_yards, total_meters: tee.total_meters,
    front_course_rating: tee.front_course_rating, front_slope_rating: tee.front_slope_rating,
    front_bogey_rating: tee.front_bogey_rating,
    back_course_rating: tee.back_course_rating, back_slope_rating: tee.back_slope_rating,
    back_bogey_rating: tee.back_bogey_rating,
  }
  await fetch(`${SUPABASE_URL}/rest/v1/course_tees`, {
    method: 'POST', headers: { ...headers, 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify(body)
  })
}

async function updateCourse(courseId, data) {
  await fetch(`${SUPABASE_URL}/rest/v1/courses?id=eq.${courseId}`, {
    method: 'PATCH', headers, body: JSON.stringify(data)
  })
}

const STANDARD = [
  ['Club de Golf Los Leones', 15080],
  ['Club de Golf Prince of Wales', 15305],
  ['Club de Golf Sport Francés', 15431],
  ['Club de Golf Lomas de La Dehesa', 15124],
  ['Club de Golf Granadilla', 15285],
  ['Club de Golf Cachagua', 15511],
  ['Club de Golf Costa Cachagua', 15328],
  ['Hacienda Chicureo Golf Club', 15279],
  ['Club de Golf Angostura', 25988],
  ['Club de Golf La Serena', 15362],
  ['Club de Golf Las Araucarias', 15346],
  ['Club de Golf Los Lirios', 15478],
  ['Club de Golf Papudo', 14972],
  ['Club de Golf Santa Augusta de Quintay', 15228],
  ['Patagonia Virgin Frutillar', 26062],
  ['Country Club de Bogotá', 11998],
  ['Nordelta Golf Club', 25400],
  ['Olivos Golf Club', 25465],
  ['Hurlingham Club', 26269],
]

async function processStandard(name, apiId) {
  const api = await fetchCourse(apiId)
  if (!api) { console.log('  ❌ No API data'); return false }
  const courseId = await getCourseId(name)
  if (!courseId) { console.log('  ❌ Not in DB'); return false }

  const allTees = [...(api.tees.male || []), ...(api.tees.female || [])]
  const primary = api.tees.male?.[0]
  if (!primary?.holes?.length) { console.log('  ❌ No holes'); return false }

  const si = estimateSI(primary.holes)

  for (let i = 0; i < primary.holes.length; i++) {
    const yards = {}
    for (const t of allTees) {
      const m = mapTee(t.tee_name)
      const col = m === 'negras' ? 'yardaje_negras' : m === 'azul' ? 'yardaje_azul' : m === 'blanco' ? 'yardaje_blanco' : m === 'rojo' ? 'yardaje_rojo' : null
      if (col && t.holes[i]) yards[col] = t.holes[i].yardage
    }
    await upsertHole(courseId, i + 1, primary.holes[i].par, si[i], yards)
  }

  for (const t of allTees) {
    const g = api.tees.female?.includes(t) ? 'F' : 'M'
    await upsertTee(courseId, t, g)
  }

  await updateCourse(courseId, {
    par_total: primary.par_total,
    slope_rating: primary.slope_rating,
    course_rating: primary.course_rating,
    datos_verificados: true,
  })

  console.log(`  ✅ ${primary.holes.length}h, ${allTees.length} tees, SI estimated`)
  return true
}

// ── Multi-recorrido ──

const MULTI = [
  {
    name: 'Club de Golf Marbella',
    combos: [
      { id: 15283, l1: 'Andes Pro', l2: 'Pacifico Norte' },
      { id: 15317, l1: 'Pacifico Norte', l2: 'Pacifico Sur' },
      { id: 15339, l1: 'Andes Pro', l2: 'Pacifico Sur' },
    ],
    loops: ['Andes Pro', 'Pacifico Norte', 'Pacifico Sur'],
  },
  {
    name: 'Club de Golf Rocas de Santo Domingo',
    combos: [
      { id: 15155, l1: 'Roja', l2: 'Azul' },
      { id: 15266, l1: 'Roja', l2: 'Blanca' },
      { id: 15274, l1: 'Azul', l2: 'Blanca' },
    ],
    loops: ['Roja', 'Azul', 'Blanca'],
  },
]

async function processMulti(cfg) {
  const parentId = await getCourseId(cfg.name)
  if (!parentId) { console.log('  ❌ Parent not in DB'); return false }

  // Get parent city
  const cityRes = await fetch(`${SUPABASE_URL}/rest/v1/courses?id=eq.${parentId}&select=ciudad`, { headers })
  const cityData = await cityRes.json()
  const ciudad = cityData?.[0]?.ciudad || ''

  // Fetch all combos
  const loopHoles = {}
  const comboData = []

  for (const combo of cfg.combos) {
    const api = await fetchCourse(combo.id)
    if (!api) { console.log(`  ❌ No API for combo ${combo.id}`); continue }
    comboData.push({ combo, api })
    const tee = api.tees.male?.[0]
    if (!tee?.holes) continue
    if (!loopHoles[combo.l1]) loopHoles[combo.l1] = tee.holes.slice(0, 9)
    if (!loopHoles[combo.l2]) loopHoles[combo.l2] = tee.holes.slice(9, 18)
    await new Promise(r => setTimeout(r, 500))
  }

  // Update parent
  await updateCourse(parentId, { tipo_recorrido: '27h', datos_verificados: true })

  // Create/update loops
  for (const loopName of cfg.loops) {
    const holes = loopHoles[loopName]
    if (!holes) { console.log(`  ⚠️ No holes for ${loopName}`); continue }

    // Check if child exists
    const childRes = await fetch(`${SUPABASE_URL}/rest/v1/courses?parent_id=eq.${parentId}&loop_nombre=eq.${encodeURIComponent(loopName)}&select=id`, { headers })
    let childData = await childRes.json()
    let childId = childData?.[0]?.id

    if (!childId) {
      const createRes = await fetch(`${SUPABASE_URL}/rest/v1/courses`, {
        method: 'POST', headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify({
          nombre: cfg.name, ciudad, parent_id: parentId, loop_nombre: loopName,
          tipo_recorrido: '9h', par_total: holes.reduce((s, h) => s + h.par, 0),
          activa: true, datos_verificados: true, fuente: 'golfcourseapi',
        })
      })
      const created = await createRes.json()
      childId = created?.[0]?.id
      if (!childId) { console.log(`  ❌ Failed to create ${loopName}`); continue }
    }

    // SI for 9 holes
    const avg = { 3: 170, 4: 380, 5: 520 }
    const diffs = holes.map((h, i) => ({ i, d: h.yardage / (avg[h.par] || 380) }))
    const sorted = [...diffs].sort((a, b) => b.d - a.d)
    const si9 = new Array(9).fill(0)
    sorted.forEach((d, rank) => si9[d.i] = rank + 1)

    for (let i = 0; i < holes.length; i++) {
      await upsertHole(childId, i + 1, holes[i].par, si9[i], {})
    }

    await updateCourse(childId, { par_total: holes.reduce((s, h) => s + h.par, 0), datos_verificados: true })
    console.log(`    Loop ${loopName}: ${holes.length}h, par ${holes.reduce((s, h) => s + h.par, 0)}`)
  }

  // Store tees per combo
  for (const { combo, api } of comboData) {
    const allTees = [...(api.tees.male || []), ...(api.tees.female || [])]
    for (const t of allTees) {
      const g = api.tees.female?.includes(t) ? 'F' : 'M'
      const nombre = `${mapTee(t.tee_name)}_${combo.l1}_${combo.l2}`
      await upsertTee(parentId, { ...t, tee_name: nombre }, g)
    }
  }

  console.log(`  ✅ ${Object.keys(loopHoles).length} loops, ${comboData.length} combos`)
  return true
}

async function main() {
  console.log('═══ Actualización masiva de canchas ═══')
  let ok = 0, fail = 0

  for (const [name, id] of STANDARD) {
    console.log(`[${ok + fail + 1}/${STANDARD.length + MULTI.length}] ${name}`)
    try {
      if (await processStandard(name, id)) ok++; else fail++
    } catch (e) { console.log(`  ❌ ${e.message}`); fail++ }
    await new Promise(r => setTimeout(r, 800))
  }

  for (const cfg of MULTI) {
    console.log(`[${ok + fail + 1}/${STANDARD.length + MULTI.length}] ${cfg.name} (27h)`)
    try {
      if (await processMulti(cfg)) ok++; else fail++
    } catch (e) { console.log(`  ❌ ${e.message}`); fail++ }
    await new Promise(r => setTimeout(r, 1000))
  }

  console.log('')
  console.log(`═══ RESUMEN: ${ok} OK / ${fail} fail / ${STANDARD.length + MULTI.length} total ═══`)
}

main().catch(console.error)
