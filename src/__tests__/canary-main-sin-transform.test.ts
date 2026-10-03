/**
 * Canario: `<main>` nunca puede ser containing block de `position: fixed`.
 *
 * Incidente 02-oct-2026: `main { animation: pageIn 0.2s ease forwards }` con un
 * keyframe que terminaba en `transform: translateY(0)`. Con `forwards` ese
 * transform (≠ none) quedaba aplicado para siempre y TODO overlay `fixed`
 * dentro de <main> (ShareSheet, ConfirmModal, toasts…) se anclaba al fondo de
 * la página en vez del viewport: con la página scrolleada, el sheet quedaba
 * fuera de la pantalla.
 *
 * Defensa en dos capas, las dos vigiladas acá:
 *   1. La regla de `main` en globals.css no retiene estado (`forwards`/`both`)
 *      ni anima/declara propiedades que crean containing block.
 *   2. Los overlays de uso en cancha montan vía `<Portal>` (src/components/ui/Portal.tsx).
 *
 * También vigila 8b: `.text-gold-text` vive en `@layer utilities` sin `!important`.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = process.cwd()
const CSS = readFileSync(join(ROOT, 'src/app/globals.css'), 'utf-8')

/** Propiedades que convierten a un elemento en containing block de `fixed`. */
const CREA_CONTAINING_BLOCK = /\b(transform|translate|rotate|scale|filter|backdrop-filter|perspective|contain|will-change)\s*:/

/** Bloques `main { ... }` (selector exacto `main`, a cualquier nivel de anidación). */
function reglasDeMain(css: string): string[] {
  const out: string[] = []
  const re = /(^|[}\s;{])main\s*\{([^}]*)\}/g
  for (const m of css.matchAll(re)) out.push(m[2])
  return out
}

function keyframe(css: string, nombre: string): string | null {
  const i = css.indexOf(`@keyframes ${nombre}`)
  if (i < 0) return null
  // Bloque balanceado de llaves desde la primera `{`.
  let depth = 0
  const start = css.indexOf('{', i)
  for (let j = start; j < css.length; j++) {
    if (css[j] === '{') depth++
    else if (css[j] === '}' && --depth === 0) return css.slice(start, j + 1)
  }
  return null
}

describe('canario — <main> sin transform (containing block de fixed)', () => {
  const reglas = reglasDeMain(CSS)

  it('existe al menos una regla de main (guard de cardinalidad: no pasar en vacío)', () => {
    expect(reglas.length).toBeGreaterThan(0)
  })

  it('ninguna regla de main declara propiedades que crean containing block', () => {
    const malas = reglas.filter((r) => CREA_CONTAINING_BLOCK.test(r))
    expect(malas, 'main no puede tener transform/filter/contain/will-change/perspective').toEqual([])
  })

  it('la animación de main no retiene el estado final (sin forwards/both)', () => {
    const conAnimacion = reglas.filter((r) => /animation\s*:/.test(r))
    for (const r of conAnimacion) {
      expect(r, 'forwards/both dejan aplicado el último frame para siempre').not.toMatch(/\b(forwards|both)\b/)
    }
  })

  it('los keyframes que anima main no tocan transform/filter', () => {
    const nombres = reglas
      .flatMap((r) => [...r.matchAll(/animation(?:-name)?\s*:\s*([\w-]+)/g)].map((m) => m[1]))
      .filter((n) => n !== 'none')
    for (const n of nombres) {
      const kf = keyframe(CSS, n)
      expect(kf, `@keyframes ${n} debe existir en globals.css`).not.toBeNull()
      expect(kf!, `@keyframes ${n}`).not.toMatch(CREA_CONTAINING_BLOCK)
    }
  })

  it('respeta prefers-reduced-motion para la animación de entrada', () => {
    expect(CSS).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*main\s*\{\s*animation:\s*none/)
  })

  it('el <main> del layout no suma clases de Tailwind que creen containing block', () => {
    const layout = readFileSync(join(ROOT, 'src/app/layout.tsx'), 'utf-8')
    const mains = [...layout.matchAll(/<main\b[^>]*className="([^"]*)"/g)].map((m) => m[1])
    expect(mains.length).toBeGreaterThan(0)
    for (const cls of mains) {
      expect(cls).not.toMatch(/(^|\s)(transform|translate-|-translate-|rotate-|scale-|filter|blur|backdrop-|will-change|contain-)/)
    }
  })
})

