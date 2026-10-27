import { describe, it, expect } from 'vitest'
import {
  clasificarColumnasFaltantes,
  columnasAgregadasEnSql,
  columnasDeMigraciones,
  explicarColumnaNueva,
  migracionesAgregadasEnLaRama,
  migracionesAplicadasEnProd,
  migracionesEnMain,
  versionDeMigracion,
} from './columnas-de-migraciones.mjs'

describe('columnasAgregadasEnSql', () => {
  it('lee ADD COLUMN con y sin IF NOT EXISTS, con y sin esquema', () => {
    const sql = `
      ALTER TABLE public.rondas_libres ADD COLUMN IF NOT EXISTS reglas_juego jsonb NULL;
      alter table historical_rounds add column foo int, add bar text;
    `
    expect([...columnasAgregadasEnSql(sql)].sort()).toEqual(['historical_rounds.bar', 'historical_rounds.foo', 'rondas_libres.reglas_juego'])
  })
  it('no confunde ADD CONSTRAINT ni los comentarios con columnas', () => {
    const sql = `
      -- ALTER TABLE public.x ADD COLUMN fantasma int;
      ALTER TABLE public.rondas_libres ADD CONSTRAINT rondas_libres_formato_juego_check CHECK (true);
      ALTER TABLE public.t ADD PRIMARY KEY (id);
    `
    expect([...columnasAgregadasEnSql(sql)]).toEqual([])
  })
})

describe('columnasDeMigraciones', () => {
  it('solo mira los archivos dados y recuerda cuál agrega cada columna', () => {
    const sql = {
      'a.sql': 'ALTER TABLE public.rondas_libres ADD COLUMN IF NOT EXISTS reglas_juego jsonb;',
      'b.sql': 'ALTER TABLE public.otra ADD COLUMN nueva int;',
    }
    expect([...columnasDeMigraciones(['a.sql'], f => sql[f])]).toEqual([['rondas_libres.reglas_juego', 'a.sql']])
  })
  it('si dos migraciones agregan la misma columna, se queda con la última', () => {
    const sql = {
      'v1.sql': 'ALTER TABLE public.t ADD COLUMN x int;',
      'v2.sql': 'ALTER TABLE public.t DROP COLUMN x;',
      'v3.sql': 'ALTER TABLE public.t ADD COLUMN x text;',
    }
    expect(columnasDeMigraciones(['v1.sql', 'v2.sql', 'v3.sql'], f => sql[f]).get('t.x')).toBe('v3.sql')
  })
})

describe('migracionesAgregadasEnLaRama', () => {
  it('pide a git solo las AGREGADAS contra origin/main y descarta rollback/ y lo que no es .sql', () => {
    let pedido
    const git = args => {
      pedido = args
      return 'supabase/migrations/20261027180000_x.sql\r\nsupabase/migrations/rollback/20261027_x_rollback.sql\nsupabase/migrations/README.md\n'
    }
    expect(migracionesAgregadasEnLaRama({ git })).toEqual(['supabase/migrations/20261027180000_x.sql'])
    expect(pedido).toEqual(['diff', '--name-only', '--diff-filter=A', 'origin/main...HEAD', '--', 'supabase/migrations'])
  })
  it('sin git o sin la base: ninguna (no hay excepción)', () => {
    expect(migracionesAgregadasEnLaRama({ git: () => { throw new Error('fatal: bad revision') } })).toEqual([])
  })
})

describe('migracionesEnMain', () => {
  it('lista los .sql de origin/main (salida real de ls-tree: archivos más la entrada del directorio rollback)', () => {
    const git = () => 'supabase/migrations/20261019200001_baseline.sql\nsupabase/migrations/20261027120000_anon.sql\nsupabase/migrations/rollback\n'
    expect([...migracionesEnMain({ git })]).toEqual(['supabase/migrations/20261019200001_baseline.sql', 'supabase/migrations/20261027120000_anon.sql'])
  })
  it('sin git o sin origin/main: null (no se sabe), no un conjunto vacío', () => {
    expect(migracionesEnMain({ git: () => { throw new Error('sin git') } })).toBeNull()
  })
})

describe('versionDeMigracion y migracionesAplicadasEnProd', () => {
  it('la versión es el prefijo numérico del nombre', () => {
    expect(versionDeMigracion('supabase/migrations/20261027180000_timba_libre_datos.sql')).toBe('20261027180000')
  })
  it('lee schema_migrations; si la lectura falla, null', async () => {
    expect([...(await migracionesAplicadasEnProd(async () => [{ version: '20261027120000' }]))]).toEqual(['20261027120000'])
    expect(await migracionesAplicadasEnProd(async () => { throw new Error('timeout') })).toBeNull()
  })
})

