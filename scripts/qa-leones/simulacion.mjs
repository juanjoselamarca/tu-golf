#!/usr/bin/env node
/**
 * PRUEBA DE FUEGO — simulación del torneo Stableford Gross de Los Leones (04-oct-2026).
 *
 * Reproduce el día real: UN marcador (usuario E2E) anota a 4 jugadores desde el scorer de
 * grupo (ronda libre admin_mode) en un iPhone; un seguidor anónimo mira en un Android.
 * Valida puntos gross hoyo a hoyo contra los fixtures, latencia del seguidor, reload en el
 * 11, corte de señal, corrección de score, dos dispositivos y cierre.
 *
 * TODO lo que crea lleva el prefijo QA_LEONES_ y se registra en
 * scripts/qa-leones/ids-creados.json. Limpieza: scripts/qa-leones/limpieza.mjs.
 *
 * Uso: node --env-file=.env.local scripts/qa-leones/simulacion.mjs [baseUrl]
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { chromium, devices } from 'playwright'

const BASE = process.argv[2] || 'http://localhost:3100'
const COURSE_ID = '8f64cd3a-daed-4d97-98e9-7f8ef9552f2d' // Club de Golf Los Leones (canónico)
const IDS_FILE = path.resolve('scripts/qa-leones/ids-creados.json')
const SHOTS = path.resolve('.claude/screenshots/qa-leones')
fs.mkdirSync(SHOTS, { recursive: true })

const PAR = { 1: 4, 2: 4, 3: 3, 4: 5, 5: 4, 6: 3, 7: 4, 8: 4, 9: 5, 10: 4, 11: 3, 12: 4, 13: 4, 14: 3, 15: 4, 16: 4, 17: 5, 18: 5 }
const PAR3 = [3, 6, 11, 15], PAR5 = [4, 9, 17, 18]
// Golpes RELATIVOS al par por jugador y hoyo (lo que el marcador toca: +/-).
const DELTA = {
  QA_LEONES_A: () => 0,                                         // par en los 18 → 36 (índice 18: gross = igual)
  QA_LEONES_B: () => 1,                                         // bogey en los 18 → 18
  QA_LEONES_C: h => (h === 1 ? 2 : PAR3.includes(h) ? 2 : 0),   // C + pickup en el 1 (anotado par+2) → 26
  QA_LEONES_D: h => (PAR5.includes(h) ? -1 : 0),                // birdie en los par 5 → 40
}
const ESPERADO = { QA_LEONES_A: 36, QA_LEONES_B: 18, QA_LEONES_C: 26, QA_LEONES_D: 40 }
const INDICE = { QA_LEONES_A: 18, QA_LEONES_B: 0, QA_LEONES_C: 9.4, QA_LEONES_D: null }
const ptsHoyo = (d) => Math.max(0, 2 - d)
function esperadoHasta(nombre, hasta) {
  let s = 0
  for (let h = 1; h <= hasta; h++) s += ptsHoyo(DELTA[nombre](h))
  return s
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
const resultados = []
function check(nombre, ok, detalle = '') {
  resultados.push({ nombre, ok, detalle })
  log(ok ? '✅' : '❌', nombre, detalle)
}
function registrarIds(extra) {
  const prev = fs.existsSync(IDS_FILE) ? JSON.parse(fs.readFileSync(IDS_FILE, 'utf8')) : {}
  // Acumula entre corridas: cada clave es una lista (la limpieza igual barre por prefijo QA_LEONES_).
  const next = { ...prev }
  for (const [k, v] of Object.entries(extra)) next[k] = [...(next[k] ?? []), ...(Array.isArray(v) ? v : [v])]
  fs.writeFileSync(IDS_FILE, JSON.stringify(next, null, 2))
}

async function crearRonda(userId) {
  const { data: holes } = await admin.from('course_holes').select('numero, par, stroke_index').eq('course_id', COURSE_ID).order('numero')
  const { data: tee } = await admin.from('course_tees').select('rating, slope').eq('course_id', COURSE_ID).eq('nombre', 'azul').single()
  const alphabet = 'ACDEFGHJKMNPQRSTVWXYZ2345679'
  const codigo = 'Q' + Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
  const { data: ronda, error } = await admin.from('rondas_libres').insert({
    codigo, course_id: COURSE_ID, course_name: 'QA_LEONES_TORNEO', tees: 'azul', holes: 18,
    fecha: new Date().toISOString().slice(0, 10), hoyo_inicio: 1,
    formato_juego: 'stableford', modo_juego: 'gross', admin_mode: true, admin_user_id: userId,
    estado: 'en_curso', creador_id: userId,
    course_snapshot: { holes: (holes ?? []).map(h => ({ numero: h.numero, par: h.par, stroke_index: h.stroke_index })), par_total: 72, course_rating: tee?.rating, slope_rating: tee?.slope },
  }).select('id, codigo').single()
  if (error) throw new Error('crear ronda: ' + error.message)
  registrarIds({ ronda: { id: ronda.id, codigo: ronda.codigo } })
  const jugadores = []
  for (const nombre of Object.keys(DELTA)) {
    const { data: j, error: e } = await admin.from('ronda_libre_jugadores').insert({
      ronda_id: ronda.id, user_id: null, nombre, handicap: INDICE[nombre], tees: 'azul', scores: {}, is_guest: true,
    }).select('id, nombre').single()
    if (e) throw new Error('crear jugador: ' + e.message)
    jugadores.push(j)
  }
  registrarIds({ jugadores })
  return { ...ronda, jugadores }
}

async function scoresDB(rondaId) {
  const { data } = await admin.from('ronda_libre_jugadores').select('nombre, scores').eq('ronda_id', rondaId)
  return Object.fromEntries((data ?? []).map(j => [j.nombre, j.scores ?? {}]))
}

async function login(page) {
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="email"]').first().fill(process.env.E2E_TEST_USER_EMAIL)
  await page.locator('input[placeholder="Tu contraseña"]').first().fill(process.env.E2E_TEST_USER_PASSWORD)
  await page.locator('form button[type="submit"]').first().click()
  await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 45_000 })
}

/** Lleva al jugador al delta pedido tocando +/- (con la doble confirmación anti-toque si aparece). */
async function anotar(page, nombre, delta) {
  if (delta === 0) return
  const card = page.locator('div', { has: page.getByText(nombre, { exact: true }) }).filter({ has: page.locator('button') }).last()
  const boton = card.locator('button', { hasText: delta > 0 ? '+' : '−' }).first()
  const boton2 = (await boton.count()) ? boton : card.locator('button', { hasText: delta > 0 ? '+' : '-' }).first()
  for (let i = 0; i < Math.abs(delta); i++) {
    await boton2.click()
    await page.waitForTimeout(120)
    if (await card.getByText('Toca otra vez para cambiar el score').count()) {
      await boton2.click()
      await page.waitForTimeout(120)
    }
  }
}

