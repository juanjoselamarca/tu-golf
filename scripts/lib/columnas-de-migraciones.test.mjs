import { describe, it, expect } from 'vitest'
import {
  clasificarColumnasFaltantes,
  columnasAgregadasEnSql,
  columnasDeMigraciones,
  migracionesAgregadasEnLaRama,
  migracionesEnMain,
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
  it('lista las migraciones de origin/main sin rollback/; sin git, ninguna', () => {
    const git = () => 'supabase/migrations/a.sql\nsupabase/migrations/rollback/a_rollback.sql\n'
    expect([...migracionesEnMain({ git })]).toEqual(['supabase/migrations/a.sql'])
    expect(migracionesEnMain({ git: () => { throw new Error('sin git') } }).size).toBe(0)
  })
})

describe('clasificarColumnasFaltantes', () => {
  const M = 'supabase/migrations/20261027180000_timba.sql'
  const faltante = { table: 'rondas_libres', column: 'reglas_juego', file: 'src/x.ts', line: 3 }
  const col = new Map([['rondas_libres.reglas_juego', M]])

  it('migración de esta rama: deLaRama (no bloquea)', () => {
    const r = clasificarColumnasFaltantes([faltante], { deLaRama: col, delRepo: col, enMain: new Set() })
    expect(r.deLaRama.map(m => m.migracion)).toEqual([M])
    expect(r.nuevas).toEqual([])
  })
  it('mergeada y sin aplicar en prod (pre-push de OTRA rama): avisa sin bloquear, con el archivo', () => {
    const r = clasificarColumnasFaltantes([faltante], { deLaRama: new Map(), delRepo: col, enMain: new Set([M]) })
    expect(r.enMainSinAplicar.map(m => m.migracion)).toEqual([M])
    expect(r.nuevas).toEqual([])
  })
  it('ninguna migración la agrega, o una que no está ni en la rama ni en main: bloquea', () => {
    expect(clasificarColumnasFaltantes([faltante], { deLaRama: new Map(), delRepo: new Map(), enMain: new Set() }).nuevas).toHaveLength(1)
    const huerfana = clasificarColumnasFaltantes([faltante], { deLaRama: new Map(), delRepo: col, enMain: new Set() })
    expect(huerfana.nuevas.map(m => m.migracion)).toEqual([M])
  })
})
