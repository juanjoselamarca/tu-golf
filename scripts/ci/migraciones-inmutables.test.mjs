import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { archivoPorVersion } from '../lib/nombre-migracion.mjs'
import { migracionesDe, PREFIJO_ETIQUETA, prepararMergeDelPr, revisarInmutables, versionesExentas } from './migraciones-inmutables.mjs'

const A = 'supabase/migrations/20261001000000_a.sql'
const B = 'supabase/migrations/20261002000000_b.sql'
const C = 'supabase/migrations/20261003000000_c.sql'
const N = 'supabase/migrations/20261027180000_timba_libre_datos.sql'
const base = new Map([[A, 'aaa'], [B, 'bbb']])
const revisar = (head, etiquetas = [], main = null) =>
  revisarInmutables({ base, head: new Map(head), main: main && new Map(main), etiquetas })

describe('migraciones-inmutables (respaldo en GitHub)', () => {
  it('un PR que solo AGREGA una migración con versión nueva pasa', () => {
    expect(revisar([[A, 'aaa'], [B, 'bbb'], [N, 'nnn']])).toEqual({ errores: [], exentas: [] })
  })

  it('base del merge {A,B}, main actual {A,B,C}, merge {A,B}: 0 errores (C no la borra el PR)', () => {
    expect(revisar([[A, 'aaa'], [B, 'bbb']], [], [[A, 'aaa'], [B, 'bbb'], [C, 'ccc']]).errores).toEqual([])
  })

  it('agregar una versión que main actual ya usa con otro nombre, o un nombre de main con otro blob, falla', () => {
    const main = [[A, 'aaa'], [B, 'bbb'], [C, 'ccc']]
    expect(revisar([[A, 'aaa'], [B, 'bbb'], ['supabase/migrations/20261003000000_otra.sql', 'ooo']], [], main).errores[0])
      .toContain(`main ya trae la versión 20261003000000 como ${C}`)
    expect(revisar([[A, 'aaa'], [B, 'bbb'], [C, 'zzz']], [], main).errores[0]).toContain(`${C}: main ya trae ese archivo con otro contenido`)
    expect(revisar([[A, 'aaa'], [B, 'bbb'], [C, 'ccc']], [], main).errores).toEqual([])
  })

  it('editada, borrada y renombrada fallan nombrando el archivo', () => {
    const editada = revisar([[A, 'zzz'], [B, 'bbb']]).errores
    expect(editada).toHaveLength(1)
    expect(editada[0]).toContain(`${A} está en main y el PR la dejó editada`)
    expect(revisar([[B, 'bbb']]).errores[0]).toContain(`${A} está en main y el PR la dejó borrada o renombrada`)
    const renombrada = revisar([[B, 'bbb'], ['supabase/migrations/20261001000000_a_v2.sql', 'aaa']]).errores
    expect(renombrada).toHaveLength(2)
    expect(renombrada[1]).toContain('main ya trae la versión 20261001000000 como ' + A)
  })

  it('un renombre que conserva la versión no se salva con la etiqueta', () => {
    const r = revisar([[B, 'bbb'], ['supabase/migrations/20261001000000_a_v2.sql', 'aaa']], [`${PREFIJO_ETIQUETA}20261001000000`])
    expect(r.exentas).toHaveLength(1)
    expect(r.errores).toHaveLength(1)
    expect(r.errores[0]).toContain('main ya trae la versión 20261001000000')
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
    expect(revisarInmutables({ base: new Map(), head: new Map([[N, 'nnn']]), etiquetas: [] }).errores[0])
      .toContain('No se leyó ninguna migración')
  })

  it('migracionesDe toma solo los .sql directos y lanza si git falla', () => {
    const git = () =>
      [`100644 blob aaa\t${A}`, '040000 tree ttt\tsupabase/migrations/rollback', '100644 blob rrr\tsupabase/migrations/README.md', ''].join('\n')
    expect(migracionesDe('origin/main', git)).toEqual(new Map([[A, 'aaa']]))
    expect(() => migracionesDe('origin/main', () => { throw new Error('bad ref') })).toThrow('bad ref')
  })

  it('archivoPorVersion: la primera por versión, sin las que no tienen versión', () => {
    expect(archivoPorVersion([A, 'supabase/migrations/20261001000000_x.sql', 'supabase/migrations/sin_version.sql']))
      .toEqual(new Map([['20261001000000', A]]))
  })
})

describe('prepararMergeDelPr', () => {
  const sinEspera = async () => {}
  const gitCon = (sha, llamadas = []) => args => {
    llamadas.push(args.join(' '))
    return args[0] === 'rev-parse' ? sha : ''
  }

  it('espera a mergeable, trae el merge ref fresco y devuelve base = MERGE^1', async () => {
    const llamadas = []
    const respuestas = [{ mergeable: null }, { mergeable: true, head: { sha: 'h1' } }]
    const refs = await prepararMergeDelPr({ pr: '665', leerPr: async () => respuestas.shift(), git: gitCon('h1', llamadas), esperar: sinEspera })
    expect(refs).toEqual({ base: 'refs/remotes/pr/merge^1', head: 'refs/remotes/pr/merge', main: 'refs/remotes/origin/main' })
    expect(llamadas[0]).toContain('+refs/pull/665/merge:refs/remotes/pr/merge')
  })

  it('con conflictos, sin calcular o con merge ref viejo, falla', async () => {
    await expect(prepararMergeDelPr({ pr: '1', leerPr: async () => ({ mergeable: false }), git: gitCon('h'), esperar: sinEspera }))
      .rejects.toThrow('conflictos')
    await expect(prepararMergeDelPr({ pr: '1', leerPr: async () => ({ mergeable: null }), git: gitCon('h'), esperar: sinEspera }))
      .rejects.toThrow('mergeable')
    await expect(prepararMergeDelPr({ pr: '1', leerPr: async () => ({ mergeable: true, head: { sha: 'nuevo' } }), git: gitCon('viejo'), esperar: sinEspera }))
      .rejects.toThrow('no es el HEAD actual del PR')
  })
})

describe('workflows', () => {
  it('migraciones-inmutables.yml corre con pull_request_target, sin npm ci ni secretos y en modo --pr', () => {
    const wf = readFileSync('.github/workflows/migraciones-inmutables.yml', 'utf8')
    expect(wf).toContain('pull_request_target:')
    expect(wf).toContain('types: [opened, synchronize, reopened, edited, labeled, unlabeled]')
    expect(wf).toContain('name: Migraciones mergeadas intactas')
    expect(wf).toContain('node scripts/ci/migraciones-inmutables.mjs --pr')
    expect(wf).not.toMatch(/npm (ci|install)|secrets\./)
  })

  it('migraciones-prod.yml lo corre antes del db push', () => {
    const wf = readFileSync('.github/workflows/migraciones-prod.yml', 'utf8')
    const guard = wf.indexOf('node scripts/ci/migraciones-inmutables.mjs --base="$BEFORE" --head="$COMMIT_SHA"')
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(wf.indexOf('supabase db push'))
  })
})
