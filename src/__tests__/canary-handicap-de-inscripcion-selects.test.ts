/**
 * CANARIO — todo select de `ronda_libre_jugadores` que trae `handicap` trae también
 * `handicap_de_inscripcion`.
 *
 * Los selects de Supabase llegan casteados (`as unknown as RondaLibre`): el tipo
 * obligatorio de `FilaIndice` no alcanza a cazar un select que omita la columna. Sin
 * ella la marca llega `undefined` → falsa, y el hándicap inscrito de un jugador de
 * torneo viajaría a un visor sin sesión (riesgo 5 del plan 2026-11-16). El peor caso
 * es un select con `handicap` y SIN `user_id`: publica el número sin poder saber si
 * está oculto. Por eso basta `handicap` para exigir la marca.
 *
 * Además, todo select que el canario no puede leer (`*` o argumento no literal:
 * constante, template, comillas dobles) tiene que estar en una lista explícita con su
 * motivo. Las constantes `COLUMNAS_*` quedan cubiertas porque se escanea el FUENTE: el
 * embebido `ronda_libre_jugadores(...)` se lee donde esté escrito, incluida la constante.
 *
 * Alambre de tropiezo sobre el FUENTE: caza el revert y el copy-paste, no sigue el flujo
 * de datos. La paridad de comportamiento vive en los tests de cada consumidor.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join, relative, sep } from 'path'

const SRC = join(process.cwd(), 'src')

function archivosDe(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return e.name === '__tests__' ? [] : archivosDe(p)
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : []
  })
}

/** Selects con `handicap` que NO llevan la marca. Agregar uno exige decir por qué su hándicap no llega a un visor sin sesión. */
const SIN_MARCA: Record<string, string> = {
  // Feed público: arma sólo la clasificación BRUTA (`buildLeaderboard` en gross) y no publica el hándicap.
  'app/api/en-vivo/route.ts': 'gross, no publica handicap',
  // "Jugar como la última vez": rondas del propio creador (con sesión), copia nombre/hándicap a su asistente.
  'lib/data/ronda-libre-nueva.ts': 'solo el creador con sesión',
}

/** Selects que el canario no puede leer (`*` o argumento no literal). */
const ILEGIBLES: Record<string, string> = {
  // Conteo (`head: true`): no devuelve filas.
  'app/api/admin/users/[id]/route.ts': 'conteo head:true, sin filas',
  // Panel de admin (sesión de admin verificada): ve todas las columnas a propósito.
  'app/api/admin/rondas-libres/[id]/route.ts': 'panel admin',
  // Script de QA (no se sirve): prueba columna por columna que existan, `limit(0)`.
  'scripts/simulate-user-journey.ts': 'script QA, limit(0)',
}

type Select = { archivo: string; cols: string[] | null }

/** `null` = ilegible para el canario. */
function selectsDeJugadores(src: string): Array<string[] | null> {
  const out: Array<string[] | null> = []
  // Embebido (en un select literal o en una constante `COLUMNAS_*`).
  for (const m of src.matchAll(/ronda_libre_jugadores\s*\(([^)]*)\)/g)) out.push(columnas(m[1]))
  // `from('ronda_libre_jugadores').select(<arg>)`.
  for (const m of src.matchAll(/from\(\s*['"`]ronda_libre_jugadores['"`]\s*\)\s*\.select\(\s*([\s\S]{0,200})/g)) {
    const arg = m[1]
    const literal = /^'([^']*)'/.exec(arg)
    out.push(literal ? columnas(literal[1]) : arg.startsWith(')') ? ['*'] : null)
  }
  return out.map((c) => (c && c.includes('*') ? null : c))
}
function columnas(sel: string): string[] {
  return sel.split(',').map((c) => c.trim().replace(/^\w+:/, ''))
}

const selects: Select[] = archivosDe(SRC)
  .map((p) => ({ archivo: relative(SRC, p).split(sep).join('/'), src: readFileSync(p, 'utf8') }))
  .flatMap(({ archivo, src }) => selectsDeJugadores(src).map((cols) => ({ archivo, cols })))

const conHandicap = selects.filter((s) => s.cols?.includes('handicap'))
const ilegibles = selects.filter((s) => s.cols === null)

describe('selects de ronda_libre_jugadores con handicap traen handicap_de_inscripcion', () => {
  it('hay consumidores (el canario no está mirando el vacío)', () => {
    expect(conHandicap.length).toBeGreaterThanOrEqual(6)
  })
  it.each(conHandicap.filter(({ archivo }) => !(archivo in SIN_MARCA)).map((s) => [s.archivo, s.cols!.join(', ')]))(
    '%s',
    (_archivo, cols) => {
      expect(cols.split(', ')).toContain('handicap_de_inscripcion')
    },
  )
  it('las excepciones siguen existiendo (si una desaparece, se borra de la lista)', () => {
    for (const archivo of Object.keys(SIN_MARCA)) expect(conHandicap.some((s) => s.archivo === archivo)).toBe(true)
  })
})

describe('selects ilegibles de ronda_libre_jugadores (`*` o no literal) están declarados', () => {
  it('cada uno está en la lista explícita', () => {
    expect(ilegibles.map((s) => s.archivo).filter((a) => !(a in ILEGIBLES))).toEqual([])
  })
  it('la lista no tiene sobrantes', () => {
    for (const archivo of Object.keys(ILEGIBLES)) expect(ilegibles.some((s) => s.archivo === archivo)).toBe(true)
  })
  it('detecta los tres tipos de argumento ilegible', () => {
    const casos = [
      "x.from('ronda_libre_jugadores').select('*')",
      "x.from('ronda_libre_jugadores').select(COLUMNAS_X)",
      'x.from(\'ronda_libre_jugadores\').select(`id, ${c}`)',
      'x.from(\'ronda_libre_jugadores\').select("id, handicap")',
      "x.select('id, ronda_libre_jugadores(*)')",
    ]
    for (const c of casos) expect(selectsDeJugadores(c)).toContain(null)
    expect(selectsDeJugadores("x.from('ronda_libre_jugadores').select('id, handicap')")).toEqual([['id', 'handicap']])
  })
})