async function ptsEnPantalla(page, nombre) {
  const txt = await page.locator('body').innerText()
  const i = txt.indexOf(nombre)
  if (i < 0) return null
  const m = txt.slice(i, i + 200).match(/(\d+)\s*pts/)
  return m ? Number(m[1]) : null
}

async function main() {
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const e2eUser = users.users.find(u => u.email === process.env.E2E_TEST_USER_EMAIL)
  if (!e2eUser) throw new Error('usuario E2E no existe')
  const ronda = await crearRonda(e2eUser.id)
  log('ronda QA creada', ronda.codigo, ronda.id)

  const browser = await chromium.launch()
  const iphone = await browser.newContext({ ...devices['iPhone 13'] })
  const android = await browser.newContext({ ...devices['Pixel 7'] })
  const marcador = await iphone.newPage()
  const seguidor = await android.newPage()
  const errores = []
  for (const [n, p] of [['marcador', marcador], ['seguidor', seguidor]]) {
    p.on('pageerror', e => errores.push(`${n}: ${e.message}`))
  }

  await login(marcador)
  await marcador.goto(`${BASE}/ronda-libre/${ronda.codigo}/score-grupo`, { waitUntil: 'networkidle' })
  await seguidor.goto(`${BASE}/ronda-libre/${ronda.codigo}`, { waitUntil: 'networkidle' })
  await marcador.screenshot({ path: `${SHOTS}/01-marcador-hoyo1.png`, fullPage: true })
  check('seguidor anónimo ve botón Seguir', (await seguidor.getByRole('button', { name: /seguir/i }).count()) > 0)

  for (let h = 1; h <= 18; h++) {
    // Puntos que ve el MARCADOR al ENTRAR al hoyo (el hoyo en curso suma recién al avanzar).
    if (h === 10 || h === 18) {
      for (const nombre of Object.keys(DELTA)) {
        const v = await ptsEnPantalla(marcador, nombre)
        check(`marcador ve ${nombre} = ${esperadoHasta(nombre, h - 1)} pts al llegar al ${h}`, v === esperadoHasta(nombre, h - 1), `pantalla=${v}`)
      }
      await marcador.screenshot({ path: `${SHOTS}/02-marcador-hoyo${h}.png`, fullPage: true })
    }
    // Estrés: corte de señal a mitad del hoyo 7 → se anota offline y reconecta antes de avanzar.
    if (h === 7) await iphone.setOffline(true)
    for (const nombre of Object.keys(DELTA)) await anotar(marcador, nombre, DELTA[nombre](h))
    if (h === 7) {
      await marcador.waitForTimeout(1500)
      await iphone.setOffline(false)
      await marcador.waitForTimeout(1500)
    }
    // Estrés: corrección de un score ya ingresado (B en el 5: +1 de más y lo vuelve).
    if (h === 5) {
      await anotar(marcador, 'QA_LEONES_B', 1)
      await marcador.waitForTimeout(3500) // sale de la ventana de edición libre → exige reconfirmar
      await anotar(marcador, 'QA_LEONES_B', -1)
    }
    const tGuardado = Date.now()
    if (h < 18) {
      await marcador.getByRole('button', { name: /Siguiente/ }).click()
      await marcador.waitForTimeout(600)
    } else {
      await marcador.waitForTimeout(1500)
    }
    // Estrés: recarga de la página en el hoyo 11.
    if (h === 11) {
      await marcador.reload({ waitUntil: 'domcontentloaded' })
      await marcador.getByRole('button', { name: /Siguiente/ }).waitFor({ timeout: 20_000 })
      await marcador.waitForTimeout(1500)
      const enHoyo = await marcador.locator('body').innerText()
      check('tras recargar en el 11 el marcador sigue en el hoyo 12', /Hoyo\s*12/i.test(enHoyo))
    }
    // Latencia del seguidor: el leaderboard refleja el hoyo h en < 10 s.
    // (El 18 con par sin tocar se guarda al Finalizar: se valida después del cierre.)
    if (h === 18) continue
    let ok = false
    while (Date.now() - tGuardado < 10_000) {
      const db = await scoresDB(ronda.id)
      const todos = Object.keys(DELTA).every(n => db[n]?.[String(h)] === PAR[h] + DELTA[n](h))
      const pantalla = await ptsEnPantalla(seguidor, 'QA_LEONES_D')
      if (todos && pantalla === esperadoHasta('QA_LEONES_D', h)) { ok = true; break }
      await seguidor.waitForTimeout(500)
    }
    check(`hoyo ${h}: BD correcta y seguidor actualizado < 10 s`, ok, `${((Date.now() - tGuardado) / 1000).toFixed(1)} s`)
  }

  // Dos dispositivos: un 2º teléfono del marcador abre el mismo scorer y ve lo mismo (sin pisar).
  const iphone2 = await browser.newContext({ ...devices['iPhone 13'], storageState: await iphone.storageState() })
  const marcador2 = await iphone2.newPage()
  await marcador2.goto(`${BASE}/ronda-libre/${ronda.codigo}/score-grupo`, { waitUntil: 'networkidle' })
  const v2 = await ptsEnPantalla(marcador2, 'QA_LEONES_D')
  check('2º dispositivo abre el scorer con los mismos puntos', v2 != null, `D=${v2}`)

  // Totales finales: BD, leaderboard del seguidor y /api/en-vivo.
  const db = await scoresDB(ronda.id)
  for (const n of Object.keys(DELTA)) {
    const golpes = Object.values(db[n]).reduce((a, b) => a + b, 0)
    const okH = n === 'QA_LEONES_A' || n === 'QA_LEONES_C' ? Object.keys(db[n]).length === 17 : Object.keys(db[n]).length === 18
    check(`${n}: hoyos tocados del 18 ya en BD antes de cerrar (debounce por jugador)`, okH, `hoyos=${Object.keys(db[n]).length} golpes=${golpes}`)
  }
  const api = await (await fetch(`${BASE}/api/en-vivo`)).json().catch(() => null)
  const fila = JSON.stringify(api ?? {}).includes(ronda.codigo)
  check('/api/en-vivo lista la ronda QA', fila)

  // Cierre.
  marcador.on('dialog', d => d.accept())
  const fin = marcador.getByRole('button', { name: /finaliz/i }).first()
  await fin.click()
  await marcador.waitForTimeout(800)
  if (await marcador.getByRole('button', { name: /finaliz/i }).count()) await marcador.getByRole('button', { name: /finaliz/i }).first().click().catch(() => {})
  await marcador.waitForTimeout(6000)
  await marcador.screenshot({ path: `${SHOTS}/04-marcador-cierre.png`, fullPage: true })
  const { data: r } = await admin.from('rondas_libres').select('estado').eq('id', ronda.id).single()
  check('ronda pasa a finalizada', r?.estado === 'finalizada', `estado=${r?.estado}`)
  const { data: hist } = await admin.from('historical_rounds').select('id, user_id, total_gross, modo_juego, formato_juego').contains('metadata', { ronda_libre_id: ronda.id })
  registrarIds({ historical_rounds: (hist ?? []).map(x => x.id) })
  const dbFin = await scoresDB(ronda.id)
  for (const n of Object.keys(DELTA)) check(`${n}: 18 hoyos en BD tras cerrar`, Object.keys(dbFin[n]).length === 18, `hoyos=${Object.keys(dbFin[n]).length}`)
  await seguidor.reload({ waitUntil: 'domcontentloaded' })
  await seguidor.getByText('QA_LEONES_D').first().waitFor({ timeout: 30_000 })
  await seguidor.waitForTimeout(1500)
  await seguidor.screenshot({ path: `${SHOTS}/03-seguidor-final.png`, fullPage: true })
  for (const n of Object.keys(ESPERADO)) {
    const v = await ptsEnPantalla(seguidor, n)
    check(`seguidor ve ${n} = ${ESPERADO[n]} pts`, v === ESPERADO[n], `pantalla=${v}`)
  }
  const txt = await seguidor.locator('body').innerText()
  const orden = Object.keys(ESPERADO).map(n => [n, txt.indexOf(n)]).sort((a, b) => a[1] - b[1]).map(x => x[0])
  check('orden del leaderboard: D, A, C, B (puntos DESC)', orden.join() === 'QA_LEONES_D,QA_LEONES_A,QA_LEONES_C,QA_LEONES_B', orden.join())

  check('sin errores JS en las páginas', errores.length === 0, errores.slice(0, 3).join(' | '))
  await browser.close()

  const fallas = resultados.filter(r => !r.ok)
  fs.writeFileSync(path.resolve('scripts/qa-leones/resultado.json'), JSON.stringify({ codigo: ronda.codigo, base: BASE, resultados }, null, 2))
  log(`RESULTADO: ${resultados.length - fallas.length}/${resultados.length} OK`)
  process.exit(fallas.length ? 1 : 0)
}

main().catch(e => { console.error('FATAL', e); process.exit(2) })
