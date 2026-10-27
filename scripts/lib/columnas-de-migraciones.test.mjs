import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  clasificarColumnasFaltantes,
  columnasAgregadasEnSql,
  columnasDeMigraciones,
  explicarColumnaNueva,
  explicarMigracionesTocadas,
  migracionesAgregadasEnLaRama,
  migracionesTocadasEnLaRama,
  migracionesAplicadasEnProd,
  migracionesEnMain,
  PIE_COLUMNAS_CON_MIGRACION,
  versionDeMigracion,
} from './columnas-de-migraciones.mjs'
import { esMigracionAplicable } from './nombre-migracion.mjs'

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
    expect(columnasDeMigraciones(['v3.sql', 'v2.sql', 'v1.sql'], f => sql[f]).get('t.x')).toBe('v3.sql')
  })
})

describe('migracionesTocadasEnLaRama + explicarMigracionesTocadas', () => {
  const X = 'supabase/migrations/20261020000000_x.sql'
  const Y = 'supabase/migrations/20261021000000_y.sql'
  const enMain = new Set([X, Y])
  it('pide a git modificadas y borradas sin detectar renombres; descarta rollback/ y lo que no está en main', () => {
    let pedido
    const git = args => {
      pedido = args
      return `M\t${X}\nD\t${Y}\nD\tsupabase/migrations/rollback/20261020_x.sql\nM\tsupabase/migrations/20261099000000_fuera_de_main.sql\n`
    }
    expect(migracionesTocadasEnLaRama({ git, enMain })).toEqual({ editadas: [X], borradas: [Y] })
    expect(pedido).toEqual(['diff', '--name-status', '--no-renames', '--diff-filter=MD', 'origin/main...HEAD', '--', 'supabase/migrations/'])
  })
  it('borrar o renombrar una migración que está en main bloquea con "no se borran ni renombran"', () => {
    const r = explicarMigracionesTocadas({ editadas: [], borradas: [Y] })
    expect(r.bloquea).toBe(true)
    expect(r.texto).toMatch(/borra o renombra migraciones que ya están en main \(no se pudo comprobar en prod.*\) \(supabase\/migrations\/20261021000000_y\.sql\): una migración aplicada no se borra ni renombra .*Remote migration versions not found/)
  })
  it('editar una migración que está en main bloquea con "crea una nueva"', () => {
    const r = explicarMigracionesTocadas({ editadas: [X], borradas: [] })
    expect(r.bloquea).toBe(true)
    expect(r.texto).toMatch(/20261020000000_x\.sql.*una migración aplicada no se edita \(prod no la vuelve a aplicar\): revierte la edición y pon el cambio en una migración NUEVA\. Si no la editaste tú: `git fetch origin main`$/)
  })
  it('prod la registra como aplicada: bloquea y lo dice', () => {
    const r = explicarMigracionesTocadas({ editadas: [X], borradas: [Y] }, new Set(['20261020000000', '20261021000000']))
    expect(r.bloquea).toBe(true)
    expect(r.texto).toMatch(/edita migraciones que prod ya aplicó \(supabase\/migrations\/20261020000000_x\.sql\)/)
    expect(r.texto).toMatch(/borra o renombra migraciones que prod ya aplicó \(supabase\/migrations\/20261021000000_y\.sql\)/)
    expect(r.texto).not.toMatch(/⚠/)
  })
  it('prod NO la registra (¿falló al aplicarse?): avisa sin bloquear', () => {
    const r = explicarMigracionesTocadas({ editadas: [X], borradas: [Y] }, new Set(['20261019200001']))
    expect(r.bloquea).toBe(false)
    expect(r.texto).toBe('⚠ verify-db-schema: esta rama edita o borra migraciones de main que prod NO registra como aplicadas ' +
      `(${X}, ${Y}): ¿falló al aplicarse? se puede corregir editándola; ojo que bloquea a las siguientes`)
  })
  it('sin registro legible de prod (o sin credenciales): bloquea como aplicada; mezcla aplicada + sin aplicar: bloquea y avisa', () => {
    expect(explicarMigracionesTocadas({ editadas: [X], borradas: [] }, null).bloquea).toBe(true)
    const mezcla = explicarMigracionesTocadas({ editadas: [X, Y], borradas: [] }, new Set(['20261020000000']))
    expect(mezcla.bloquea).toBe(true)
    expect(mezcla.texto).toMatch(/prod ya aplicó \(supabase\/migrations\/20261020000000_x\.sql\)/)
    expect(mezcla.texto).toMatch(/NO registra como aplicadas \(supabase\/migrations\/20261021000000_y\.sql\)/)
  })
  it('sin cambios no dice nada; sin origin/main legible solo avisa, no bloquea', () => {
    expect(explicarMigracionesTocadas({ editadas: [], borradas: [] })).toEqual({ bloquea: false, texto: '' })
    for (const tocadas of [
      migracionesTocadasEnLaRama({ git: () => { throw new Error('sin main') }, enMain }),
      migracionesTocadasEnLaRama({ git: () => `D\t${X}\n`, enMain: null }),
    ]) {
      const r = explicarMigracionesTocadas(tocadas)
      expect(r.bloquea).toBe(false)
      expect(r.texto).toMatch(/git fetch origin main/)
    }
  })
})

