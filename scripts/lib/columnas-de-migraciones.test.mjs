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
  revisarMigracionesTocadas,
  valoresInvalidosPermitir,
  TEXTO_CORRIDAS_PERMITIR_TOCAR,
  versionDeMigracion,
  versionesPermitidas,
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
    expect(pedido).toEqual(['-c', 'core.quotePath=false', 'diff', '--name-status', '--no-renames', '--diff-filter=MD', 'origin/main...HEAD', '--', 'supabase/migrations/'])
  })
  const SALIDA = /Única salida, solo para una migración que FALLÓ al aplicarse y que prod NO registra en schema_migrations .*PERMITIR_TOCAR_MIGRACION=<version> en la línea del push\./
  const AVISO = 'solo para una migración que FALLÓ al aplicarse: confirma con `gh run list --workflow migraciones-prod.yml --branch main -L 3` ' +
    'que la última corrida terminó en failure, rechaza o no re-corras corridas pendientes (corren el commit viejo) y, tras el merge, ' +
    "aplica con 'Run workflow' desde main"
  it('borrar o renombrar una migración que está en main bloquea con "no se borra ni renombra" y nombra la única salida', () => {
    const r = explicarMigracionesTocadas({ editadas: [], borradas: [Y] })
    expect(r.bloquea).toBe(true)
    expect(r.texto).toMatch(/borra o renombra migraciones que ya están en main \(supabase\/migrations\/20261021000000_y\.sql\): una migración mergeada no se borra ni renombra .*Remote migration versions not found/)
    expect(r.texto).toMatch(SALIDA)
  })
  it('editar una migración que está en main bloquea con "migración NUEVA" y nombra la única salida', () => {
    const r = explicarMigracionesTocadas({ editadas: [X], borradas: [] })
    expect(r.bloquea).toBe(true)
    expect(r.texto).toMatch(/edita migraciones que ya están en main \(supabase\/migrations\/20261020000000_x\.sql\): una migración mergeada no se edita .*pon el cambio en una migración NUEVA/)
    expect(r.texto).toMatch(SALIDA)
    expect(r.texto).not.toMatch(/⚠/)
  })
  const sinX = new Set(['20261019200001', '20261021000000'])
  it('PERMITIR_TOCAR_MIGRACION con prod legible y SIN esa versión: exime solo esa y avisa fuerte', () => {
    const r = explicarMigracionesTocadas({ editadas: [X], borradas: [Y] }, { permitidas: versionesPermitidas('20261020000000'), aplicadas: sinX })
    expect(r.bloquea).toBe(true)
    expect(r.texto).not.toMatch(/edita migraciones/)
    expect(r.texto).toMatch(/borra o renombra migraciones que ya están en main \(supabase\/migrations\/20261021000000_y\.sql\)/)
    expect(r.texto).toMatch(new RegExp(`⚠⚠ verify-db-schema: PERMITIR_TOCAR_MIGRACION exime ${X} \\(prod no la registra como aplicada\\): solo para una migración que FALLÓ al aplicarse`))
    const sinNinguna = new Set(['20261019200001'])
    const ambas = explicarMigracionesTocadas({ editadas: [X], borradas: [Y] }, { permitidas: versionesPermitidas('20261020000000,20261021000000'), aplicadas: sinNinguna })
    expect(ambas.bloquea).toBe(false)
    expect(ambas.texto).toMatch(/^⚠⚠ .*exime supabase\/migrations\/20261020000000_x\.sql, supabase\/migrations\/20261021000000_y\.sql /)
  })
  it('PERMITIR_TOCAR_MIGRACION con una versión que prod YA registra: bloquea y pide migración NUEVA', () => {
    const r = explicarMigracionesTocadas({ editadas: [X], borradas: [] }, { permitidas: versionesPermitidas('20261020000000'), aplicadas: new Set(['20261020000000']) })
    expect(r.bloquea).toBe(true)
    expect(r.texto).toBe(`❌ verify-db-schema: PERMITIR_TOCAR_MIGRACION no exime ${X}: prod YA aplicó 20261020000000: el cambio va en una migración NUEVA`)
  })
  it('PERMITIR_TOCAR_MIGRACION sin registro legible (o sin credenciales): bloquea, no se pudo confirmar', () => {
    const r = explicarMigracionesTocadas({ editadas: [], borradas: [Y] }, { permitidas: versionesPermitidas('20261021000000'), aplicadas: null })
    expect(r.bloquea).toBe(true)
    expect(r.texto).toBe(`❌ verify-db-schema: PERMITIR_TOCAR_MIGRACION no exime ${Y}: no se pudo confirmar en prod que 20261021000000 no está aplicada; corre el push con .env.local`)
  })
  it('el aviso y docs/CONVENCIONES_TECNICAS.md dicen lo mismo sobre las corridas (texto único)', () => {
    const r = explicarMigracionesTocadas({ editadas: [X], borradas: [] }, { permitidas: versionesPermitidas('20261020000000'), aplicadas: sinX })
    expect(r.texto.endsWith(`solo para una migración que FALLÓ al aplicarse: ${TEXTO_CORRIDAS_PERMITIR_TOCAR}`)).toBe(true)
    expect(TEXTO_CORRIDAS_PERMITIR_TOCAR).toMatch(/no hagas Re-run de ninguna corrida anterior al merge, tampoco la que falló/)
    const doc = fs.readFileSync(path.resolve('docs/CONVENCIONES_TECNICAS.md'), 'utf8')
    expect(doc).toContain(TEXTO_CORRIDAS_PERMITIR_TOCAR)
  })
  it('una versión distinta, inválida o vacía en PERMITIR_TOCAR_MIGRACION no exime nada', () => {
    for (const valor of ['20261019200001', '2026102000000', '20261020000000_x', '', undefined]) {
      const r = explicarMigracionesTocadas({ editadas: [X], borradas: [] }, { permitidas: versionesPermitidas(valor), aplicadas: sinX, invalidas: valoresInvalidosPermitir(valor) })
      expect(r.bloquea).toBe(true)
      expect(r.texto).not.toMatch(/⚠⚠/)
    }
  })
  it('parseo estricto: solo 14 dígitos; avisa de cada valor inválido y de cada versión que no toca la rama', () => {
    const valor = ' 20261020000000 , abc,,2026102000000, 20261099000000 '
    expect([...versionesPermitidas(valor)]).toEqual(['20261020000000', '20261099000000'])
    expect(valoresInvalidosPermitir(valor)).toEqual(['abc', '2026102000000'])
    const r = explicarMigracionesTocadas({ editadas: [X], borradas: [] }, { permitidas: versionesPermitidas(valor), aplicadas: sinX, invalidas: valoresInvalidosPermitir(valor) })
    expect(r.bloquea).toBe(false)
    expect(r.texto).toContain('⚠ verify-db-schema: PERMITIR_TOCAR_MIGRACION: "abc" no es una versión (14 dígitos, como 20261027180000); se ignora')
    expect(r.texto).toContain('⚠ verify-db-schema: PERMITIR_TOCAR_MIGRACION: "2026102000000" no es una versión')
    expect(r.texto).toContain('⚠ verify-db-schema: PERMITIR_TOCAR_MIGRACION: 20261099000000 no coincide con ninguna migración de main que esta rama toque; se ignora')
    expect(r.texto).not.toMatch(/20261020000000 no coincide/)
  })
  it('revisarMigracionesTocadas: sin la variable bloquea sin leer prod; con ella lee prod y exime solo si no la registra', async () => {
    const git = args => args.includes('ls-tree') ? `${X}\n${Y}\n` : `M\t${X}\n`
    let lecturas = 0
    const leer = aplicadas => async () => { lecturas++; return aplicadas }
    const r = await revisarMigracionesTocadas({ git, env: {}, leerAplicadas: leer(sinX) })
    expect(r.bloquea).toBe(true)
    expect(r.texto).toMatch(SALIDA)
    expect(lecturas).toBe(0)
    const env = { PERMITIR_TOCAR_MIGRACION: '20261020000000' }
    expect((await revisarMigracionesTocadas({ git, env, leerAplicadas: leer(sinX) })).bloquea).toBe(false)
    expect((await revisarMigracionesTocadas({ git, env, leerAplicadas: leer(new Set(['20261020000000'])) })).bloquea).toBe(true)
    expect((await revisarMigracionesTocadas({ git, env, leerAplicadas: leer(null) })).bloquea).toBe(true)
    expect((await revisarMigracionesTocadas({ git, env })).bloquea).toBe(true)
    expect((await revisarMigracionesTocadas({ git, env: { PERMITIR_TOCAR_MIGRACION: '20261021000000' }, leerAplicadas: leer(sinX) })).bloquea).toBe(true)
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
      expect(migracionesTocadasEnLaRama({ base: 'main', git, enMain: migracionesEnMain({ base: 'main', git }) })).toEqual({ editadas: [], borradas: [vieja] })
      expect(migracionesAgregadasEnLaRama({ base: 'main', git })).toEqual([nueva])
    } finally {
      limpiar()
    }
  })

  it('rutas con tilde: git no las entrega entre comillas con escapes octales (core.quotePath=false)', () => {
    const { dir, git, limpiar } = repoGitAislado('migracion-tilde-')
    try {
      fs.mkdirSync(path.join(dir, 'supabase/migrations'), { recursive: true })
      const vieja = 'supabase/migrations/20261020000000_año.sql'
      const nueva = 'supabase/migrations/20261030000000_canción.sql'
      fs.writeFileSync(path.join(dir, vieja), 'ALTER TABLE t ADD COLUMN x int;\n')
      git(['add', '.'])
      git(['commit', '-qm', 'base'])
      git(['checkout', '-qb', 'rama'])
      fs.writeFileSync(path.join(dir, vieja), 'ALTER TABLE t ADD COLUMN x bigint;\n')
      fs.writeFileSync(path.join(dir, nueva), 'ALTER TABLE t ADD COLUMN y int;\n')
      git(['add', '.'])
      git(['commit', '-qm', 'cambios'])
      const enMain = migracionesEnMain({ base: 'main', git })
      expect([...enMain]).toEqual([vieja])
      expect(migracionesTocadasEnLaRama({ base: 'main', git, enMain })).toEqual({ editadas: [vieja], borradas: [] })
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
    expect(pedido).toEqual(['-c', 'core.quotePath=false', 'diff', '--name-only', '--no-renames', '--diff-filter=A', 'origin/main...HEAD', '--', 'supabase/migrations'])
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
    expect(esMigracionAplicable('supabase/migrations/otra/20261027180000_x.sql')).toBe(false)
    expect(esMigracionAplicable(['C:', 'repo', 'supabase', 'migrations', '20261027180000_x.sql'].join('\\'))).toBe(true)
    expect(esMigracionAplicable('supabase/migrations/20261027180000_x.sql.bak')).toBe(false)
  })
})