describe('columnasDeMigraciones + clasificarColumnasFaltantes', () => {
  it('la vieja ya aplicada y la nueva en main sin aplicar: enMainSinAplicar (no "¿renombrada?")', () => {
    const vieja = 'supabase/migrations/20261001000000_agrega_x.sql'
    const borra = 'supabase/migrations/20261002000000_borra_x.sql'
    const nueva = 'supabase/migrations/20261003000000_vuelve_x.sql'
    const sql = {
      [vieja]: 'ALTER TABLE public.t ADD COLUMN x int;',
      [borra]: 'ALTER TABLE public.t DROP COLUMN x;',
      [nueva]: 'ALTER TABLE public.t ADD COLUMN x text;',
    }
    const delRepo = columnasDeMigraciones([vieja, borra, nueva], f => sql[f])
    const r = clasificarColumnasFaltantes([{ table: 't', column: 'x', file: 'src/x.ts', line: 1 }], {
      deLaRama: new Map(), delRepo, enMain: new Set([vieja, borra, nueva]), aplicadas: new Set(['20261001000000', '20261002000000']),
    })
    expect(r.enMainSinAplicar.map(m => m.migracion)).toEqual([nueva])
    expect(r.nuevas).toEqual([])
  })
})

describe('clasificarColumnasFaltantes', () => {
  const M = 'supabase/migrations/20261027180000_timba.sql'
  const faltante = { table: 'rondas_libres', column: 'reglas_juego', file: 'src/x.ts', line: 3 }
  const col = new Map([['rondas_libres.reglas_juego', M]])
  const nada = new Map()
  const otras = new Set(['20261027120000'])

  it('migración de esta rama cuya versión prod ya registra: bloquea y pide migración nueva o timestamp nuevo', () => {
    const r = clasificarColumnasFaltantes([faltante], { deLaRama: col, delRepo: col, enMain: new Set(), aplicadas: new Set(['20261027180000']) })
    expect(r.nuevas.map(m => m.motivo)).toEqual(['rama_aplicada'])
    expect(explicarColumnaNueva(r.nuevas[0])).toMatch(/prod ya registra la versión 20261027180000: .*migración NUEVA.*timestamp nuevo/)
  })
  it('migración de esta rama sin aplicar: deLaRama (no bloquea)', () => {
    const r = clasificarColumnasFaltantes([faltante], { deLaRama: col, delRepo: col, enMain: new Set(), aplicadas: otras })
    expect(r.deLaRama.map(m => m.migracion)).toEqual([M])
    expect(r.nuevas).toEqual([])
  })
  it('en main y sin aplicar en prod (pre-push de OTRA rama): avisa sin bloquear, con el archivo', () => {
    const r = clasificarColumnasFaltantes([faltante], { deLaRama: nada, delRepo: col, enMain: new Set([M]), aplicadas: otras })
    expect(r.enMainSinAplicar.map(m => m.migracion)).toEqual([M])
    expect(r.nuevas).toEqual([])
  })
  it('en main y YA aplicada (renombrada, eliminada o rollback): bloquea con ese motivo', () => {
    const r = clasificarColumnasFaltantes([faltante], { deLaRama: nada, delRepo: col, enMain: new Set([M]), aplicadas: new Set(['20261027180000']) })
    expect(r.enMainSinAplicar).toEqual([])
    expect(r.nuevas.map(m => m.motivo)).toEqual(['aplicada'])
    expect(explicarColumnaNueva(r.nuevas[0])).toMatch(/ya aplicada.*renombrada o eliminada/)
  })
  it('sin registro de prod (lectura falló): bloquea, no exime nada', () => {
    const r = clasificarColumnasFaltantes([faltante], { deLaRama: nada, delRepo: col, enMain: new Set([M]), aplicadas: null })
    expect(r.nuevas.map(m => m.motivo)).toEqual(['sin_registro'])
    expect(explicarColumnaNueva(r.nuevas[0])).toMatch(/reintenta el push, NO crear migración$/)
  })
  it('sin origin/main legible: bloquea y pide git fetch', () => {
    const r = clasificarColumnasFaltantes([faltante], { deLaRama: nada, delRepo: col, enMain: null, aplicadas: otras })
    expect(r.nuevas.map(m => m.motivo)).toEqual(['sin_main'])
    expect(explicarColumnaNueva(r.nuevas[0])).toMatch(/git fetch origin main/)
  })
  it('ninguna migración la agrega, o una que no está ni en la rama ni en main: bloquea', () => {
    expect(clasificarColumnasFaltantes([faltante], { deLaRama: nada, delRepo: nada, enMain: new Set(), aplicadas: otras }).nuevas).toEqual([faltante])
    const huerfana = clasificarColumnasFaltantes([faltante], { deLaRama: nada, delRepo: col, enMain: new Set(), aplicadas: otras })
    expect(huerfana.nuevas.map(m => m.motivo)).toEqual(['fuera_de_main'])
  })
})
