import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Locator, Page } from '@playwright/test'

/**
 * Recorridos del `/consejo` en modo pantalla (`.claude/commands/consejo.md`): un flujo real de la app recorrido como
 * lo haría un usuario, con una captura y medidas por pantalla. No es un test: no afirma nada. Deja evidencia para que
 * el consejo discuta sobre la pantalla que existe y no sobre una descripción.
 *
 * Solo corre contra la app local y la base de pruebas (`playwright.consejo.config.ts` usa el global-setup de los E2E,
 * que corta contra prod). Los recorridos llegan hasta la pantalla de confirmar y NO tocan el botón final.
 *
 * Salida (gitignored): `<CONSEJO_SALIDA o .claude/expedientes/consejo-recorridos>/<recorrido>/`
 *   NN-<paso>.png        la primera pantalla, lo que se ve sin desplazarse (lo que juzga el usuario de primera vez)
 *   NN-<paso>-entera.png la página completa
 *   recorrido.json       medidas y toques, para scripts
 *   recorrido.md         lo mismo en texto, para el expediente
 */

/** Medidas de una pantalla. Se calculan en el navegador sobre lo visible. */
export interface MedidasPantalla {
  /** Palabras visibles en toda la página (sin contar el menú de navegación). */
  palabras: number
  /** Cuántas pantallas de alto mide la página (1 = cabe sin desplazarse). */
  pantallasDeAlto: number
  /** Elementos que se pueden tocar (botones, links, campos). */
  tocables: number
  /** Tocables de menos de 44 px de alto o de ancho (mínimo para usar con guante, `DESIGN.md`). */
  tocablesChicos: string[]
  /** Campos que piden un dato o una elección (inputs, selects, grupos de opciones). */
  decisiones: number
  /** Textos de los botones visibles en la primera pantalla, en orden. */
  botonesPrimeraPantalla: string[]
  /** Píxeles que la página ya venía desplazada al llegar: si es > 0, la persona no ve el inicio de la pantalla. */
  llegaDesplazada: number
}

export interface PasoRecorrido {
  n: number
  paso: string
  /** Qué tiene que lograr el usuario en esta pantalla, en sus palabras. */
  objetivo: string
  /** Lo que realmente tocó el recorrido para avanzar desde esta pantalla (se completa con el siguiente toque). */
  tocoParaAvanzar: string[]
  url: string
  captura: string
  capturaEntera: string
  medidas: MedidasPantalla
}

export interface Recorrido {
  nombre: string
  tarea: string
  pasos: PasoRecorrido[]
  toques: number
  datosEscritos: number
  /** Escrituras a la base que el recorrido vio pasar (en la base de pruebas). Deberían ser solo borradores. */
  escrituras: string[]
}

const MEDIR = () => {
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0
  }
  const enNav = (el: Element) => !!el.closest('nav, header[role="banner"]')
  const texto = (document.querySelector('main') ?? document.body).innerText
  const palabras = texto.split(/\s+/).filter((w) => /\p{L}|\d/u.test(w)).length
  const sel = 'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="radio"], [role="tab"], [role="switch"], [role="checkbox"]'
  const tocables = [...document.querySelectorAll(sel)].filter((el) => visible(el) && !enNav(el))
  const tocablesChicos = tocables
    .filter((el) => {
      const r = el.getBoundingClientRect()
      return r.height < 44 || r.width < 44
    })
    .map((el) => {
      const r = el.getBoundingClientRect()
      const nombre = (el.getAttribute('aria-label') || (el as HTMLElement).innerText || el.getAttribute('placeholder') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40)
      return `${nombre} (${Math.round(r.width)}×${Math.round(r.height)})`
    })
  const grupos = new Set(
    [...document.querySelectorAll('[role="radiogroup"], [role="tablist"], fieldset')].filter((el) => visible(el) && !enNav(el)),
  )
  const campos = [...document.querySelectorAll('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), select, textarea')]
    .filter((el) => visible(el) && !enNav(el))
  const alto = window.innerHeight
  const botonesPrimeraPantalla = tocables
    .filter((el) => el.matches('button, [role="button"], a[href]') && el.getBoundingClientRect().top < alto)
    .map((el) => ((el as HTMLElement).innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40))
    .filter(Boolean)
  return {
    palabras,
    pantallasDeAlto: Math.round((document.documentElement.scrollHeight / alto) * 10) / 10,
    tocables: tocables.length,
    tocablesChicos,
    decisiones: campos.length + grupos.size,
    botonesPrimeraPantalla,
    llegaDesplazada: Math.round(window.scrollY),
  }
}

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/**
 * Arma un recorrido sobre `page`. Uso:
 *   const r = recorrido(page, 'nueva-ronda', 'Crear una ronda con un amigo en Los Leones')
 *   await r.pantalla('cancha', 'Elegir dónde juegas')
 *   await r.tocar(page.getByRole('button', { name: /siguiente/i }), 'Siguiente')
 *   ...
 *   r.guardar()
 */
