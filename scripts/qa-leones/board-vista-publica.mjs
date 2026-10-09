#!/usr/bin/env node
/**
 * Screenshots del board /torneo/[slug] (camino ronda libre) según el visor — PR #509.
 *
 * Crea 2 torneos QA_LEONES_ (Stableford NETO y Stableford GROSS, status closed para no
 * aparecer en vivo), cada uno con 1 grupo de ronda libre (estado finalizada, fuera del
 * feed /en-vivo): Ana = usuario E2E (cuenta, handicap null en la tarjeta → índice del
 * perfil) y 2 invitados QA_LEONES_. Saca 390px claro/oscuro: sin sesión (neto, gross) y
 * con sesión (neto). Borra TODO en finally y verifica 0.
 *
 * Uso: node --env-file=.env.local scripts/qa-leones/board-vista-publica.mjs [baseUrl]
 */
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import path from 'node:path'

const BASE = process.argv[2] || 'http://localhost:3100'
// --gwi: un torneo GROSS EN VIVO a 13 hoyos para ver la fila del GWI de un jugador
// oculto (sin badge, sin HCP, narrativa vacía) a un visor sin sesión.
const MODO_GWI = process.argv.includes('--gwi')
const COURSE_ID = '8f64cd3a-daed-4d97-98e9-7f8ef9552f2d' // Club de Golf Los Leones
const OUT = path.resolve('.claude/screenshots/torneo-gross-neto')
const PAR = { 1: 4, 2: 4, 3: 3, 4: 5, 5: 4, 6: 3, 7: 4, 8: 4, 9: 5, 10: 4, 11: 3, 12: 4, 13: 4, 14: 3, 15: 4, 16: 4, 17: 5, 18: 5 }
const HASTA = MODO_GWI ? 13 : 18
const tarjeta = (d) => Object.fromEntries(Object.entries(PAR).filter(([h]) => Number(h) <= HASTA).map(([h, p]) => [h, p + d(Number(h))]))

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const creados = { torneos: [], rondas: [] }
const hoy = new Date().toISOString().slice(0, 10)
const sufijo = Math.random().toString(36).slice(2, 7)

async function e2eUser() {
  const email = process.env.E2E_TEST_USER_EMAIL
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const u = data.users.find((x) => x.email === email)
    if (u) return u
    if (data.users.length < 200) break
  }
  throw new Error('usuario E2E no encontrado')
}

async function torneo(modo, userId, { enVivo = false } = {}) {
  const slug = `qa-leones-board-${modo}-${sufijo}`
  const { data: t, error } = await admin.from('tournaments').insert({
    name: `QA_LEONES_ Board ${modo}`, slug, organizer_id: userId, course_id: COURSE_ID,
    format: 'stableford', formato_juego: 'stableford', modo_juego: modo, hole_count: 18,
    status: enVivo ? 'in_progress' : 'closed', date_start: hoy, date_end: hoy, afecta_estadisticas: false, hcp_calc_mode: 'whs',
  }).select('id, slug').single()
  if (error) throw error
  creados.torneos.push(t.id)
  const { data: r, error: e2 } = await admin.from('rondas_libres').insert({
    codigo: `QL${sufijo}${modo[0]}`.toUpperCase(), course_name: 'QA_LEONES_board', course_id: COURSE_ID,
    holes: 18, fecha: hoy, estado: 'finalizada', formato_juego: 'stableford', modo_juego: modo, tees: 'azul',
  }).select('id').single()
  if (e2) throw e2
  creados.rondas.push(r.id)
  const { error: e3 } = await admin.from('ronda_libre_jugadores').insert([
    { ronda_id: r.id, nombre: 'QA_LEONES_Ana (cuenta)', user_id: userId, handicap: null, tees: 'azul', scores: tarjeta((h) => (h % 3 === 0 ? 1 : 0)) },
    { ronda_id: r.id, nombre: 'QA_LEONES_Beto', user_id: null, handicap: 4, tees: 'azul', scores: tarjeta(() => 0) },
    { ronda_id: r.id, nombre: 'QA_LEONES_Caro', user_id: null, handicap: 24, tees: 'azul', scores: tarjeta((h) => (h % 2 === 0 ? 1 : 2)) },
  ])
  if (e3) throw e3
  const { error: e4 } = await admin.from('tournament_groups').insert({ tournament_id: t.id, name: 'QA_LEONES_Grupo 1', ronda_libre_id: r.id, sort_order: 0 })
  if (e4) throw e4
  return t.slug
}

