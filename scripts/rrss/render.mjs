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
import { CSS_BASE, URL_FUENTES, familiasConPesos, medidaDe } from './marca.mjs'
import { direccion } from './plantillas/index.mjs'
import { validarPieza } from './validar.mjs'

const RAIZ = process.cwd()

function documento(pieza, dir, lamina, indice) {
  const medida = medidaDe(pieza)
  // Que la plantilla exista y traiga sus campos ya lo verificó `validarPieza`;
  // esto queda como red por si alguien llama a documento() por su cuenta.
  const construir = dir.laminas[lamina.plantilla]
  if (!construir)
    throw new Error(
      `La dirección "${dir.clave}" no tiene la plantilla "${lamina.plantilla}". Hay: ${Object.keys(dir.laminas).join(', ')}`,
    )
  const contenido = construir(lamina, { indice: indice + 1, rotulo: pieza.rotulo })
  // Sin clase de formato: ninguna dirección tiene reglas 9:16 todavía y
  // `FORMATOS_LISTOS` solo deja pasar carrusel. Cuando haya story, la clase
  // vuelve junto con el CSS que la use, no antes.
  const clases = ['fr', dir.clave === 'bloomberg' ? 'b' : dir.clave]
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
 *
 * Se exige familia Y PESO. Comparar solo la familia dejaba pasar lo que más
 * duele: con Inter Tight 500 cargada y el titular pidiendo 800, el navegador
 * SINTETIZA un faux-bold — la pieza sale con una tipografía que no es la marca
 * y el control decía que todo bien. Tampoco sirve `fonts.check()`: pregunta por
 * el peso 400 y daría "falta" en familias que solo traemos en 500/700/800.
 */
async function exigirFuentes(page, familias) {
  // Si una dirección declara una familia que no está en FAMILIAS_GOOGLE, no se
  // le pide a Google y el control pasaría en vacío: eso es un error de la
  // dirección, no de la carga.
  const catalogo = familiasConPesos()
  const desconocidas = familias.filter((f) => !catalogo.some((x) => x.familia === f))
  if (desconocidas.length)
    throw new Error(
      `La dirección declara familias que nadie le pide a Google: ${desconocidas.join(', ')}. ` +
        'Agregalas a FAMILIAS_GOOGLE en marca.mjs.',
    )

  const pedidas = catalogo.filter((f) => familias.includes(f.familia))
  await page.evaluate(() => document.fonts.ready)
  const faltan = await page.evaluate((pedidas) => {
    // Una cara estática declara un peso ("700"); una variable, un rango ("100 900").
    const cubre = (spec, peso) => {
      const n = String(spec).trim().split(/\s+/).map(Number)
      return n.length === 2 ? peso >= n[0] && peso <= n[1] : n[0] === peso
    }
    const hayCara = (familia, peso) =>
      [...document.fonts].some(
        (c) => c.family === familia && c.status === 'loaded' && cubre(c.weight, peso),
      )

    const malos = []

    // (a) Llegó lo que le pedimos a Google.
    for (const { familia, pesos } of pedidas) {
      if (![...document.fonts].some((x) => x.family === familia)) {
        malos.push(`${familia} (ninguna cara)`)
        continue
      }
      for (const peso of pesos) if (!hayCara(familia, peso)) malos.push(`${familia} ${peso}`)
    }

    // (b) Y lo que el CSS de verdad usa está cubierto. Esto es lo que caza el
    // faux-bold: un `font-weight:900` en una plantilla, sin ese peso en
    // FAMILIAS_GOOGLE, se ve bold pero lo sintetizó el navegador.
    const generica = /^(sans-serif|serif|monospace|cursive|fantasy|system-ui|ui-[a-z-]+)$/i
    const usados = new Set()
    for (const el of document.querySelectorAll('.fr, .fr *')) {
      const propio = [...el.childNodes].some(
        (n) => n.nodeType === 3 && n.textContent.trim(),
      )
      if (!propio) continue
      const cs = getComputedStyle(el)
      const familia = cs.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '')
      if (!familia || generica.test(familia)) continue
      usados.add(`${familia}|${cs.fontWeight}`)
    }
    for (const clave of usados) {
      const [familia, peso] = clave.split('|')
      if (!hayCara(familia, Number(peso)))
        malos.push(`${familia} ${peso} (lo usa el CSS y no hay cara: sale sintetizado)`)
    }

    return malos
  }, pedidas)

  if (faltan.length)
    throw new Error(
      `No cargaron estas fuentes: ${faltan.join(', ')}. Sin ellas la pieza sale con ` +
        'la tipografía equivocada o con un peso sintetizado por el navegador.',
    )
}

/**
 * Texto invisible fuera del marco: obliga al navegador a bajar cada familia en
 * cada peso que declaramos, incluso los que una lámina usa poco. Se piden los
 * pesos REALES del spec: pedir un 400 que no existe hacía que el navegador
 * sintetizara una cara y ensuciaba la medición.
 */
function sonda(familias) {
  const spans = familiasConPesos()
    .filter((f) => familias.includes(f.familia))
    .flatMap(({ familia, pesos }) =>
      pesos.map((p) => `<span style="font-family:'${familia}';font-weight:${p}">0</span>`),
    )
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
  const medida = medidaDe(pieza)
  // Este rm es seguro SOLO porque validarPieza() ya aprobó el slug contra
  // /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/: sin barras ni "..", no puede salirse de
  // out/rrss/. Si alguna vez se relaja ese patrón, hay que revisar esta línea.
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
  const medida = medidaDe(pieza)
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