export function recorrido(page: Page, nombre: string, tarea: string) {
  const dir = resolve(process.env.CONSEJO_SALIDA || '.claude/expedientes/consejo-recorridos', nombre)
  // Carpeta limpia en cada corrida: una captura vieja de otra corrida (otro nombre de paso) no debe colarse al consejo.
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const datos: Recorrido = { nombre, tarea, pasos: [], toques: 0, datosEscritos: 0, escrituras: [] }

  page.on('request', (req) => {
    const m = req.method()
    if (m === 'GET' || m === 'OPTIONS' || m === 'HEAD') return
    const url = new URL(req.url())
    if (url.pathname.startsWith('/auth/v1/') || url.pathname.includes('analytics_events')) return
    if (url.pathname.startsWith('/rest/v1/') || url.pathname.startsWith('/api/')) datos.escrituras.push(`${m} ${url.pathname}`)
  })

  const ultimo = () => datos.pasos[datos.pasos.length - 1]

  return {
    /** Captura la pantalla actual como un paso del recorrido. */
    async pantalla(paso: string, objetivo: string) {
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
      await page.waitForTimeout(400) // animaciones de entrada
      const n = datos.pasos.length + 1
      const base = `${String(n).padStart(2, '0')}-${slug(paso)}`
      const captura = join(dir, `${base}.png`)
      const capturaEntera = join(dir, `${base}-entera.png`)
      await page.screenshot({ path: captura })
      await page.screenshot({ path: capturaEntera, fullPage: true })
      const medidas = await page.evaluate(MEDIR)
      datos.pasos.push({ n, paso, objetivo, tocoParaAvanzar: [], url: new URL(page.url()).pathname, captura, capturaEntera, medidas })
    },
    /** Toca algo y lo anota como lo que se hizo en la pantalla actual. */
    async tocar(objetivo: Locator, etiqueta: string) {
      await objetivo.click()
      datos.toques += 1
      ultimo()?.tocoParaAvanzar.push(`tocar «${etiqueta}»`)
    },
    /** Escribe en un campo y lo anota. */
    async escribir(campo: Locator, valor: string, etiqueta: string) {
      await campo.fill(valor)
      datos.datosEscritos += 1
      ultimo()?.tocoParaAvanzar.push(`escribir «${valor}» en ${etiqueta}`)
    },
    guardar() {
      writeFileSync(join(dir, 'recorrido.json'), JSON.stringify(datos, null, 2))
      writeFileSync(join(dir, 'recorrido.md'), recorridoEnTexto(datos))
      return dir
    },
  }
}

/** El recorrido como texto para el expediente del consejo. Pura: la usan los tests. */
export function recorridoEnTexto(r: Recorrido): string {
  const filas = r.pasos.map((p) => {
    const m = p.medidas
    const chicos = m.tocablesChicos.length ? ` · ${m.tocablesChicos.length} bajo 44 px` : ''
    return `| ${p.n} | ${p.paso} | ${m.palabras} | ${m.pantallasDeAlto} | ${m.tocables}${chicos} | ${m.decisiones} | ${p.tocoParaAvanzar.join('; ') || '—'} |`
  })
  const chicos = r.pasos.flatMap((p) => p.medidas.tocablesChicos.map((c) => `- Paso ${p.n} (${p.paso}): ${c}`))
  const desplazadas = r.pasos
    .filter((p) => p.medidas.llegaDesplazada > 0)
    .map((p) => `- Paso ${p.n} (${p.paso}): llega ${p.medidas.llegaDesplazada} px más abajo; la captura muestra lo que ve la persona, no el inicio`)
  return [
    `# Recorrido «${r.nombre}»`,
    '',
    `**Tarea:** ${r.tarea}`,
    '',
    `**Total:** ${r.pasos.length} pantallas · ${r.toques} toques · ${r.datosEscritos} datos escritos · ` +
      `${r.pasos.reduce((s, p) => s + p.medidas.palabras, 0)} palabras para leer · ` +
      `${r.pasos.reduce((s, p) => s + p.medidas.decisiones, 0)} campos o elecciones`,
    '',
    '| # | Pantalla | Palabras | Pantallas de alto | Tocables | Campos/elecciones | Qué se hizo para avanzar |',
    '|---|---|---|---|---|---|---|',
    ...filas,
    '',
    '## Capturas (primera pantalla, en orden)',
    ...r.pasos.map((p) => `${p.n}. ${p.paso} — objetivo: ${p.objetivo}\n   - ${p.captura}\n   - entera: ${p.capturaEntera}`),
    '',
    '## Pantallas que llegan desplazadas (no muestran su inicio)',
    ...(desplazadas.length ? desplazadas : ['- Ninguna.']),
    '',
    '## Tocables bajo 44 px',
    ...(chicos.length ? chicos : ['- Ninguno.']),
    '',
    '## Escrituras a la base durante el recorrido (base de pruebas)',
    ...(r.escrituras.length ? r.escrituras.map((e) => `- ${e}`) : ['- Ninguna.']),
    '',
  ].join('\n')
}
