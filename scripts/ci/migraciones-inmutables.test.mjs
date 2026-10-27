import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { migracionesDe, PREFIJO_ETIQUETA, revisarInmutables, versionesExentas } from './migraciones-inmutables.mjs'

const A = 'supabase/migrations/20261001000000_a.sql'
const B = 'supabase/migrations/20261002000000_b.sql'
const N = 'supabase/migrations/20261027180000_timba_libre_datos.sql'
const base = new Map([[A, 'aaa'], [B, 'bbb']])
const revisar = (head, etiquetas = []) => revisarInmutables({ base, head: new Map(head), etiquetas })

describe('migraciones-inmutables (respaldo en CI)', () => {
  it('un PR que solo AGREGA una migración con versión nueva pasa', () => {
    expect(revisar([[A, 'aaa'], [B, 'bbb'], [N, 'nnn']])).toEqual({ errores: [], exentas: [] })
  })

  it('editada, borrada y renombrada fallan nombrando el archivo', () => {
    const editada = revisar([[A, 'zzz'], [B, 'bbb']]).errores
    expect(editada).toHaveLength(1)
    expect(editada[0]).toContain(`${A} está en main y el PR la dejó editada`)
    const borrada = revisar([[B, 'bbb']]).errores
    expect(borrada[0]).toContain(`${A} está en main y el PR la dejó borrada o renombrada`)
    const renombrada = revisar([[B, 'bbb'], ['supabase/migrations/20261001000000_a_v2.sql', 'aaa']]).errores
    expect(renombrada).toHaveLength(2)
    expect(renombrada[1]).toContain('main ya trae la versión 20261001000000 como ' + A)
  })

  it('una nueva con una versión que la base ya usa falla aunque haya etiqueta (sin salida)', () => {
    const r = revisar([[A, 'aaa'], [B, 'bbb'], ['supabase/migrations/20261002000000_otra.sql', 'ooo']], [`${PREFIJO_ETIQUETA}20261002000000`])
    expect(r.errores).toHaveLength(1)
    expect(r.errores[0]).toContain('main ya trae la versión 20261002000000')
  })

  it('la etiqueta exime solo la versión que nombra; con etiquetas ilegibles no hay salida', () => {
    const r = revisar([[A, 'zzz'], [B, 'yyy']], [`${PREFIJO_ETIQUETA}20261001000000`, 'fable-reviewed'])
    expect(r.errores).toHaveLength(1)
    expect(r.errores[0]).toContain(B)
    expect(r.exentas[0]).toContain(`${A} editada, exenta por la etiqueta ${PREFIJO_ETIQUETA}20261001000000`)
    expect(revisarInmutables({ base, head: new Map([[A, 'zzz'], [B, 'bbb']]), etiquetas: null }).errores).toHaveLength(1)
    expect([...versionesExentas(['permitir-tocar-migracion: 20261001000000 ', 'otra'])]).toEqual(['20261001000000'])
  })

  it('base sin migraciones leídas falla (lectura rota, no base vacía)', () => {
    expect(revisarInmutables({ base: new Map(), head: new Map([[N, 'nnn']]), etiquetas: [] }).errores[0]).toContain('No se leyó ninguna migración')
  })

  it('migracionesDe toma solo los .sql directos y lanza si git falla', () => {
    const git = () => [
      `100644 blob aaa\t${A}`,
      '040000 tree ttt\tsupabase/migrations/rollback',
      '100644 blob rrr\tsupabase/migrations/README.md',
      '',
    ].join('\n')
    expect(migracionesDe('origin/main', git)).toEqual(new Map([[A, 'aaa']]))
    expect(() => migracionesDe('origin/main', () => { throw new Error('bad ref') })).toThrow('bad ref')
  })
})

describe('ci.yml extrae de la base todo lo que el script importa', () => {
  it('ARCHIVOS = el script + el cierre de sus imports relativos', () => {
    const ci = readFileSync('.github/workflows/ci.yml', 'utf8')
    const archivos = /ARCHIVOS="([^"]+)"/.exec(ci)?.[1].split(/\s+/) ?? []
    const vistos = new Set()
    const pila = ['scripts/ci/migraciones-inmutables.mjs']
    while (pila.length) {
      const f = pila.pop()
      if (vistos.has(f)) continue
      vistos.add(f)
      for (const m of readFileSync(f, 'utf8').matchAll(/from\s+['"](\.\.?\/[^'"]+)['"]/g)) {
        pila.push(path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1])))
      }
    }
    expect([...archivos].sort()).toEqual([...vistos].sort())
    expect(ci).toContain('node "$SCRIPT" --base="origin/$BASE_REF"')
  })
})
