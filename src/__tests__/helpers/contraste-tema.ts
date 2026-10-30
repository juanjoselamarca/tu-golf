/**
 * Medir contraste WCAG contra los tokens REALES de `globals.css`, en claro y en
 * oscuro.
 *
 * Fuente única de esta matemática para los tests: la tenía copiada
 * `src/components/ui/Toggle.test.ts` y la volvió a necesitar el avatar del
 * header del borrador, que en oscuro pintaba la inicial con el mismo color del
 * círculo. Dos copias significaban dos definiciones de "contrasta", y la del
 * avatar ni existía.
 *
 * Lo que mide: el valor del token, no una copia del valor. Si alguien cambia
 * `--brand-dark` en `globals.css`, lo miden los tests que lo usan.
 *
 * `scripts/audit-contrast.mjs` y `scripts/audit-visual-theme.mjs` tienen su
 * propia copia: son auditorías de consola en `.mjs` sueltas del grafo de la app
 * y no entran al `vitest`. Si alguna pasa a ser gate, importa de acá.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

export type Tema = 'light' | 'dark'
export type RGBA = [number, number, number, number]

const CSS = fs.readFileSync(path.resolve(__dirname, '../../app/globals.css'), 'utf8')

function bloque(selector: string): string {
  const i = CSS.indexOf(`\n${selector} {`)
  if (i < 0) throw new Error(`No encontré el bloque ${selector} en globals.css`)
  return CSS.slice(i, CSS.indexOf('\n}', i))
}

/**
 * Valor literal de un token para un tema. El tema manda; si no lo redefine, se
 * cae a `:root` (que es el default claro de la app).
 */
export function token(tema: Tema, nombre: string): string {
  const re = new RegExp(`${nombre.replace(/-/g, '\\-')}\\s*:\\s*([^;]+);`)
  const v = bloque(`[data-theme="${tema}"]`).match(re)?.[1] ?? bloque(':root').match(re)?.[1]
  if (!v) throw new Error(`Token ${nombre} no definido para ${tema}`)
  return v.trim()
}

/** `#rrggbb`, `rgb()` o `rgba()` → RGBA. Un token sin resolver revienta acá. */
export function parse(c: string): RGBA {
  const hex = c.match(/^#([0-9a-f]{6})$/i)
  if (hex) return [0, 2, 4].map((k) => parseInt(hex[1].slice(k, k + 2), 16)).concat(1) as RGBA
  const rgb = c.match(/^rgba?\(([^)]+)\)$/)
  if (rgb) {
    const [r, g, b, a = '1'] = rgb[1].split(',').map((s) => s.trim())
    return [Number(r), Number(g), Number(b), Number(a)]
  }
  throw new Error(`Color no soportado: ${c}`)
}

/** Compone `fg` (posible alpha) sobre `bg` opaco. Medir sin esto infla el ratio. */
export function sobre(fg: RGBA, bg: RGBA): RGBA {
  const a = fg[3]
  return [0, 1, 2].map((k) => fg[k] * a + bg[k] * (1 - a)).concat(1) as RGBA
}

export function luminancia([r, g, b]: RGBA): number {
  const lin = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contraste(a: RGBA, b: RGBA): number {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

/**
 * Contraste de un par de tokens (texto sobre fondo) en un tema, compositando el
 * texto sobre el fondo si trae alpha.
 */
export function contrasteDeTokens(tema: Tema, textoToken: string, fondoToken: string): number {
  const fondo = parse(token(tema, fondoToken))
  const texto = sobre(parse(token(tema, textoToken)), fondo)
  return contraste(texto, fondo)
}
