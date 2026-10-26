/**
 * `ronda_libre_jugadores.perfil_sugerido_id` (la cuenta que el creador eligió para un rival) es SOLO una
 * referencia. Los poderes sobre una ronda — anotar, avisos push, índice desde el perfil, "Guardar en mi
 * historial", calcular_indice_golfers — salen de `user_id`, que para un rival es null desde #581 porque
 * el creador podía meter la ronda en la cuenta de cualquier usuario.
 *
 * Este test congela quién nombra la columna en el código de la app: solo quien la ESCRIBE al crear la
 * ronda y sus validadores. Si un lector nuevo la necesita, se agrega acá a conciencia (y se revisa que
 * no le dé poderes al rival). El lado SQL (policies, funciones, grants) lo vigila perfil-sugerido-sin-poderes.test.ts.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve(process.cwd(), 'src')

const PERMITIDOS = [
  'app/api/ronda-libre/create/route.ts',
  'app/ronda-libre/nueva/hooks/useCrearRonda.ts',
  'golf/ronda-libre/validar-nueva-ronda.ts', // valida que no se repita ni sea el creador
  'lib/data/perfiles-existentes.ts', // valida que la cuenta exista
]

/** Lectores que dan poderes sobre la ronda: tienen que seguir mirando `user_id`. */
const LECTORES_DE_PODERES = [
  'golf/ronda-libre/permisos.ts',
  'lib/push/round-snapshot.ts',
  'app/ronda-libre/[codigo]/hooks/useGuardarEnMiHistorial.ts',
  'lib/data/ronda-libre.ts',
  'lib/data/dashboard.ts',
]

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap(nombre => {
    const ruta = path.join(dir, nombre)
    if (statSync(ruta).isDirectory()) return archivos(ruta)
    return /\.(ts|tsx)$/.test(nombre) && !/\.test\.tsx?$/.test(nombre) ? [ruta] : []
  })
}

const relativo = (ruta: string) => path.relative(SRC, ruta).split(path.sep).join('/')

describe('perfil_sugerido_id en el código de la app', () => {
  it('solo lo nombran quienes lo validan y lo escriben al crear la ronda', () => {
    const lo = archivos(SRC).filter(f => readFileSync(f, 'utf8').includes('perfil_sugerido_id')).map(relativo).sort()
    expect(lo).toEqual([...PERMITIDOS].sort())
  })

  it('los lectores de poderes existen y siguen decidiendo por user_id', () => {
    for (const f of LECTORES_DE_PODERES) {
      const codigo = readFileSync(path.join(SRC, f), 'utf8')
      expect(codigo, f).toContain('user_id')
      expect(codigo, f).not.toContain('perfil_sugerido')
    }
  })
})
