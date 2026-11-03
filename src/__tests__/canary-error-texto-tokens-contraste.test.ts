/**
 * Canario — el texto de error de formulario usa los tokens de error y pasa AA.
 *
 * Dos mitades, porque una sola no alcanza:
 *
 *  1. ESTRUCTURA: las superficies de error auditadas no pueden volver a `var(--double)`
 *     (es color de score, espejo de GARMIN_COLORS) ni a los literales rojos escritos a
 *     mano `rgba(239,68,68,…)` / `#b91c1c`. Eso caza la regresión por copiar-pegar.
 *
 *  2. CONTRASTE REAL: calcula el contraste de `--error-fg` COMPOSITANDO el alpha de
 *     `--error-bg` sobre `--bg` del tema, en claro y en oscuro. Sin compositar, un
 *     rgba() se mide contra sí mismo y cualquier color "pasa".
 *
 * La mitad 2 es la que discrimina de verdad: si alguien cambia el valor del token a un
 * rojo que no llega a 4.5:1, la mitad 1 sigue verde y ésta se pone roja.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const raiz = join(__dirname, '..', '..')
// Sin comentarios: el de globals.css:131 dice literalmente "No usar --double: es
// color de score…", y un `[^;]+` lo lee como si fuera la declaración del token.
const css = readFileSync(join(raiz, 'src', 'app', 'globals.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
)

/** Superficies de error auditadas la noche del 01-nov-2026 (fuera de zona crítica). */
const ARCHIVOS = [
  'src/app/organizador/nuevo/components/StartModal.tsx',
  'src/app/organizador/nuevo/DraftFooter.tsx',
  'src/app/organizador/nuevo/DraftPreviewModal.tsx',
  'src/components/DefaultTeeBanner.tsx',
  'src/app/organizador/[slug]/jugadores/components/InscribirPlayerForm.tsx',
  'src/app/recuperar/page.tsx',
]

/** Literales rojos escritos a mano que estos archivos usaban antes del arreglo. */
const LITERALES_PROHIBIDOS: Array<[string, RegExp]> = [
  ['--double como color de texto', /color:\s*'var\(--double\)'/],
  ['rojo #EF4444 a mano', /rgba\(\s*239\s*,\s*68\s*,\s*68/],
  ['#b91c1c (valor del tema claro) hardcodeado', /'#b91c1c'/i],
  ['#854d0e (valor del tema claro) hardcodeado', /'#854d0e'/i],
]

/**
 * Extrae el cuerpo de un bloque CSS por su selector, contando llaves.
 * Sin regex multilínea: el archivo es CRLF y las clases anidadas rompen el no-greedy.
 */
function cuerpoDeBloque(selector: string): string {
  // Anclado a principio de línea y seguido de `{`: si no, el indexOf cae en el
  // comentario que nombra el selector (globals.css:121) o en `[data-theme] body`.
  const escapado = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = css.match(new RegExp(`^${escapado}\\s*\\{`, 'm'))
  if (m?.index === undefined) throw new Error(`No se encontró el bloque ${selector}`)
  const abre = css.indexOf('{', m.index)
  let nivel = 0
  for (let i = abre; i < css.length; i++) {
    if (css[i] === '{') nivel++
    else if (css[i] === '}') {
      nivel--
      if (nivel === 0) return css.slice(abre + 1, i)
    }
  }
  throw new Error(`Bloque ${selector} sin cerrar`)
}

function bloqueDeTema(tema: 'light' | 'dark'): string {
  const propio = cuerpoDeBloque(`[data-theme="${tema}"]`)
  // El claro hereda de :root (los tokens default son los del tema claro).
  return tema === 'light' ? `${cuerpoDeBloque(':root')}\n${propio}` : propio
}

function token(bloque: string, nombre: string): string {
  // Última aparición: en CSS gana la que se declara después.
  const todas = [...bloque.matchAll(new RegExp(`${nombre}:\\s*([^;]+);`, 'g'))]
  if (todas.length === 0) throw new Error(`Token ${nombre} no declarado en el bloque`)
  return todas[todas.length - 1][1].trim()
}

type RGBA = { r: number; g: number; b: number; a: number }

function parse(color: string): RGBA {
  const hex = color.match(/^#([0-9a-fA-F]{6})$/)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }
  }
  const rgba = color.match(
    /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/,
  )
  if (rgba) {
    return { r: +rgba[1], g: +rgba[2], b: +rgba[3], a: rgba[4] === undefined ? 1 : +rgba[4] }
  }
  throw new Error(`Color no parseable: ${color}`)
}

/** Aplana `encima` (con alpha) sobre `debajo` (opaco). */
function compositar(encima: RGBA, debajo: RGBA): RGBA {
  return {
    r: encima.r * encima.a + debajo.r * (1 - encima.a),
    g: encima.g * encima.a + debajo.g * (1 - encima.a),
    b: encima.b * encima.a + debajo.b * (1 - encima.a),
    a: 1,
  }
}

function luminancia({ r, g, b }: RGBA): number {
  const f = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function contraste(a: RGBA, b: RGBA): number {
  const [hi, lo] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('canario: texto de error con tokens y contraste AA', () => {
  it('ningún archivo auditado vuelve a --double ni a literales rojos a mano', () => {
    const reincidentes: string[] = []
    for (const rel of ARCHIVOS) {
      const src = readFileSync(join(raiz, rel), 'utf8')
      for (const [motivo, patron] of LITERALES_PROHIBIDOS) {
        if (patron.test(src)) reincidentes.push(`${rel} → ${motivo}`)
      }
    }
    expect(
      reincidentes,
      `Usar --error-fg / --error-bg / --error-border:\n${reincidentes.join('\n')}`,
    ).toEqual([])
  })

  it('los archivos auditados consumen los tokens de error', () => {
    const sinTokens = ARCHIVOS.filter(
      (rel) => !/var\(--error-(fg|bg|border)\)/.test(readFileSync(join(raiz, rel), 'utf8')),
    )
    expect(
      sinTokens,
      `Estos archivos deberían consumir los tokens de error: ${sinTokens.join(', ')}`,
    ).toEqual([])
  })

  it.each(['light', 'dark'] as const)(
    '--error-fg sobre --error-bg compositado en --bg pasa AA 4.5:1 en tema %s',
    (tema) => {
      const bloque = bloqueDeTema(tema)
      const fondo = parse(token(bloque, '--bg'))
      const tinte = parse(token(bloque, '--error-bg'))
      const texto = parse(token(bloque, '--error-fg'))

      // La superficie real que ve el ojo: el tinte translúcido aplanado sobre el fondo.
      const ratio = contraste(texto, compositar(tinte, fondo))

      expect(
        ratio,
        `tema ${tema}: --error-fg ${token(bloque, '--error-fg')} sobre --error-bg ` +
          `compositado = ${ratio.toFixed(2)}:1 (piso AA 4.5:1)`,
      ).toBeGreaterThanOrEqual(4.5)
    },
  )

  it('--double NO habría pasado AA en oscuro (el piso de arriba discrimina)', () => {
    // Prueba de que el umbral mide algo real: el color que se sacó reprueba.
    const oscuro = bloqueDeTema('dark')
    const superficie = compositar(parse(token(oscuro, '--error-bg')), parse(token(oscuro, '--bg')))
    const doble = parse(token(bloqueDeTema('light'), '--double'))
    expect(contraste(doble, superficie)).toBeLessThan(4.5)
  })
})