/**
 * Repo git de verdad en un directorio temporal, AISLADO del repo real. Dentro del hook pre-push git exporta GIT_DIR,
 * GIT_INDEX_FILE, etc.; heredados, este git operó sobre el repo real (27-oct: commits en la rama, cambio de rama,
 * user.* y core.bare=true en el .git/config común). Por eso: fuera toda variable git_* (sin importar mayúsculas),
 * config global/sistema/HOME propias, techo de búsqueda en el padre del temporal, y dos comprobaciones que cortan
 * ANTES de tocar nada: sin repo antes de init, y el git-dir después de init es el del temporal.
 */
function repoGitAislado(prefijo) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefijo))
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^git_/i.test(k)))
  Object.assign(env, {
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: path.join(dir, '.gitconfig-test'),
    GIT_CEILING_DIRECTORIES: fs.realpathSync.native(path.dirname(dir)),
    HOME: dir,
    XDG_CONFIG_HOME: dir,
  })
  const git = args => execFileSync('git', args, { cwd: dir, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  const limpiar = () => fs.rmSync(dir, { recursive: true, force: true })
  try {
    expect(() => git(['rev-parse', '--git-dir'])).toThrow()
    git(['init', '-q', '-b', 'main'])
    expect(fs.realpathSync.native(git(['rev-parse', '--absolute-git-dir']).trim())).toBe(fs.realpathSync.native(path.join(dir, '.git')))
    git(['config', 'user.email', 'test@example.com'])
    git(['config', 'user.name', 'test'])
  } catch (e) {
    limpiar()
    throw e
  }
  return { dir, git, limpiar }
}

describe('renombrar una migración de main, con git de verdad', () => {
  it('sale como borrada (bloquea) y la nueva como agregada (no queda escondida como R)', () => {
    const { dir, git, limpiar } = repoGitAislado('renombre-migracion-')
    try {
      fs.mkdirSync(path.join(dir, 'supabase/migrations'), { recursive: true })
      const vieja = 'supabase/migrations/20261020000000_x.sql'
      const nueva = 'supabase/migrations/20261030000000_x.sql'
      fs.writeFileSync(path.join(dir, vieja), 'ALTER TABLE t ADD COLUMN x int;\nselect 1;\nselect 2;\n')
      git(['add', '.'])
      git(['commit', '-qm', 'base'])
      git(['checkout', '-qb', 'rama'])
      git(['mv', vieja, nueva])
      git(['commit', '-qm', 'renombre'])
      expect(migracionesTocadasEnLaRama({ base: 'main', git, enMain: new Set([vieja]) })).toEqual({ editadas: [], borradas: [vieja] })
      expect(migracionesAgregadasEnLaRama({ base: 'main', git })).toEqual([nueva])
    } finally {
      limpiar()
    }
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
    expect(pedido).toEqual(['diff', '--name-only', '--no-renames', '--diff-filter=A', 'origin/main...HEAD', '--', 'supabase/migrations'])
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

describe('esMigracionAplicable', () => {
  it('un .sql fuera de rollback/ (con / o con barra invertida)', () => {
    expect(esMigracionAplicable('supabase/migrations/20261027180000_x.sql')).toBe(true)
    expect(esMigracionAplicable('supabase/migrations/rollback/20261027_x.sql')).toBe(false)
    expect(esMigracionAplicable(['supabase', 'migrations', 'rollback', '20261027_x.sql'].join('\\'))).toBe(false)
    expect(esMigracionAplicable('supabase/migrations/rollback')).toBe(false)
  })
})

describe('versionDeMigracion y migracionesAplicadasEnProd', () => {
  it('la versión es el prefijo numérico del nombre', () => {
    expect(versionDeMigracion('supabase/migrations/20261027180000_timba_libre_datos.sql')).toBe('20261027180000')
    expect(versionDeMigracion('supabase\\migrations\\20261027180000_x.sql')).toBe('20261027180000')
    expect(versionDeMigracion('supabase/migrations/2026_sin_version_cli.sql')).toBeNull()
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
    const delRepo = columnasDeMigraciones([nueva, borra, vieja], f => sql[f])
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
    expect(explicarColumnaNueva(r.nuevas[0])).toMatch(/ya aplicada.*NO duplicar la migración; si se agregó editando esa migración ya aplicada, la columna va en una migración NUEVA \(si la edición es de esta rama, revierte además la edición; si ya está en main, no la toques\)$/)
  })
  it('el pie no contradice a rama_aplicada ni a aplicada (que piden migración NUEVA)', () => {
    expect(PIE_COLUMNAS_CON_MIGRACION).not.toMatch(/NO crear/i)
  })
  it('migración sin versión legible: no se exime, ni de la rama ni en main sin aplicar', () => {
    const rara = new Map([['rondas_libres.reglas_juego', 'supabase/migrations/2026_sin_version.sql']])
    for (const opciones of [
      { deLaRama: rara, delRepo: rara, enMain: new Set(), aplicadas: otras },
      { deLaRama: nada, delRepo: rara, enMain: new Set(['supabase/migrations/2026_sin_version.sql']), aplicadas: otras },
    ]) {
      const r = clasificarColumnasFaltantes([faltante], opciones)
      expect(r.deLaRama).toEqual([])
      expect(r.enMainSinAplicar).toEqual([])
      expect(r.nuevas.map(m => m.motivo)).toEqual(['sin_version'])
    }
    expect(explicarColumnaNueva({ migracion: 'x.sql', motivo: 'sin_version' })).toMatch(/renómbrala$/)
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
