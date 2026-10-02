/**
 * Canario: ninguna clase de Tailwind usa un color que la config NO define.
 *
 * Tailwind no avisa: `text-brand` con `brand` fuera de `tailwind.config.ts` no
 * genera CSS y el elemento queda sin color. Así estuvieron rotos (hasta 01-oct-2026)
 * el Toggle encendido, el paso activo del Stepper, el borde de foco del Input, el
 * código de ronda y la pantalla de error. `--brand` existe como variable CSS, pero
 * no como color de Tailwind: el oro como texto es `text-gold-text`, el fondo `gold`.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(process.cwd(), 'src')
const COLORES_INEXISTENTES = ['brand']
const UTILIDADES = ['text', 'bg', 'border', 'ring', 'fill', 'stroke', 'from', 'via', 'to', 'outline', 'divide', 'placeholder', 'decoration', 'shadow', 'accent', 'caret']

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return n === '__tests__' ? [] : archivos(p)
    return /\.(tsx?|jsx?)$/.test(n) && !/\.test\./.test(n) ? [p] : []
  })
}

describe('canario — colores de Tailwind que no existen', () => {
  it('ninguna clase usa un color fuera de tailwind.config', () => {
    const re = new RegExp(`(?<![\w-])(?:[\w-]+:)*(?:${UTILIDADES.join('|')})-(?:${COLORES_INEXISTENTES.join('|')})(?:/\d+)?(?![\w-])`, 'g')
    const hallazgos: string[] = []
    for (const f of archivos(SRC)) {
      const lineas = readFileSync(f, 'utf-8').split('\n')
      lineas.forEach((l, i) => {
        for (const m of l.matchAll(re)) hallazgos.push(`${f.replace(process.cwd(), '')}:${i + 1} ${m[0]}`)
      })
    }
    expect(hallazgos, 'Usa text-gold-text (oro como texto) o gold (fondos/bordes)').toEqual([])
  })
})