async function limpiar() {
  if (creados.torneos.length) await admin.from('tournament_groups').delete().in('tournament_id', creados.torneos)
  if (creados.rondas.length) await admin.from('rondas_libres').delete().in('id', creados.rondas)
  if (creados.torneos.length) await admin.from('tournaments').delete().in('id', creados.torneos)
  const [{ count: t }, { count: r }, { count: g }, { count: j }] = await Promise.all([
    admin.from('tournaments').select('id', { count: 'exact', head: true }).like('name', 'QA_LEONES_%'),
    admin.from('rondas_libres').select('id', { count: 'exact', head: true }).like('course_name', 'QA_LEONES_%'),
    admin.from('tournament_groups').select('id', { count: 'exact', head: true }).like('name', 'QA_LEONES_%'),
    admin.from('ronda_libre_jugadores').select('id', { count: 'exact', head: true }).like('nombre', 'QA_LEONES_%'),
  ])
  console.log(`limpieza: torneos=${t} rondas=${r} grupos=${g} jugadores=${j}`)
  if (t || r || g || j) throw new Error('quedaron datos QA_LEONES_')
}

async function shot(browser, url, nombre, { conSesion = false, tema = 'light' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, colorScheme: tema })
  // El tema de la app NO sigue al sistema: lo fija `golfers-theme` (layout.tsx).
  await ctx.addInitScript((t) => { try { localStorage.setItem('golfers-theme', t) } catch {} }, tema)
  const page = await ctx.newPage()
  if (conSesion) {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 120000 })
    await page.waitForTimeout(1500) // hidratación: un fill antes de hidratar se pierde
    await page.fill('input[type=email]', process.env.E2E_TEST_USER_EMAIL)
    await page.fill('input[type=password]', process.env.E2E_TEST_USER_PASSWORD)
    await page.click('button[type=submit]')
    try {
      await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000, waitUntil: 'commit' })
    } catch (e) {
      await page.screenshot({ path: path.join(OUT, `login-fallo-${tema}.png`) })
      console.log('login no navegó; texto:', (await page.evaluate(() => document.body.innerText)).slice(0, 400))
      throw e
    }
  }
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForTimeout(1500)
  const archivo = path.join(OUT, `${nombre}-${tema}.png`)
  await page.screenshot({ path: archivo, fullPage: true })
  const texto = await page.evaluate(() => document.body.innerText)
  await ctx.close()
  return { archivo, texto }
}

try {
  const user = await e2eUser()
  const { data: prof } = await admin.from('profiles').select('indice').eq('id', user.id).single()
  console.log('índice E2E (Ana):', prof?.indice)
  if (MODO_GWI) {
    const vivo = await torneo('gross', user.id, { enVivo: true })
    const browser = await chromium.launch({ headless: true })
    for (const tema of ['light', 'dark']) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, colorScheme: tema })
      await ctx.addInitScript((t) => { try { localStorage.setItem('golfers-theme', t) } catch {} }, tema)
      const page = await ctx.newPage()
      await page.goto(`${BASE}/torneo/${vivo}`, { waitUntil: 'networkidle', timeout: 120000 })
      await page.waitForTimeout(1500)
      const fila = page.locator('button', { hasText: 'QA_LEONES_Ana' }).first()
      await fila.click()
      await page.waitForTimeout(400)
      await fila.scrollIntoViewIfNeeded()
      const archivo = path.join(OUT, `gwi-fila-oculta-${tema}.png`)
      await page.screenshot({ path: archivo })
      const panel = await fila.locator('xpath=..').innerText()
      console.log(`gwi-${tema}: ${archivo}`)
      console.log('    fila Ana:', panel.replace(/\s+/g, ' '))
      console.log('    hcp-info visibles:', await page.getByTestId('gwi-hcp-info').count())
      await ctx.close()
    }
    await browser.close()
  } else {
  const neto = await torneo('neto', user.id)
  const gross = await torneo('gross', user.id)
  const browser = await chromium.launch({ headless: true })
  const res = {}
  for (const tema of ['light', 'dark']) {
    res[`anon-neto-${tema}`] = await shot(browser, `${BASE}/torneo/${neto}`, 'anon-neto', { tema })
    res[`anon-gross-${tema}`] = await shot(browser, `${BASE}/torneo/${gross}`, 'anon-gross', { tema })
    res[`sesion-neto-${tema}`] = await shot(browser, `${BASE}/torneo/${neto}`, 'sesion-neto', { conSesion: true, tema })
  }
  await browser.close()
  for (const [k, v] of Object.entries(res)) {
    console.log(`${k}: ${v.archivo}`)
    console.log('   ', v.texto.replace(/\s+/g, ' ').slice(0, 600))
  }
  }
} finally {
  await limpiar()
}