describe('versionDeMigracion y migracionesAplicadasEnProd', () => {
  it('la versión es el prefijo numérico del nombre', () => {
    expect(versionDeMigracion('supabase/migrations/20261027180000_timba_libre_datos.sql')).toBe('20261027180000')
    expect(versionDeMigracion('supabase\\migrations\\20261027180000_x.sql')).toBe('20261027180000')
    expect(versionDeMigracion('supabase/migrations/2026_sin_version_cli.sql')).toBeNull()
  })
  it('lee schema_migrations; si la lectura falla o viene vacía, null (no "nada aplicado")', async () => {
    expect([...(await migracionesAplicadasEnProd(async () => [{ version: '20261027120000' }]))]).toEqual(['20261027120000'])
    expect(await migracionesAplicadasEnProd(async () => { throw new Error('timeout') })).toBeNull()
    expect(await migracionesAplicadasEnProd(async () => [])).toBeNull()
    expect(await migracionesAplicadasEnProd(async () => null)).toBeNull()
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
  it('migración de esta rama sin registro legible de prod: bloquea (sin_registro_rama) y pide reintentar con .env.local', () => {
    const r = clasificarColumnasFaltantes([faltante], { deLaRama: col, delRepo: col, enMain: new Set(), aplicadas: null })
    expect(r.deLaRama).toEqual([])
    expect(r.nuevas.map(m => m.motivo)).toEqual(['sin_registro_rama'])
    expect(explicarColumnaNueva(r.nuevas[0])).toMatch(/de esta rama, .*versión 20261027180000 no está ya aplicada: reintenta el push con \.env\.local$/)
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
