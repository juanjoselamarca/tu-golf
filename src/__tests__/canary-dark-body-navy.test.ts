/**
 * Canario: el fondo del `body` en tema oscuro es el navy canónico, no el oliva legacy.
 *
 * Hallazgo 31-oct-2026 (QA Design nocturno). `[data-theme="dark"] body` traía los
 * literales del palette legacy — `background-color: #08120f` y
 * `linear-gradient(180deg, #08120f 0%, #0d1b17 100%)` — más una viñeta verde
 * `rgba(30, 70, 55, 0.35)`. Todos son verde-oliva (G > B), mientras el token del
 * tema, `[data-theme="dark"] --bg`, es `#070d18`: navy (B > G).
 *
 * Por qué se veía: la navbar y las cards SÍ pintan navy encima, así que el body sólo
 * asoma en los huecos. Ahí la diferencia de tono lee como una banda ajena — es la
 * franja oliva de 80 px bajo la navbar de "Nuevo torneo", medida en `rgb(15,23,17)`
 * sobre el fotograma crudo del reel del 30-oct, entre la navbar `rgb(10,20,39)` y el
 * contenido `rgb(13,27,47)`. Afectaba a TODA pantalla oscura, no sólo a esa.
 *
 * Las dos mitades que fija este canario:
 *   1. el `background-color` del body oscuro es `var(--bg)` (no un literal), y
 *   2. ningún color del body oscuro es de tono verde (G > B) — ni el de fondo, ni los
 *      del `background-image`. Esta mitad es la que de verdad discrimina: cazaría
 *      también un literal navy nuevo que alguien escriba a mano, y cazaría que alguien
 *      vuelva a meter una viñeta verde.
 *
 * El tema claro se verifica igual (usa `var(--bg)` desde siempre) para que el canario
 * no dependa de que el oscuro sea el único con tokens.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const CSS = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf-8')

/**
 * TODAS las reglas `[data-theme="<tema>"] body { ... }`, no sólo la primera: si alguien
 * agrega una segunda más abajo, esa gana en cascada y mirar sólo la primera deja pasar
 * el defecto. El canario exige que todas cumplan, así que da igual cuál gane.
 */
function reglasDelBody(tema: 'dark' | 'light'): string[] {
  const re = new RegExp(`\\[data-theme="${tema}"\\]\\s*body\\s*\\{`, 'g')
  const out: string[] = []
  for (const m of CSS.matchAll(re)) {
    // Recorre balanceando llaves: el valor trae paréntesis y comas, no sirve un split.
    let depth = 1
    let i = m.index + m[0].length
    const start = i
    for (; i < CSS.length && depth > 0; i++) {
      if (CSS[i] === '{') depth++
      else if (CSS[i] === '}') depth--
    }
    out.push(CSS.slice(start, i - 1))
  }
  if (!out.length) throw new Error(`No existe la regla [data-theme="${tema}"] body en globals.css`)
  return out
}

/**
 * Valor de un custom property para un tema: primero el bloque `[data-theme="<tema>"]`,
 * y si no está ahí, `:root`.
 *
 * El fallback a `:root` NO es un detalle: los alias legacy (`--bg-deep`, `--bg-deep-2`)
 * viven sólo en `:root`. Sin él, `var(--bg-deep)` dentro de la regla del body se queda
 * sin resolver y el canario lo deja pasar — que es exactamente el agujero que encontró
 * la revisión (oliva reintroducido por `var()`, con cero literales en la regla).
 */
function token(tema: 'dark' | 'light', nombre: string): string {
  const bloques = [
    ...[...CSS.matchAll(new RegExp(`\\[data-theme="${tema}"\\]\\s*\\{([\\s\\S]*?)\\n\\s*\\}`, 'g'))].map((m) => m[1]),
    ...[...CSS.matchAll(/:root\s*\{([\s\S]*?)\n\s*\}/g)].map((m) => m[1]),
  ]
  for (const bloque of bloques) {
    const decl = new RegExp(`${nombre}\\s*:\\s*([^;]+);`).exec(bloque)
    if (decl) return decl[1].trim()
  }
  throw new Error(`No se encontró ${nombre} en [data-theme="${tema}"] ni en :root`)
}

type Rgb = { r: number; g: number; b: number }

function hexARgb(hex: string): Rgb {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return { r: parseInt(full.slice(0, 2), 16), g: parseInt(full.slice(2, 4), 16), b: parseInt(full.slice(4, 6), 16) }
}

