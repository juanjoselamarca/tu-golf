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

/** Selects con `handicap` que NO llevan la marca, con cuántos hay en el archivo. Agregar uno exige decir por qué su hándicap no llega a un visor sin sesión. */
const SIN_MARCA: Record<string, { motivo: string; n: number }> = {
  // Feed público: arma sólo la clasificación BRUTA (`buildLeaderboard` en gross) y no publica el hándicap.
  'app/api/en-vivo/route.ts': { motivo: 'gross, no publica handicap', n: 1 },
  // "Jugar como la última vez": rondas del propio creador (con sesión), copia nombre/hándicap a su asistente.
  'lib/data/ronda-libre-nueva.ts': { motivo: 'solo el creador con sesión', n: 1 },
}

/** Selects que el canario no puede leer, con cuántos hay en el archivo. */
const ILEGIBLES: Record<string, { motivo: string; n: number }> = {
  // Conteo (`head: true`): no devuelve filas.
  'app/api/admin/users/[id]/route.ts': { motivo: 'conteo head:true, sin filas', n: 1 },
  // Panel de admin (sesión de admin verificada): ve todas las columnas a propósito.
  'app/api/admin/rondas-libres/[id]/route.ts': { motivo: 'panel admin', n: 1 },
  // Script de QA (no se sirve): prueba columna por columna que existan, `limit(0)`.
  'scripts/simulate-user-journey.ts': { motivo: 'script QA, limit(0)', n: 1 },
}

type Select = { archivo: string; cols: string[] | null }

/** Índice del `)` que cierra el `(` en `abre`, saltando strings; -1 si no cierra. */
function cierre(src: string, abre: number): number {
  let prof = 0
  for (let i = abre; i < src.length; i++) {
    const ch = src[i]
    if (ch === "'" || ch === '"' || ch === '`') {
      for (i++; i < src.length && src[i] !== ch; i++) if (src[i] === '\\') i++
    } else if (ch === '(') prof++
    else if (ch === ')' && --prof === 0) return i
  }
  return -1
}

/**
 * `null` = ilegible para el canario. Lee dos formas:
 * - embebido `ronda_libre_jugadores[!hint](cols)` donde esté escrito (select literal o constante
 *   `COLUMNAS_*`): ilegible si las columnas traen comillas, `+` o paréntesis anidados;
 * - `from('ronda_libre_jugadores')` y su cadena de llamadas (`.insert(..)`, `.update(..)`,
 *   `.eq(..)`…): cada `.select(arg)` de la cadena, legible solo si `arg` es UN literal con comilla
 *   simple (más opciones `{ … }`), sin concatenar.
 */
