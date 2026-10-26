// Canario: el copy del flujo de torneos va en español chileno (tú), nunca con
// voseo argentino ("Copiá", "ejecutá", "podés"). Se colaron dos en el panel del
// organizador (auditoría 26-oct-2026). Escanea organizador y torneo.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const RAICES = ['src/app/organizador', 'src/app/torneo']

const VOSEO = [
  'copiá', 'ejecutá', 'ingresá', 'elegí', 'tocá', 'hacé', 'poné', 'escribí', 'revisá', 'agregá', 'creá',
  'usá', 'podés', 'tenés', 'querés', 'sos', 'probá', 'mirá', 'asigná', 'verificá', 'guardá', 'cargá',
  'intentá', 'esperá', 'compartí', 'confirmá', 'seleccioná', 'presioná', 'abrí', 'cerrá', 'volvé',
  'fijate', 'avisá', 'configurá', 'completá', 'definí', 'anotá', 'recargá', 'editá', 'borrá', 'eliminá',
  'registrá', 'inscribí', 'cambiá', 'empezá', 'iniciá', 'contactá', 'descargá', 'buscá',
]
// Límites que entienden letras con tilde (\b de JS no las considera letras).
const PATRON = new RegExp(`(^|[^\\p{L}])(${VOSEO.join('|')})(?![\\p{L}])`, 'iu')

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
        const m = linea.match(PATRON)
        if (m) hallazgos.push(`${ruta}:${i + 1} "${m[2]}"`)
      })
    }
    expect(hallazgos).toEqual([])
  })
})
