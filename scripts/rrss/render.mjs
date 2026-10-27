#!/usr/bin/env node
// Renderiza una pieza de Instagram a PNG, sin IA: plantilla de marca + Playwright.
//
//   node scripts/rrss/render.mjs scripts/rrss/piezas/<slug>.json [--abrir]
//
// Deja las láminas en out/rrss/<slug>/NN.png y una hoja de contactos para revisar
// la tanda de un vistazo. Si un control de marca falla, no renderiza nada.
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { MEDIDA, CSS_BASE, URL_FUENTES } from './marca.mjs'
import { direccion } from './plantillas/index.mjs'
import { validarPieza } from './validar.mjs'

const RAIZ = process.cwd()

function documento(pieza, dir, lamina, indice) {
  const medida = MEDIDA[pieza.formato === 'story' ? 'story' : 'carrusel']
  const construir = dir.laminas[lamina.plantilla]
  if (!construir)
    throw new Error(
      `La dirección "${dir.clave}" no tiene la plantilla "${lamina.plantilla}". Hay: ${Object.keys(dir.laminas).join(', ')}`,
    )
  const contenido = construir(lamina, { indice: indice + 1, rotulo: pieza.rotulo })
  const clases = ['fr', dir.clave === 'bloomberg' ? 'b' : dir.clave]
  if (pieza.formato === 'story') clases.push('s')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${URL_FUENTES}">
<style>${CSS_BASE}${dir.css}
body{margin:0;width:${medida.ancho}px;height:${medida.alto}px}
.fr{width:${medida.ancho}px;height:${medida.alto}px}
</style></head><body>${sonda(dir.familias)}<div class="${clases.join(' ')}">${contenido}</div></body></html>`
}

/**
 * Las fuentes son la marca: si una no cargó de verdad, el render falla.
 * Se mira el estado real de cada FontFace y no `fonts.check()`, que pregunta por
 * el peso 400 y daría "falta" en familias que solo traemos en 500/700/800.
 * La sonda invisible fuerza la carga de todas, incluso las que una lámina usa poco.
 */
async function exigirFuentes(page, familias) {
  await page.evaluate(() => document.fonts.ready)
  const faltan = await page.evaluate((fams) => {
    const cargada = (f) => [...document.fonts].some((x) => x.family === f && x.status === 'loaded')
    return fams.filter((f) => !cargada(f))
  }, familias)
  if (faltan.length)
    throw new Error(
      `No cargaron las fuentes ${faltan.join(', ')}. Sin ellas la pieza sale con la tipografía equivocada.`,
    )
}

/** Texto invisible fuera del marco: obliga al navegador a bajar cada familia. */
function sonda(familias) {
  const pesos = [400, 500, 600, 700, 800]
  const spans = familias
    .flatMap((f) => pesos.map((p) => `<span style="font-family:'${f}';font-weight:${p}">0</span>`))
    .join('')
  return `<div style="position:fixed;top:0;left:0;opacity:0;pointer-events:none">${spans}</div>`
}

export async function renderizar(rutaPieza) {
  const pieza = JSON.parse(await readFile(rutaPieza, 'utf8'))

  const problemas = validarPieza(pieza)
  if (problemas.length) {
    console.error(`✗ ${pieza.slug ?? rutaPieza}: la pieza no pasa los controles de marca\n`)
    problemas.forEach((p) => console.error(`   · ${p}`))
    process.exitCode = 1
    return null
  }

  const dir = direccion(pieza.direccion)
  const medida = MEDIDA[pieza.formato === 'story' ? 'story' : 'carrusel']
  const salida = path.join(RAIZ, 'out', 'rrss', pieza.slug)
  await rm(salida, { recursive: true, force: true })
  await mkdir(salida, { recursive: true })

  const navegador = await chromium.launch()
  const archivos = []
  try {
    const page = await navegador.newPage({
      viewport: { width: medida.ancho, height: medida.alto },
      deviceScaleFactor: 1,
    })
    for (const [i, lamina] of pieza.laminas.entries()) {
      await page.setContent(documento(pieza, dir, lamina, i), { waitUntil: 'networkidle' })
      await exigirFuentes(page, dir.familias)
      const archivo = path.join(salida, `${String(i + 1).padStart(2, '0')}.png`)
      await page.locator('.fr').screenshot({ path: archivo })
      archivos.push(archivo)
      console.log(`   ${String(i + 1).padStart(2, '0')}. ${lamina.plantilla} → ${path.relative(RAIZ, archivo)}`)
    }
    await hojaDeContactos(page, pieza, archivos, salida)
  } finally {
    await navegador.close()
  }

  await writeFile(
    path.join(salida, 'publicacion.json'),
    JSON.stringify(
      { slug: pieza.slug, formato: pieza.formato, caption: pieza.caption, hashtags: pieza.hashtags, laminas: archivos.map((a) => path.relative(RAIZ, a)) },
      null,
      2,
    ) + '\n',
  )
  console.log(`\n✓ ${pieza.slug}: ${archivos.length} láminas en ${path.relative(RAIZ, salida)}`)
  return { pieza, archivos, salida }
}

/** Todas las láminas en una imagen: es lo que se mira para revisar la tanda. */
async function hojaDeContactos(page, pieza, archivos, salida) {
  const medida = MEDIDA[pieza.formato === 'story' ? 'story' : 'carrusel']
  const ancho = 300
  const alto = Math.round((medida.alto / medida.ancho) * ancho)
  const imgs = await Promise.all(
    archivos.map(async (a, i) => {
      const b64 = (await readFile(a)).toString('base64')
      return `<figure><img src="data:image/png;base64,${b64}"><figcaption>${String(i + 1).padStart(2, '0')}</figcaption></figure>`
    }),
  )
  const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#0B0F16;color:#8A97A8;font:13px/1.4 system-ui;padding:24px}
.g{display:flex;flex-wrap:wrap;gap:16px}figure{margin:0}
img{width:${ancho}px;height:${alto}px;display:block;background:#000}
figcaption{padding-top:6px;font-variant-numeric:tabular-nums}
</style><div class="g">${imgs.join('')}</div>`
  await page.setContent(html, { waitUntil: 'load' })
  const archivo = path.join(salida, 'hoja-de-contactos.png')
  await page.locator('.g').screenshot({ path: archivo })
  console.log(`   hoja de contactos → ${path.relative(RAIZ, archivo)}`)
}

const esCLI = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))
if (esCLI) {
  const ruta = process.argv[2]
  if (!ruta) {
    console.error('Uso: node scripts/rrss/render.mjs scripts/rrss/piezas/<slug>.json')
    process.exit(1)
  }
  await renderizar(path.resolve(ruta))
}
