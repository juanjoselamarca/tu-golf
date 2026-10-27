// Canario: el copy del flujo de torneos va en español chileno (tú), nunca con
// voseo argentino ("Copiá", "ejecutá", "podés"). Se colaron dos en el panel del
// organizador (auditoría 26-oct-2026). Escanea organizador y torneo.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
// La lista canónica de voseo vive en un .mjs que comparten los scripts y los tests.
import { buscarVoseo } from '../../scripts/lib/voseo.mjs'

const RAICES = ['src/app/organizador', 'src/app/torneo']

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) return archivos(ruta)
    return /\.(tsx?|jsx?)$/.test(nombre) && !/\.test\./.test(nombre) ? [ruta] : []
  })
}

describe('canario: sin voseo en el flujo de torneos', () => {
  it('ningún archivo de organizador/ ni torneo/ usa voseo', () => {
    const hallazgos: string[] = []
    const revisados = RAICES.flatMap(archivos)
    expect(revisados.length).toBeGreaterThan(20) // el escaneo no puede pasar en vacío
    for (const ruta of revisados) {
      readFileSync(ruta, 'utf8').split('\n').forEach((linea, i) => {
        // buscarVoseo() devuelve TODAS las formas de la linea; .match() sin /g
        // devolvia solo la primera y tapaba la segunda ocurrencia.
        for (const forma of buscarVoseo(linea)) hallazgos.push(`${ruta}:${i + 1} "${forma}"`)
      })
    }
    expect(hallazgos).toEqual([])
  })
})
