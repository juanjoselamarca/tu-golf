// Canario de diseño: DESIGN.md §4 fija el caption en 12 px. El coach tAIger+ se lee en el
// teléfono y el 03-nov tenía etiquetas a 9,5 px en /coach y /coach/progreso. Ningún texto baja del piso.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const PISO_PX = 12
const tsx = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n)
  return statSync(p).isDirectory() ? tsx(p) : /(?<!\.test)\.tsx$/.test(n) ? [p] : []
})
const enPx = (valor: string, unidad: string) => (unidad === 'em' || unidad === 'rem' ? Number(valor) * 16 : Number(valor))

describe('canario: tipografía del coach no baja de 12 px (DESIGN.md §4)', () => {
  it.each(['src/components/coach', 'src/app/coach'].flatMap(tsx))('%s', (archivo) => {
    const chicos = [...readFileSync(archivo, 'utf8').matchAll(/fontSize:\s*'?(\d+(?:\.\d+)?)(px|em|rem)?'?/g)]
      .filter((m) => enPx(m[1], m[2] ?? 'px') < PISO_PX).map((m) => m[0])
    expect(chicos).toEqual([])
  })
})
