// Canario: los avisos de error de /organizador/[slug]/editar se leen sobre el hero navy.
//
// Esa pantalla NO es una card clara: es una foto de cancha + overlay navy + una card
// `rgba(14,28,47,0.94)` marcada con `data-theme="dark"` a propósito (hero brand-locked,
// DESIGN.md jurisprudencia P1). Dentro de ese subárbol TODOS los tokens resuelven a la
// paleta dark, así que un color de texto elegido pensando en fondo claro queda flotando
// sobre navy.
//
// Lo que se midió en producción el 30-oct-2026 a 390 px (Playwright, ambos temas):
// los cuatro avisos ("No se puede cambiar el formato…", el número de hoyos y el
// `<FieldError>`) usaban `var(--double)` — que NO es un token de error: es el color del
// doble bogey del scorecard (DESIGN.md §3, fuente `ScoreSymbol`). Compositado contra el
// hero daba 3,03:1 en tema claro y 3,57:1 en oscuro, bajo el piso AA de 4,5:1 para texto
// de 12 px. Es justo el texto que explica por qué un campo está bloqueado.
//
// El token canónico de texto de error existe y vive en globals.css (`--error-fg`), y
// dentro del hero resuelve a su variante dark. Este canario fija las dos mitades:
//  1. que `--double` efectivamente NO alcanza AA ahí (si algún día alcanzara, el canario
//     avisa que la premisa cambió en vez de seguir exigiendo un cambio ya innecesario);
//  2. que `--error-fg` sí alcanza, y que la pantalla no volvió a `var(--double)` para texto.
//
// Los BORDES de campo con error siguen en `var(--double)`: dan 3,09:1, por encima del
// piso 3:1 de UI no textual. Cambiarlos es deuda de "un concepto, una fuente", no un
// fallo de contraste — queda anotado, no forzado acá.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(__dirname, '..', '..')
const CSS = readFileSync(join(RAIZ, 'src/app/globals.css'), 'utf8')
const FORM = readFileSync(join(RAIZ, 'src/app/organizador/[slug]/editar/EditTorneoForm.tsx'), 'utf8')

type RGB = [number, number, number]

function hexARgb(hex: string): RGB {
  const h = hex.replace('#', '').trim()
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16)) as RGB
}

/**
 * Valor de un token. Imita la cascada: en `dark` gana el bloque `[data-theme="dark"]` y,
 * si ahí no se redefine (el caso de `--double`, que es el mismo rojo en los dos temas),
 * hereda el de `:root`.
 */
function token(nombre: string, tema: 'light' | 'dark'): string {
  const corte = CSS.indexOf('[data-theme="dark"] {')
  // si se reformatea el selector, esto falla fuerte en vez de caer a los valores light
  expect(corte).toBeGreaterThan(0)
  const re = () => new RegExp(`--${nombre}:[ ]*(#[0-9a-fA-F]{3,8})`)
  const raiz = CSS.slice(0, corte).match(re())
  const oscuro = tema === 'dark' ? CSS.slice(corte).match(re()) : null
  const m = oscuro ?? raiz
  if (!m) throw new Error(`token --${nombre} (${tema}) no está en globals.css`)
  return m[1]
}

function sobre(capa: readonly [number, number, number, number], fondo: RGB): RGB {
  const [r, g, b, a] = capa
  return [0, 1, 2].map((i) => a * [r, g, b][i] + (1 - a) * fondo[i]) as RGB
}

function luminancia([r, g, b]: RGB): number {
  const f = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function ratio(a: RGB, b: RGB): number {
  const [l1, l2] = [luminancia(a), luminancia(b)]
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

/**
 * Reconstruye el fondo real del aviso siguiendo la MISMA cadena que monta la pantalla,
 * leyendo las dos capas rgba del propio EditTorneoForm en vez de copiarlas acá: así, si
 * alguien aclara el hero, el canario lo nota.
 */
function fondoDelHero(tema: 'light' | 'dark'): RGB {
  const capas = [...FORM.matchAll(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/g)]
    .map((m) => [+m[1], +m[2], +m[3], +m[4]] as const)
    // el overlay navy y la card del hero; el resto de los rgba del archivo son bordes
    .filter(([r, g, b, a]) => a > 0.5 && r < 40 && g < 40 && b < 60)
  expect(capas.length, 'overlay + card del hero en EditTorneoForm').toBeGreaterThanOrEqual(2)
  return capas.reduce<RGB>((fondo, capa) => sobre(capa, fondo), hexARgb(token('bg', tema)))
}

describe('avisos de error de editar torneo sobre el hero navy', () => {
  for (const tema of ['light', 'dark'] as const) {
    it(`--double NO alcanza AA ahí (tema ${tema}): es el color del doble bogey, no de error`, () => {
      const r = ratio(hexARgb(token('double', tema)), fondoDelHero(tema))
      expect(r).toBeLessThan(4.5)
    })

    it(`--error-fg sí alcanza AA ahí (tema ${tema})`, () => {
      // Dentro del hero, data-theme="dark" fuerza la variante dark de todo token hijo.
      const r = ratio(hexARgb(token('error-fg', 'dark')), fondoDelHero(tema))
      expect(r).toBeGreaterThanOrEqual(4.5)
    })
  }

  // Un solo guard, y a propósito sobre el token pelado: el regex anterior exigía
  // `color: 'var(--double)'` pegado, y este archivo escribe los colores de error como
  // ternario (`fieldError('course') ? 'var(--double)' : …`). Con el viejo, agregar
  // `color: fieldError('name') ? 'var(--double)' : 'var(--text)'` dejaba el canario verde
  // y los 3,0:1 de vuelta en cancha. `--double` no tiene ningún uso legítimo en esta
  // pantalla —ni texto ni borde—, así que se prohíbe entero: el texto va a `--error-fg`
  // y el borde a `--error-border`. Hallazgo P1 de la revisión Opus del 30-oct-2026.
  it('la pantalla no nombra var(--double) en ninguna forma: no es un token de error', () => {
    expect(FORM).not.toMatch(/var\(--double\)/)
  })

  it('y sí usa los tokens de error: --error-fg el texto, --error-border el borde', () => {
    expect(FORM).toMatch(/var\(--error-fg\)/)
    expect(FORM).toMatch(/var\(--error-border\)/)
  })
})
