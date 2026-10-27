// Canario: el copy del flujo de torneos va en español chileno (tú), nunca con
// voseo argentino ("Copiá", "ejecutá", "podés"). Se colaron dos en el panel del
// organizador (auditoría 26-oct-2026). Escanea organizador y torneo.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
// La lista canónica de voseo vive en un .mjs que comparten los scripts y los tests.
import { buscarVoseoDetallado, lineaDe } from '../../scripts/lib/voseo.mjs'

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
      // El archivo ENTERO de una vez, y la línea se deriva del índice. Partirlo
      // en líneas y consultar línea por línea rompía las formas ambiguas: si
      // Prettier envuelve el JSX entre el clítico y el verbo ("…\n  Te\n
      // compartí la tarjeta"), la línea arranca en "compartí" sin su "te"
      // delante y el canario se ponía rojo con copy chileno impecable.
      const texto = readFileSync(ruta, 'utf8')
      for (const { forma, indice } of buscarVoseoDetallado(texto))
        hallazgos.push(`${ruta}:${lineaDe(texto, indice)} "${forma}"`)
    }
    expect(hallazgos).toEqual([])
  })
})
