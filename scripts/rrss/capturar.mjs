#!/usr/bin/env node
// Graba la app en 9:16 para una pieza de video: abre el scorer en un teléfono
// simulado, ejecuta el guion de la pieza y deja los fotogramas con su duración.
//
//   node --env-file=.env.local scripts/test-db/con-base-de-pruebas.mjs -- \
//     node scripts/rrss/capturar.mjs <slug> [--sin-frames]
//
// Contra la BASE DE PRUEBAS y un `next dev` local, nunca contra producción: la
// toma ESCRIBE golpes, y en prod eso es basura visible en /en-vivo.
//
// No se graba video del navegador a propósito. Playwright escala el video al
// tamaño pedido y el texto sale blando; acá cada fotograma es un screenshot a
// 1080x1920 reales, con su duración medida, y `montar.mjs` los pega respetando
// esos tiempos. El movimiento que se ve es el que pasó de verdad.
import { chromium } from 'playwright'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { ESCENAS } from './escenas.mjs'

/** 9:16 exacto en CSS px, con escala 2.5 → fotogramas de 1080x1920. */
export const TELEFONO = {
  viewport: { width: 432, height: 768 },
  deviceScaleFactor: 2.5,
  isMobile: true,
  hasTouch: true,
  locale: 'es-CL',
  timezoneId: 'America/Santiago',
  colorScheme: 'dark',
}

const BASE = process.env.RRSS_BASE_URL ?? 'http://localhost:3100'
const REF_PROD = 'hoswfwhvcgqlqdmzpnce'

/**
 * El dedo. Sin esto el número cambia solo y la pieza no se entiende: nadie ve
 * quién lo tocó. Es el mismo recurso que usan los demos de Garmin y Apple.
 * Dorado de marca, translúcido, por encima de todo y sin capturar el click.
 */
const CSS_TOQUE = `
@keyframes gp-toque-entra {
  from { transform: translate(-50%, -50%) scale(.55); opacity: 0 }
  to   { transform: translate(-50%, -50%) scale(1);   opacity: 1 }
}
#gp-toque {
  position: fixed; z-index: 2147483647; pointer-events: none;
  width: 68px; height: 68px; border-radius: 50%;
  border: 2px solid rgba(196, 153, 42, .95);
  background: radial-gradient(circle, rgba(196,153,42,.30) 0%, rgba(196,153,42,.12) 62%, transparent 72%);
  box-shadow: 0 0 22px rgba(196, 153, 42, .35);
  animation: gp-toque-entra 130ms ease-out both;
}
`

/**
 * Una toma: el navegador más el cuaderno de fotogramas.
 *
 * `frame(ms)` sostiene una pantalla quieta (un solo archivo, sin tirones) y
 * `rafaga(ms)` captura lo más rápido que da durante un movimiento, anotando el
 * tiempo real entre capturas. Las duraciones medidas son las que manda el
 * montaje, así que el video corre al ritmo de lo que efectivamente ocurrió.
 */
class Toma {
  constructor(page, dir) {
    this.page = page
    this.dir = dir
    this.frames = []
    this.n = 0
  }

  async #capturar() {
    const archivo = `${String(this.n++).padStart(4, '0')}.jpg`
    await this.page.screenshot({
      path: path.join(this.dir, archivo),
      type: 'jpeg',
      quality: 95,
    })
    return archivo
  }

  /** Una pantalla quieta durante `ms`. */
  async frame(ms, nota = '') {
    const archivo = await this.#capturar()
    this.frames.push({ archivo, ms, nota })
    return archivo
  }

  /** Captura continua durante `ms`, con la duración real de cada fotograma. */
  async rafaga(ms, nota = '') {
    const fin = Date.now() + ms
    let previo = null
    let t = Date.now()
    while (Date.now() < fin) {
      const archivo = await this.#capturar()
      const ahora = Date.now()
      if (previo) previo.ms = ahora - t
      t = ahora
      previo = { archivo, ms: 0, nota }
      this.frames.push(previo)
    }
    // El último no tiene sucesor que le mida el tiempo: se le da el promedio.
    const medidos = this.frames.filter((f) => f.nota === nota && f.ms > 0)
    if (previo)
      previo.ms = medidos.length
        ? Math.round(medidos.reduce((a, f) => a + f.ms, 0) / medidos.length)
        : 125
  }

  /**
   * Un toque con el dedo a la vista: aparece el círculo, se captura un
   * instante con el dedo puesto, se hace el click y recién ahí se levanta.
   * Las tres partes son ráfaga porque lo que se ve es movimiento.
   */
  async tocar(locator, { antes = 380, durante = 620, despues = 1000, nota = 'toque' } = {}) {
    const caja = await locator.boundingBox()
    if (!caja) throw new Error(`el elemento del toque "${nota}" no está en pantalla`)
    await this.page.evaluate(
      ({ x, y, css }) => {
        if (!document.getElementById('gp-toque-css')) {
          const estilo = document.createElement('style')
          estilo.id = 'gp-toque-css'
          estilo.textContent = css
          document.head.appendChild(estilo)
        }
        document.getElementById('gp-toque')?.remove()
        const dedo = document.createElement('div')
        dedo.id = 'gp-toque'
        dedo.style.left = `${x}px`
        dedo.style.top = `${y}px`
        document.body.appendChild(dedo)
      },
      { x: caja.x + caja.width / 2, y: caja.y + caja.height / 2, css: CSS_TOQUE },
    )
    await this.rafaga(antes, `${nota}-dedo`)
    await locator.click()
    await this.rafaga(durante, `${nota}-cambio`)
    await this.page.evaluate(() => document.getElementById('gp-toque')?.remove())
    if (despues > 0) await this.rafaga(despues, nota)
  }

  get duracionMs() {
    return this.frames.reduce((a, f) => a + f.ms, 0)
  }
}