function selectsDeJugadores(src: string): Array<string[] | null> {
  const out: Array<string[] | null> = []
  for (const m of src.matchAll(/ronda_libre_jugadores\s*(?:!\w+)?\s*\(/g)) {
    const abre = m.index + m[0].length - 1
    const fin = src.indexOf(')', abre)
    const dentro = fin < 0 ? null : src.slice(abre + 1, fin)
    out.push(dentro === null || /['"`+(]/.test(dentro) ? null : columnas(dentro))
  }
  for (const m of src.matchAll(/from\(\s*['"`]ronda_libre_jugadores['"`]\s*\)/g)) {
    let i = m.index + m[0].length
    for (;;) {
      const llamada = /^\s*\.\s*(\w+)\s*\(/.exec(src.slice(i, i + 200))
      if (!llamada) break
      const abre = i + llamada[0].length - 1
      const fin = cierre(src, abre)
      if (fin < 0) break
      if (llamada[1] === 'select') out.push(argumentoDeSelect(src.slice(abre + 1, fin)))
      i = fin + 1
    }
  }
  return out.map((c) => (c && c.includes('*') ? null : c))
}
function argumentoDeSelect(arg: string): string[] | null {
  if (arg.trim() === '') return ['*']
  const literal = /^\s*'([^']*)'\s*(?:,\s*\{[\s\S]*\}\s*,?\s*)?$/.exec(arg)
  return literal ? columnas(literal[1]) : null
}
function columnas(sel: string): string[] {
  return sel.split(',').map((c) => c.trim().replace(/^\w+:/, ''))
}

const selects: Select[] = archivosDe(SRC)
  .map((p) => ({ archivo: relative(SRC, p).split(sep).join('/'), src: readFileSync(p, 'utf8') }))
  .flatMap(({ archivo, src }) => selectsDeJugadores(src).map((cols) => ({ archivo, cols })))

const conHandicap = selects.filter((s) => s.cols?.includes('handicap'))
const ilegibles = selects.filter((s) => s.cols === null)

function porArchivo(lista: Select[]): Record<string, number> {
  const r: Record<string, number> = {}
  for (const s of lista) r[s.archivo] = (r[s.archivo] ?? 0) + 1
  return r
}
function esperado(lista: Record<string, { n: number }>): Record<string, number> {
  return Object.fromEntries(Object.entries(lista).map(([a, { n }]) => [a, n]))
}

describe('selects de ronda_libre_jugadores con handicap traen handicap_de_inscripcion', () => {
  it('hay consumidores (el canario no está mirando el vacío)', () => {
    expect(conHandicap.length).toBeGreaterThanOrEqual(6)
  })
  it('los que no traen la marca son exactamente las excepciones declaradas, con su conteo', () => {
    const sinMarca = conHandicap.filter((s) => !s.cols!.includes('handicap_de_inscripcion'))
    expect(porArchivo(sinMarca)).toEqual(esperado(SIN_MARCA))
  })
})

describe('selects ilegibles de ronda_libre_jugadores están declarados', () => {
  it('son exactamente los de la lista explícita, con su conteo por archivo', () => {
    expect(porArchivo(ilegibles)).toEqual(esperado(ILEGIBLES))
  })
  it('formas ilegibles → null', () => {
    const casos = [
      "x.from('ronda_libre_jugadores').select('*')",
      "x.from('ronda_libre_jugadores').select(COLUMNAS_X)",
      'x.from(\'ronda_libre_jugadores\').select(`id, ${c}`)',
      'x.from(\'ronda_libre_jugadores\').select("id, handicap")',
      "x.from('ronda_libre_jugadores').select('id, ' + 'handicap')",
      "x.from('ronda_libre_jugadores').select('id, ' + EXTRA, { count: 'exact' })",
      "x.from('ronda_libre_jugadores').insert({ a: f(1) }).select()",
      "x.from('ronda_libre_jugadores').update({ a: 1 }).eq('id', id).select(COLS)",
      "x.select('id, ronda_libre_jugadores(*)')",
      "x.select('id, ronda_libre_jugadores(id, ' + 'handicap)')",
      'x.select("id, ronda_libre_jugadores(id, " + "handicap)")',
      "x.select('id, ronda_libre_jugadores(id, profiles(name), handicap)')",
      "x.select('id, ronda_libre_jugadores!inner(id, profiles(name), handicap)')",
    ]
    for (const c of casos) expect(selectsDeJugadores(c), c).toContain(null)
  })
  it('formas legibles → columnas', () => {
    const de = (c: string) => selectsDeJugadores(c)
    expect(de("x.from('ronda_libre_jugadores').select('id, handicap')")).toEqual([['id', 'handicap']])
    expect(de("x.from('ronda_libre_jugadores').select('id, handicap', { count: 'exact' })")).toEqual([
      ['id', 'handicap'],
    ])
    expect(de("x.from('ronda_libre_jugadores').insert(rows).select('id, handicap').single()")).toEqual([
      ['id', 'handicap'],
    ])
    expect(de("x.from('ronda_libre_jugadores').update({ a: g(1) }).eq('id', 1).select('handicap')")).toEqual([
      ['handicap'],
    ])
    expect(de("x.select('id, jug:ronda_libre_jugadores!inner(id, handicap)')")).toEqual([['id', 'handicap']])
    expect(de('const C = `id, ronda_libre_jugadores (\n  id,\n  handicap\n)`')).toEqual([['id', 'handicap']])
  })
})
