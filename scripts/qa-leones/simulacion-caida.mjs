#!/usr/bin/env node
/**
 * Simulación de la CAÍDA del 04-oct-2026 (torneo Los Leones) sobre el scorer de grupo.
 *
 * Un marcador (iPhone) anota a 4 jugadores. Tras el hoyo 3 el servidor queda COLGADO
 * (Supabase REST + Auth no responden, como esa mañana: respuestas de 20-80 s). Se verifica:
 *   - "Siguiente" avanza en < 2 s (antes esperaba al servidor),
 *   - aparece el aviso de sin conexión y el scorer NUNCA sale de /score-grupo,
 *   - recargar la página en plena caída abre el scorer desde la copia local,
 *   - al volver el servidor todo se sincroniza solo (sin tocar nada) y el aviso se va.
 * Datos con prefijo QA_LEONES_ (limpieza: scripts/qa-leones/limpieza.mjs).
 *
 * Con `--scramble`: misma caída con 2 equipos de 2 (bola compartida: se anota la tarjeta
 * del EQUIPO, por la RPC de equipos), que es el camino que la revisión pidió probar.
 *
 * Uso: node --env-file=.env.local scripts/qa-leones/simulacion-caida.mjs [baseUrl] [--scramble]
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { chromium, devices } from 'playwright'

const ARGS = process.argv.slice(2)
const SCRAMBLE = ARGS.includes('--scramble')
const BASE = ARGS.find(a => !a.startsWith('--')) || 'http://localhost:3218'
const COURSE_ID = '8f64cd3a-daed-4d97-98e9-7f8ef9552f2d'
const SHOTS = path.resolve('.claude/screenshots/qa-caida')
fs.mkdirSync(SHOTS, { recursive: true })
const PAR = { 1: 4, 2: 4, 3: 3, 4: 5, 5: 4, 6: 3, 7: 4, 8: 4, 9: 5 }
const JUGADORES = ['QA_LEONES_A', 'QA_LEONES_B', 'QA_LEONES_C', 'QA_LEONES_D']
const EQUIPOS = [{ nombre: 'QA_LEONES_EQ1', miembros: [0, 1] }, { nombre: 'QA_LEONES_EQ2', miembros: [2, 3] }]
// Lo que se anota (y se verifica en BD): los jugadores, o en scramble las tarjetas de equipo.
const NOMBRES = SCRAMBLE ? EQUIPOS.map(e => e.nombre) : JUGADORES
const DELTA = (n, h) => (n === 'QA_LEONES_B' || n === 'QA_LEONES_EQ1' ? 1 : (n === 'QA_LEONES_D' || n === 'QA_LEONES_EQ2') && h % 2 === 0 ? -1 : 0)
const SUPABASE_HOST = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
const resultados = []
const check = (nombre, ok, detalle = '') => { resultados.push({ nombre, ok, detalle }); log(ok ? '✅' : '❌', nombre, detalle) }

async function crearRonda(userId) {
  const { data: holes } = await admin.from('course_holes').select('numero, par, stroke_index').eq('course_id', COURSE_ID).order('numero')
  const codigo = 'QC' + Math.random().toString(36).slice(2, 6).toUpperCase()
  const { data: ronda, error } = await admin.from('rondas_libres').insert({
    codigo, course_id: COURSE_ID, course_name: 'QA_LEONES_CAIDA', tees: 'azul', holes: 9,
    fecha: new Date().toISOString().slice(0, 10), hoyo_inicio: 1, formato_juego: SCRAMBLE ? 'scramble' : 'stableford', modo_juego: 'gross',
    admin_mode: true, admin_user_id: userId, estado: 'en_curso', creador_id: userId,
    course_snapshot: { holes: (holes ?? []).map(h => ({ numero: h.numero, par: h.par, stroke_index: h.stroke_index })), par_total: 72 },
  }).select('id, codigo').single()
  if (error) throw new Error(error.message)
  const ids = []
  for (const nombre of JUGADORES) {
    const { data: j, error: e } = await admin.from('ronda_libre_jugadores').insert({ ronda_id: ronda.id, user_id: null, nombre, handicap: null, tees: 'azul', scores: {}, is_guest: true }).select('id').single()
    if (e) throw new Error(e.message)
    ids.push(j.id)
  }
  if (SCRAMBLE) {
    for (const eq of EQUIPOS) {
      const { data: fila, error: e } = await admin.from('ronda_equipos').insert({ ronda_id: ronda.id, nombre: eq.nombre, handicap_equipo: null, scores: {} }).select('id').single()
      if (e) throw new Error(e.message)
      const { error: e2 } = await admin.from('ronda_equipo_jugadores').insert(eq.miembros.map((m, orden) => ({ equipo_id: fila.id, jugador_id: ids[m], orden })))
      if (e2) throw new Error(e2.message)
    }
  }
  return ronda
}
async function scoresDB(rondaId) {
  const { data } = await admin.from(SCRAMBLE ? 'ronda_equipos' : 'ronda_libre_jugadores').select('nombre, scores').eq('ronda_id', rondaId)
  return Object.fromEntries((data ?? []).map(j => [j.nombre, j.scores ?? {}]))
}
async function anotar(page, nombre, delta) {
  if (!delta) return
  const card = page.locator('div', { has: page.getByText(nombre, { exact: true }) }).filter({ has: page.locator('button') }).last()
  const boton = card.locator('button', { hasText: delta > 0 ? '+' : '−' }).first()
  const b = (await boton.count()) ? boton : card.locator('button', { hasText: delta > 0 ? '+' : '-' }).first()
  for (let i = 0; i < Math.abs(delta); i++) {
    await b.click()
    await page.waitForTimeout(120)
    if (await card.getByText('Toca otra vez para cambiar el score').count()) { await b.click(); await page.waitForTimeout(120) }
  }
}
const hoyoEnPantalla = async page => Number(((await page.locator('body').innerText()).match(/HOYO\s*(\d+)/i) ?? [])[1])

async function main() {
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const e2e = users.users.find(u => u.email === process.env.E2E_TEST_USER_EMAIL)
  const ronda = await crearRonda(e2e.id)
  log('ronda QA', ronda.codigo, ronda.id)
  fs.writeFileSync(path.resolve('scripts/qa-leones/ids-caida.json'), JSON.stringify(ronda))

  const browser = await chromium.launch()
  const ctx = await browser.newContext({ ...devices['iPhone 13'] })
  const page = await ctx.newPage()
  const urls = []
  page.on('framenavigated', f => { if (f === page.mainFrame()) urls.push(new URL(f.url()).pathname) })
  const errores = []
  page.on('pageerror', e => errores.push(e.message))

  await page.goto(BASE + '/login', { waitUntil: 'networkidle' }) // hidratado: si no, el submit es un form HTML mudo
  await page.locator('input[type="email"]').first().fill(process.env.E2E_TEST_USER_EMAIL)
  await page.locator('input[placeholder="Tu contraseña"]').first().fill(process.env.E2E_TEST_USER_PASSWORD)
  await page.locator('form button[type="submit"]').first().click()
  await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 45_000 })
  await page.goto(`${BASE}/ronda-libre/${ronda.codigo}/score-grupo`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /Siguiente/ }).waitFor({ timeout: 30_000 })
  // El banner de instalación no aparece en el scorer (#504); igual se cierra si estuviera.
  const scorerPath = `/ronda-libre/${ronda.codigo}/score-grupo`

  // Hoyos 1-3 con servidor sano.
  for (let h = 1; h <= 3; h++) {
    for (const n of NOMBRES) await anotar(page, n, DELTA(n, h))
    await page.getByRole('button', { name: /Siguiente/ }).click()
    await page.waitForTimeout(1200)
  }
  const pre = await scoresDB(ronda.id)
  check('hoyos 1-3 en BD antes de la caída', NOMBRES.every(n => Object.keys(pre[n]).length === 3))

  // ── CAÍDA: Supabase REST + Auth colgados (no responden), como el 04-oct ──
  const colgadas = []
  const esSupabase = url => url.host === SUPABASE_HOST && /\/(rest|auth)\/v1\//.test(url.pathname)
  await ctx.route(esSupabase, route => { colgadas.push(route) })
  log('servidor colgado')
  for (let h = 4; h <= 6; h++) {
    for (const n of NOMBRES) await anotar(page, n, DELTA(n, h))
    const t0 = Date.now()
    await page.getByRole('button', { name: /Siguiente/ }).click()
    await page.waitForFunction(esperado => /HOYO\s*(\d+)/i.test(document.body.innerText) && Number(document.body.innerText.match(/HOYO\s*(\d+)/i)[1]) === esperado, h + 1, { timeout: 10_000 }).catch(() => {})
    const ms = Date.now() - t0
    check(`caída: "Siguiente" en el hoyo ${h} avanza en < 2 s`, (await hoyoEnPantalla(page)) === h + 1 && ms < 2000, `${ms} ms`)
  }
  await page.waitForTimeout(14_000) // pasa el plazo de guardado (12 s): el scorer se da cuenta
  const txt = await page.locator('body').innerText()
  check('caída: aviso "Sin conexión con el servidor" visible', txt.includes('Sin conexión con el servidor'))
  await page.screenshot({ path: `${SHOTS}/01-aviso-sin-conexion.png`, fullPage: true })

  // Recargar en plena caída (lo que hace un iPhone al volver de otra app).
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /Siguiente/ }).waitFor({ timeout: 25_000 }).catch(() => {})
  const hReload = await hoyoEnPantalla(page)
  check('caída: recargar abre el scorer desde la copia local en el hoyo 7', hReload === 7, `hoyo=${hReload}`)
  await page.screenshot({ path: `${SHOTS}/02-recarga-en-caida.png`, fullPage: true })
  for (const n of NOMBRES) await anotar(page, n, DELTA(n, 7))
  await page.getByRole('button', { name: /Siguiente/ }).click().catch(() => {})
  await page.waitForTimeout(1500)
  const desdeScorer = urls.slice(urls.indexOf(scorerPath))
  check('caída: el scorer nunca salió de /score-grupo (ni login ni dashboard)', !desdeScorer.some(u => u.startsWith('/login') || u.startsWith('/dashboard')), desdeScorer.slice(-4).join(' → '))

  // Control: durante la caída NADA debe haber llegado a la BD (si no, la simulación no simula).
  const durante = await scoresDB(ronda.id)
  check('control: durante la caída la BD sigue sólo con hoyos 1-3', NOMBRES.every(n => Object.keys(durante[n]).length === 3),
    NOMBRES.map(n => n.slice(-1) + ':' + Object.keys(durante[n]).join(',')).join(' '))
  const caminos = [...new Set(colgadas.map(r => new URL(r.request().url()).pathname))]
  log('peticiones retenidas:', colgadas.length, caminos.join(' '))

  // ── VUELVE el servidor: nadie toca nada; debe sincronizar solo ──
  await ctx.unroute(esSupabase)
  for (const r of colgadas) await r.abort('timedout').catch(() => {})
  log('servidor de vuelta (colgadas abortadas:', colgadas.length, ')')
  let sincronizado = false
  const t0 = Date.now()
  while (Date.now() - t0 < 45_000) {
    const db = await scoresDB(ronda.id)
    if (NOMBRES.every(n => [1, 2, 3, 4, 5, 6, 7].every(h => db[n]?.[String(h)] === PAR[h] + DELTA(n, h)))) { sincronizado = true; break }
    await page.waitForTimeout(2000)
  }
  check('al volver: hoyos 1-7 de los 4 jugadores en BD SIN intervención', sincronizado, `${((Date.now() - t0) / 1000).toFixed(0)} s`)
  let avisoFuera = false
  const t1 = Date.now()
  while (Date.now() - t1 < 35_000) {
    if (!(await page.locator('body').innerText()).includes('Sin conexión con el servidor')) { avisoFuera = true; break }
    await page.waitForTimeout(1000)
  }
  check('al volver: el aviso desaparece solo (≤ 35 s)', avisoFuera, `${((Date.now() - t1) / 1000).toFixed(0)} s`)
  await page.screenshot({ path: `${SHOTS}/03-sincronizado.png`, fullPage: true })
  check('sin errores JS', errores.length === 0, errores.slice(0, 2).join(' | '))
  await browser.close()
  fs.writeFileSync(path.resolve(`scripts/qa-leones/resultado-caida${SCRAMBLE ? '-scramble' : ''}.json`), JSON.stringify({ codigo: ronda.codigo, formato: SCRAMBLE ? 'scramble' : 'stableford', resultados }, null, 2))
  const fallas = resultados.filter(r => !r.ok).length
  log(`RESULTADO: ${resultados.length - fallas}/${resultados.length} OK`)
  process.exit(fallas ? 1 : 0)
}
main().catch(e => { console.error('FATAL', e); process.exit(2) })