/**
 * El indicador de Next en dev (la "N" flotante abajo a la izquierda) sale en
 * TODOS los fotogramas. Un reel con el badge de desarrollo encima es
 * exactamente el detalle que delata que no es la app de verdad.
 */
async function ocultarRuidoDeDev(page) {
  await page.addInitScript(() => {
    const poner = () => {
      // addInitScript corre ANTES de que exista <html>: el primer intento
      // encuentra document.documentElement en null y revienta. Se intenta
      // igual (en una navegación blanda el DOM ya está) y se reintenta al
      // DOMContentLoaded, que es cuando seguro hay dónde colgarlo.
      const destino = document.head ?? document.documentElement
      if (!destino || document.getElementById('gp-sin-ruido')) return
      const estilo = document.createElement('style')
      estilo.id = 'gp-sin-ruido'
      estilo.textContent =
        'nextjs-portal, #__next-build-watcher, [data-nextjs-toast], [data-nextjs-dev-tools-button] { display: none !important }'
      destino.appendChild(estilo)
    }
    poner()
    document.addEventListener('DOMContentLoaded', poner)
  })
}

async function iniciarSesion(page) {
  const email = process.env.E2E_TEST_USER_EMAIL
  const password = process.env.E2E_TEST_USER_PASSWORD
  if (!email || !password) throw new Error('faltan E2E_TEST_USER_EMAIL / _PASSWORD')

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 120_000 })
  // El primer fill se pierde: React hidrata después y deja el campo en blanco,
  // el submit dispara "Please fill out this field" y la toma arranca sin sesión.
  await page.waitForTimeout(2500)
  for (let intento = 1; intento <= 3; intento++) {
    await page.fill('input[type=email]', email)
    await page.fill('input[type=password]', password)
    if ((await page.inputValue('input[type=email]')) === email) break
    if (intento === 3) throw new Error('el formulario de login no retiene el email')
    await page.waitForTimeout(1500)
  }
  await page.click('button[type=submit]')
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60_000 })
}

/**
 * El aviso de "No molestar" es correcto en cancha y arruina la toma: tapa media
 * pantalla con una hoja modal. Se marca como visto antes de entrar al scorer,
 * que es lo mismo que pasa en el teléfono de alguien que ya lo vio.
 */
async function silenciarAvisoNoMolestar(page, codigo) {
  await page.addInitScript(
    ({ clave, valor }) => {
      try {
        window.localStorage.setItem(clave, JSON.stringify([valor]))
      } catch {
        /* sin storage la toma igual corre, solo sale el aviso */
      }
    },
    { clave: 'gp:aviso-no-molestar:v1', valor: `ronda-libre:${codigo}` },
  )
}

/**
 * El tema con el que se graba. La app arranca en claro salvo que el teléfono
 * ya tenga elegido el oscuro, y en Instagram el navy con dorado es la marca:
 * el crema del modo claro se pierde en el feed y parte la pantalla en dos.
 */
async function fijarTema(page, tema) {
  await page.addInitScript((t) => {
    try {
      window.localStorage.setItem('golfers-theme', t)
    } catch {
      /* sin storage la app cae a claro: la toma igual sale, con otro color */
    }
  }, tema)
}

export async function grabar(slug, { sinFrames = false } = {}) {
  const escena = ESCENAS[slug]
  if (!escena) throw new Error(`la escena "${slug}" no existe en escenas.mjs`)
  if ((process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').includes(REF_PROD))
    throw new Error('la toma apunta a PRODUCCIÓN: córrela con con-base-de-pruebas.mjs')

  const { default: guion } = await import(`./guiones/${slug}.mjs`)
  const dir = path.join('out', 'rrss', slug, 'frames')
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage(TELEFONO)
  const errores = []
  page.on('pageerror', (e) => errores.push(e.message))

  try {
    await ocultarRuidoDeDev(page)
    await fijarTema(page, escena.tema ?? 'dark')
    await silenciarAvisoNoMolestar(page, escena.codigo)
    await iniciarSesion(page)
    const toma = new Toma(page, dir)
    const notas = await guion({ page, toma, escena, BASE, sinFrames })
    await writeFile(
      path.join(dir, '..', 'frames.json'),
      JSON.stringify({ slug, frames: toma.frames, notas }, null, 2),
      'utf8',
    )
    return { toma, notas, errores }
  } finally {
    await browser.close()
  }
}

async function main() {
  const slug = process.argv[2]
  const sinFrames = process.argv.includes('--sin-frames')
  if (!slug) {
    console.error(`Uso: node scripts/rrss/capturar.mjs <slug>. Hay: ${Object.keys(ESCENAS).join(', ')}`)
    process.exit(1)
  }
  const { toma, notas, errores } = await grabar(slug, { sinFrames })
  for (const [k, v] of Object.entries(notas ?? {})) console.log(`   ${k}: ${v}`)
  if (errores.length) console.log(`   ⚠ errores de página: ${errores.join(' · ')}`)
  console.log(
    `✅ ${toma.frames.length} fotogramas · ${(toma.duracionMs / 1000).toFixed(1)} s · out/rrss/${slug}/frames`,
  )
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`❌ ${e.message}`)
    process.exit(1)
  })
}