/**
 * Todo color de un bloque CSS, **resolviendo los `var(--x)`** contra el bloque del tema.
 *
 * Resolver es lo que hace que el canario no sea vacuo: sin eso, escribir
 * `linear-gradient(180deg, var(--bg-deep) 0%, var(--bg-deep-2) 100%)` reintroduce el
 * oliva entero sin dejar un solo literal en la regla, y un test que sólo mira literales
 * se queda sin nada que inspeccionar y pasa en verde.
 */
function coloresDe(bloque: string, tema: 'dark' | 'light'): { fuente: string; rgb: Rgb }[] {
  const out: { fuente: string; rgb: Rgb }[] = []
  const push = (fuente: string, valor: string, vistos = new Set<string>()) => {
    for (const m of valor.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) {
      out.push({ fuente: fuente === m[0] ? m[0] : `${fuente} → ${m[0]}`, rgb: hexARgb(m[0]) })
    }
    for (const m of valor.matchAll(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/g)) {
      out.push({ fuente: fuente === valor ? m[0] + ')' : `${fuente} → ${m[0]})`, rgb: { r: +m[1], g: +m[2], b: +m[3] } })
    }
    // var(--x) → su valor en el bloque del tema (con corte de ciclos y alias encadenados).
    for (const m of valor.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) {
      const nombre = m[1]
      if (vistos.has(nombre)) continue
      vistos.add(nombre)
      let resuelto: string
      try {
        resuelto = token(tema, nombre)
      } catch {
        continue // no definido para este tema: lo pinta el fallback de :root, fuera de alcance
      }
      push(fuente === valor ? `var(${nombre})` : `${fuente} → var(${nombre})`, resuelto, vistos)
    }
  }
  push(bloque, bloque)
  return out
}

/**
 * Verde-oliva = el verde es el canal DOMINANTE (g > r y g > b).
 *
 * No alcanza con `g > b`: el dorado de marca `rgba(196,153,42)` tiene g=153 > b=42 y es
 * legítimo (ahí el canal dominante es el rojo). Los colores del defecto sí tienen el
 * verde arriba de todo: `#08120f` → rgb(8,18,15), `#0d1b17` → rgb(13,27,23),
 * `rgba(30,70,55)`. El navy `#070d18` → rgb(7,13,24) tiene el azul arriba y pasa.
 */
function esVerdeDominante({ r, g, b }: Rgb): boolean {
  return g > r && g > b
}

describe('canario: el body oscuro es navy, no oliva', () => {
  it('el background-color del body oscuro sale del token --bg, no de un literal', () => {
    const regla = reglasDelBody('dark').join(';')
    const bgColors = [...regla.matchAll(/background-color\s*:\s*([^;]+);/g)].map((m) => m[1].trim())
    expect(bgColors.length, 'la regla del body oscuro declara background-color').toBeGreaterThan(0)
    // TODAS: en CSS gana la última, así que una sola mala alcanza para romperlo.
    expect(bgColors).toEqual(bgColors.map(() => 'var(--bg)'))
  })

  it('el token --bg del tema oscuro es navy (azul domina al verde)', () => {
    const bg = token('dark', '--bg')
    expect(bg).toMatch(/^#[0-9a-fA-F]{3,6}$/)
    const rgb = hexARgb(bg)
    expect(
      rgb.b,
      `--bg del tema oscuro es ${bg} → rgb(${rgb.r},${rgb.g},${rgb.b}); DESIGN.md §3 pide deep navy`,
    ).toBeGreaterThan(rgb.g)
  })

  it('ningún color del body oscuro es verde-dominante (ni el fondo ni la viñeta)', () => {
    const regla = reglasDelBody('dark').join(';')
    const verdosos = coloresDe(regla, 'dark').filter((c) => esVerdeDominante(c.rgb))
    expect(
      verdosos.map((c) => `${c.fuente} → rgb(${c.rgb.r},${c.rgb.g},${c.rgb.b})`),
      'el body del tema oscuro no puede traer verdes: la navbar y las cards pintan navy y el hueco queda como banda ajena',
    ).toEqual([])
  })

  it('el body oscuro no reintroduce los literales del palette legacy oliva', () => {
    const regla = reglasDelBody('dark').join(';').toLowerCase()
    for (const legacy of ['#08120f', '#0d1b17', '#12231e', '#173129']) {
      expect(regla, `${legacy} es del palette legacy oliva; el body va con tokens`).not.toContain(legacy)
    }
  })

  it('el body claro sigue saliendo del token --bg (simetría de los dos temas)', () => {
    const regla = reglasDelBody('light').join(';')
    const bgColors = [...regla.matchAll(/background-color\s*:\s*([^;]+);/g)].map((m) => m[1].trim())
    expect(bgColors.length, 'la regla del body claro declara background-color').toBeGreaterThan(0)
    expect(bgColors).toEqual(bgColors.map(() => 'var(--bg)'))
  })
})