describe('canario — ninguna animación de globals.css retiene un transform', () => {
  // Mismo patrón que el incidente, en cualquier clase (ej. .card-animate envuelve
  // las cards del historial): `forwards`/`both` + keyframe con transform deja al
  // elemento como containing block de todo `fixed` descendiente para siempre.
  // `backwards` sí se permite: sólo aplica el primer frame durante el delay.
  const reglas = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({ selector: m[1].trim().split('\n').pop()!.trim(), cuerpo: m[2] }))
    .filter((r) => /animation(?:-fill-mode)?\s*:/.test(r.cuerpo))

  it('hay reglas con animación para revisar (guard de cardinalidad)', () => {
    expect(reglas.length).toBeGreaterThan(5)
  })

  it('ninguna regla con forwards/both anima un keyframe que cree containing block', () => {
    const malas: string[] = []
    for (const r of reglas) {
      if (!/\b(forwards|both)\b/.test(r.cuerpo)) continue
      const nombres = [...r.cuerpo.matchAll(/animation(?:-name)?\s*:\s*([\w-]+)/g)].map((m) => m[1])
      for (const n of nombres) {
        const kf = keyframe(CSS, n)
        if (kf && CREA_CONTAINING_BLOCK.test(kf)) malas.push(`${r.selector} → @keyframes ${n}`)
      }
    }
    expect(malas, 'usa `backwards` o un keyframe sólo de opacity').toEqual([])
  })
})

describe('canario — overlays de uso en cancha montan vía Portal', () => {
  const OVERLAYS = [
    'src/components/share/ShareSheet.tsx',
    'src/components/share/ShareToast.tsx',
    'src/components/ConfirmModal.tsx',
    'src/components/TournamentBottomSheet.tsx',
    'src/components/QRModal.tsx',
    'src/components/ronda/AuthModal.tsx',
    'src/components/ronda/ShareMenu.tsx',
  ]
  it.each(OVERLAYS)('%s usa <Portal> canónico', (f) => {
    const src = readFileSync(join(ROOT, f), 'utf-8')
    expect(src).toMatch(/import \{ Portal \} from '@\/components\/ui\/Portal'/)
    expect(src).toMatch(/<Portal>/)
  })

  it('createPortal sólo se importa en src/components/ui/Portal.tsx (fuente única)', () => {
    const archivos = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = join(dir, n)
        if (statSync(p).isDirectory()) return n === '__tests__' ? [] : archivos(p)
        return /\.(tsx?|jsx?)$/.test(n) && !/\.test\./.test(n) ? [p] : []
      })
    const todos = archivos(join(ROOT, 'src'))
    expect(todos.length).toBeGreaterThan(100) // guard de cardinalidad: no pasar en vacío
    const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    const usos = todos
      .filter((p) => /\bcreatePortal\b/.test(sinComentarios(readFileSync(p, 'utf-8'))))
      .map((p) => relative(ROOT, p).split(sep).join('/'))
    expect(usos, 'usa <Portal> de src/components/ui/Portal.tsx').toEqual(['src/components/ui/Portal.tsx'])
  })
})

describe('canario — .text-gold-text es utilidad de Tailwind (8b)', () => {
  it('se define dentro de @layer utilities y nunca con !important', () => {
    const defs = [...CSS.matchAll(/[^\n]*\.text-gold-text[^{\n]*\{[^}]*\}/g)].map((m) => m[0])
    expect(defs.length).toBe(1)
    expect(defs[0]).not.toMatch(/!important/)
    const def = CSS.indexOf(defs[0])
    // El bloque real `@layer utilities {` (no la mención en un comentario) más
    // cercano antes de la definición.
    const capas = [...CSS.matchAll(/@layer utilities\s*\{/g)].map((m) => m.index!).filter((i) => i < def)
    expect(capas.length).toBeGreaterThan(0)
    const capa = capas[capas.length - 1]
    // La definición está DENTRO de ese bloque: entre ambos queda exactamente una `{` sin cerrar.
    const entre = CSS.slice(capa, def)
    expect((entre.match(/\{/g) ?? []).length - (entre.match(/\}/g) ?? []).length).toBe(1)
  })
})
