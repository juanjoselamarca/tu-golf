/**
 * CANARIO — todo select de `ronda_libre_jugadores` que trae `user_id` y `handicap`
 * (lo que necesitan `indiceVieneDelPerfil` y `handicapOcultoSinSesion`) trae también
 * `handicap_de_inscripcion`.
 *
 * Los selects de Supabase llegan casteados (`as unknown as RondaLibre`): el tipo
 * obligatorio de `FilaIndice` no alcanza a cazar un select que omita la columna. Sin
 * ella la marca llega `undefined` → falsa, y el hándicap inscrito de un jugador de
 * torneo viajaría a un visor sin sesión (riesgo 5 del plan 2026-11-16). Alambre de
 * tropiezo sobre el FUENTE: caza el revert y el copy-paste, no sigue el flujo de datos.
 * La paridad de comportamiento vive en los tests de cada consumidor.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join, relative, sep } from 'path'

const SRC = join(process.cwd(), 'src')

function archivosDe(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return e.name === '__tests__' || e.name === 'scripts' ? [] : archivosDe(p)
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : []
  })
}

/**
 * Selects que traen `user_id` + `handicap` y NO alimentan ningún predicado de índice.
 * Agregar uno acá exige decir por qué su hándicap no puede llegar a un visor sin sesión.
 */
const EXCEPCIONES: Record<string, string> = {
  // Feed público: arma sólo la clasificación BRUTA (`buildLeaderboard` en gross) y no publica el hándicap.
  'app/api/en-vivo/route.ts': 'gross, no publica handicap',
  // "Jugar como la última vez": rondas del propio creador (con sesión), copia nombre/hándicap a su asistente.
  'lib/data/ronda-libre-nueva.ts': 'solo el creador con sesión',
}

/** Columnas de cada select de `ronda_libre_jugadores` (embebido o `from(...)`). */
function selectsDeJugadores(src: string): string[] {
  const out: string[] = []
  for (const m of src.matchAll(/ronda_libre_jugadores\s*\(([^)]*)\)/g)) out.push(m[1])
  for (const m of src.matchAll(/from\('ronda_libre_jugadores'\)\s*\.select\('([^']*)'/g)) out.push(m[1])
  return out
}
const columnas = (sel: string) => sel.split(',').map((c) => c.trim())

const consumidores = archivosDe(SRC)
  .map((p) => ({ archivo: relative(SRC, p).split(sep).join('/'), src: readFileSync(p, 'utf8') }))
  .flatMap(({ archivo, src }) => selectsDeJugadores(src).map((sel) => ({ archivo, sel })))
  .filter(({ sel }) => {
    const cols = columnas(sel)
    return cols.includes('user_id') && cols.includes('handicap')
  })

describe('selects de ronda_libre_jugadores con user_id + handicap traen handicap_de_inscripcion', () => {
  it('hay consumidores (el canario no está mirando el vacío)', () => {
    expect(consumidores.length).toBeGreaterThanOrEqual(6)
  })
  it.each(consumidores.filter(({ archivo }) => !(archivo in EXCEPCIONES)).map((c) => [c.archivo, c.sel]))(
    '%s',
    (_archivo, sel) => {
      expect(columnas(sel)).toContain('handicap_de_inscripcion')
    },
  )
  it('las excepciones siguen existiendo (si una desaparece, se borra de la lista)', () => {
    for (const archivo of Object.keys(EXCEPCIONES)) {
      expect(consumidores.some((c) => c.archivo === archivo)).toBe(true)
    }
  })
})
