import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const IDS_FILE = '.test-team-ids.json'
const TEMPLATE = {
  course_id: 'dff847e1-34d9-4805-85a7-01ec3e554f65', course_name: 'Club de Golf Lomas de La Dehesa',
  tees: 'azul', holes: 18, modo_juego: 'gross', creador_id: '98c5cb7a-1c0b-4a64-a773-8bd013a92317',
  admin_user_id: '98c5cb7a-1c0b-4a64-a773-8bd013a92317', fecha: '2026-06-13',
}
const teamScores = (base) => { const o = {}; for (let h = 1; h <= 18; h++) o[String(h)] = base + (h % 3 === 0 ? 1 : 0); return o }
async function cleanup() {
  if (!existsSync(IDS_FILE)) { console.log('nada que limpiar'); return }
  const ids = JSON.parse(readFileSync(IDS_FILE, 'utf8'))
  if (ids.links?.length) await s.from('ronda_equipo_jugadores').delete().in('id', ids.links)
  if (ids.equipos?.length) await s.from('ronda_equipos').delete().in('id', ids.equipos)
  if (ids.jugadores?.length) await s.from('ronda_libre_jugadores').delete().in('id', ids.jugadores)
  if (ids.rondas?.length) await s.from('rondas_libres').delete().in('id', ids.rondas)
  rmSync(IDS_FILE); console.log('cleanup OK')
}
async function seedOne(formato, codigo, t) {
  const { data: r, error: e } = await s.from('rondas_libres').insert({ ...TEMPLATE, codigo, formato_juego: formato, estado: 'finalizada', es_demo: true }).select('id').single()
  if (e) throw new Error('ronda ' + e.message); t.rondas.push(r.id)
  for (let k = 1; k <= 2; k++) {
    const { data: eq } = await s.from('ronda_equipos').insert({ ronda_id: r.id, nombre: `Equipo ${k}`, handicap_equipo: 0, scores: teamScores(k === 1 ? 4 : 5) }).select('id').single()
    t.equipos.push(eq.id)
    for (let p = 1; p <= 2; p++) {
      const { data: j } = await s.from('ronda_libre_jugadores').insert({ ronda_id: r.id, nombre: `Jug ${k}.${p}`, scores: {}, handicap: 10, is_guest: true }).select('id').single()
      t.jugadores.push(j.id)
      const { data: l } = await s.from('ronda_equipo_jugadores').insert({ equipo_id: eq.id, jugador_id: j.id, orden: p }).select('id').single()
      t.links.push(l.id)
    }
  }
  console.log('sembrado', formato, codigo)
}
if (process.argv.includes('--cleanup')) await cleanup()
else {
  const sfx = (process.argv[2] || 'Q1').toUpperCase()
  const t = { rondas: [], equipos: [], jugadores: [], links: [] }
  try { await seedOne('scramble', `ZSC${sfx}`, t); await seedOne('foursome', `ZFO${sfx}`, t); writeFileSync(IDS_FILE, JSON.stringify(t)); console.log('CODES', `ZSC${sfx}`, `ZFO${sfx}`) }
  catch (e) { console.error('ERR', e.message); writeFileSync(IDS_FILE, JSON.stringify(t)); await cleanup(); process.exit(1) }
}
