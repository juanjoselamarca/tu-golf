import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  explicarMigracionesTocadas,
  migracionesAgregadasEnLaRama,
  migracionesTocadasEnLaRama,
  migracionesEnMain,
  revisarMigracionesTocadas,
  agregadasQueYaEstanEnMain,
  valoresInvalidosPermitir,
  TEXTO_CORRIDAS_PERMITIR_TOCAR,
  versionDeMigracion,
  versionesPermitidas,
} from './columnas-de-migraciones.mjs'
import { esMigracionAplicable, NOMBRE_MIGRACION_CLI, VERSION_CLI } from './nombre-migracion.mjs'

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
  const SALIDA = /Única salida, solo para una migración que FALLÓ al aplicarse y que prod NO registra en schema_migrations: PERMITIR_TOCAR_MIGRACION=<version> en la línea del push, y en el PR la etiqueta permitir-tocar-migracion:<version>, que pone Juanjo/
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
  it('PERMITIR_TOCAR_MIGRACION exime solo esa versión sin leer prod y avisa fuerte que en el PR lo decide la etiqueta', () => {
    const r = explicarMigracionesTocadas({ editadas: [X], borradas: [Y] }, { permitidas: versionesPermitidas('20261020000000') })
    expect(r.bloquea).toBe(true)
    expect(r.texto).not.toMatch(/edita migraciones/)
    expect(r.texto).toMatch(/borra o renombra migraciones que ya están en main \(supabase\/migrations\/20261021000000_y\.sql\)/)
    expect(r.texto).toMatch(new RegExp(`⚠⚠ verify-db-schema: PERMITIR_TOCAR_MIGRACION exime ${X} sin comprobar prod: en el PR lo decide la etiqueta permitir-tocar-migracion:<version>\\. Solo para una migración que FALLÓ al aplicarse`))
    const ambas = explicarMigracionesTocadas({ editadas: [X], borradas: [Y] }, { permitidas: versionesPermitidas('20261020000000,20261021000000') })
    expect(ambas.bloquea).toBe(false)
    expect(ambas.texto).toMatch(/^⚠⚠ .*exime supabase\/migrations\/20261020000000_x\.sql, supabase\/migrations\/20261021000000_y\.sql /)
  })
  it('el aviso y docs/CONVENCIONES_TECNICAS.md dicen lo mismo sobre las corridas (texto único)', () => {
    const r = explicarMigracionesTocadas({ editadas: [X], borradas: [] }, { permitidas: versionesPermitidas('20261020000000') })
    expect(r.texto.endsWith(`Solo para una migración que FALLÓ al aplicarse: ${TEXTO_CORRIDAS_PERMITIR_TOCAR}`)).toBe(true)
    expect(TEXTO_CORRIDAS_PERMITIR_TOCAR).toMatch(/no hagas Re-run de ninguna corrida anterior al merge, tampoco la que falló/)
    const doc = fs.readFileSync(path.resolve('docs/CONVENCIONES_TECNICAS.md'), 'utf8')
    expect(doc).toContain(TEXTO_CORRIDAS_PERMITIR_TOCAR)
  })
  it('una versión distinta, inválida o vacía en PERMITIR_TOCAR_MIGRACION no exime nada', () => {
    for (const valor of ['20261019200001', '2026102000000', '20261020000000_x', '', undefined]) {
      const r = explicarMigracionesTocadas({ editadas: [X], borradas: [] }, { permitidas: versionesPermitidas(valor), invalidas: valoresInvalidosPermitir(valor) })
      expect(r.bloquea).toBe(true)
      expect(r.texto).not.toMatch(/⚠⚠/)
    }
  })
  it('parseo estricto: solo 14 dígitos; avisa de cada valor inválido y de cada versión que no toca la rama', () => {
    const valor = ' 20261020000000 , abc,,2026102000000, 20261099000000 '
    expect([...versionesPermitidas(valor)]).toEqual(['20261020000000', '20261099000000'])
    expect(valoresInvalidosPermitir(valor)).toEqual(['abc', '2026102000000'])
    const r = explicarMigracionesTocadas({ editadas: [X], borradas: [] }, { permitidas: versionesPermitidas(valor), invalidas: valoresInvalidosPermitir(valor) })
    expect(r.bloquea).toBe(false)
    expect(r.texto).toContain('⚠ verify-db-schema: PERMITIR_TOCAR_MIGRACION: "abc" no es una versión (14 dígitos, como 20261027180000); se ignora')
    expect(r.texto).toContain('⚠ verify-db-schema: PERMITIR_TOCAR_MIGRACION: "2026102000000" no es una versión')
    expect(r.texto).toContain('⚠ verify-db-schema: PERMITIR_TOCAR_MIGRACION: 20261099000000 no coincide con ninguna migración de main que esta rama toque; se ignora')
    expect(r.texto).not.toMatch(/20261020000000 no coincide/)
  })
  it('revisarMigracionesTocadas: sin la variable bloquea; con ella exime solo la versión pedida', () => {
    const git = args => args.includes('ls-tree') ? `${X}\n${Y}\n` : `M\t${X}\n`
    const r = revisarMigracionesTocadas({ envLocal: '', git, env: {} })
    expect(r.bloquea).toBe(true)
    expect(r.texto).toMatch(SALIDA)
    expect(revisarMigracionesTocadas({ envLocal: '', git, env: { PERMITIR_TOCAR_MIGRACION: '20261020000000' } }).bloquea).toBe(false)
    expect(revisarMigracionesTocadas({ envLocal: '', git, env: { PERMITIR_TOCAR_MIGRACION: '20261021000000' } }).bloquea).toBe(true)
  })
  it('revisarMigracionesTocadas hace git fetch origin main ANTES de ls-tree y diff; si falla, avisa y compara contra la copia local', () => {
    const llamadas = []
    const git = args => { llamadas.push(args.find(a => ['fetch', 'ls-tree', 'diff'].includes(a))); return args.includes('ls-tree') ? `${X}\n` : '' }
    const r = revisarMigracionesTocadas({ envLocal: '', git, env: {} })
    expect(llamadas[0]).toBe('fetch')
    expect(llamadas.slice(1).every(a => a === 'ls-tree' || a === 'diff')).toBe(true)
    expect(llamadas).toContain('ls-tree')
    expect(r).toEqual({ bloquea: false, texto: '' })
    const sinRed = args => { if (args[0] === 'fetch') throw new Error('sin red'); return args.includes('ls-tree') ? `${X}\n` : '' }
    const r2 = revisarMigracionesTocadas({ envLocal: '', git: sinRed, env: {} })
    expect(r2).toEqual({ bloquea: false, texto: '⚠ verify-db-schema: no se pudo actualizar origin/main; se comparó contra tu copia local' })
  })
  it('la rama AGREGA un nombre que no está en main con una versión que sí: bloquea sin salida', () => {
    const G = 'supabase/migrations/20261027180000_timba.sql'
    const F = 'supabase/migrations/20261027180000_timba_libre.sql'
    const git = args => args.includes('ls-tree') ? `${G}\n` : args.includes('--diff-filter=A') ? `${F}\n` : ''
    for (const env of [{}, { PERMITIR_TOCAR_MIGRACION: '20261027180000' }]) {
      const r = revisarMigracionesTocadas({ envLocal: '', git, env })
      expect(r.bloquea).toBe(true)
      expect(r.texto).toContain(`❌ verify-db-schema: ${F}: main ya trae la versión 20261027180000 como ${G}: si es tu migración renombrada, \`git merge origin/main\`, deja ${G} como está y el cambio va en una NUEVA; si es otra, renombra la tuya con un timestamp nuevo`)
    }
    expect(agregadasQueYaEstanEnMain([F, 'supabase/migrations/20261028000000_otra.sql'], { enMain: new Set([G]), git })).toEqual({
      iguales: [], distintas: [], versionEnMain: [{ archivo: F, enMain: G, version: '20261027180000' }],
    })
    expect(agregadasQueYaEstanEnMain([F], { enMain: null, git }).versionEnMain).toEqual([])
  })
  describe('la rama AGREGA una migración que main ya trae (merge squash sin mergear main)', () => {
    const M = 'supabase/migrations/20261027180000_timba_libre_datos.sql'
    const gitCon = (blobMain, blobHead) => args => {
      if (args.includes('ls-tree')) return `${M}\n`
      if (args.includes('--diff-filter=A')) return `${M}\n`
      if (args[0] === 'rev-parse') return args[1].startsWith('origin/main:') ? `${blobMain}\n` : `${blobHead}\n`
      return ''
    }
    it('mismo blob: solo avisa (git merge origin/main), no bloquea ni sugiere renombrar', () => {
      const r = revisarMigracionesTocadas({ envLocal: '', git: gitCon('abc', 'abc'), env: {} })
      expect(r).toEqual({ bloquea: false, texto: `⚠ verify-db-schema: main ya trae ${M} (llegó por squash); haz \`git merge origin/main\`` })
    })
    it('blob distinto: bloquea como edición de una migración mergeada', () => {
      const r = revisarMigracionesTocadas({ envLocal: '', git: gitCon('abc', 'def'), env: {} })
      expect(r.bloquea).toBe(true)
      expect(r.texto).toContain(`❌ verify-db-schema: main ya trae ${M} con otro contenido: \`git merge origin/main\`; el cambio va en una migración NUEVA`)
      expect(r.texto).toMatch(/Única salida/)
      expect(r.texto).not.toMatch(/renombra/)
      const fallaGit = args => { if (args[0] === 'rev-parse') throw new Error('x'); return gitCon('a', 'a')(args) }
      expect(revisarMigracionesTocadas({ envLocal: '', git: fallaGit, env: {} }).bloquea).toBe(true)
    })
    it('blob distinto con PERMITIR_TOCAR_MIGRACION: exime como una editada', () => {
      const r = revisarMigracionesTocadas({ envLocal: '', git: gitCon('abc', 'def'), env: { PERMITIR_TOCAR_MIGRACION: '20261027180000' } })
      expect(r.bloquea).toBe(false)
      expect(r.texto).toMatch(/⚠⚠ .*exime supabase\/migrations\/20261027180000_timba_libre_datos\.sql/)
    })
  })
  it('PERMITIR_TOCAR_MIGRACION definida en .env.local: se ignora (bloquea) y avisa; en la línea del push sí cuenta', () => {
    const git = args => args.includes('ls-tree') ? `${X}\n${Y}\n` : `M\t${X}\n`
    const env = { PERMITIR_TOCAR_MIGRACION: '20261020000000' }
    for (const envLocal of ['A=1\nPERMITIR_TOCAR_MIGRACION=20261020000000\n', '  export PERMITIR_TOCAR_MIGRACION = 20261020000000']) {
      const r = revisarMigracionesTocadas({ git, env, envLocal })
      expect(r.bloquea).toBe(true)
      expect(r.texto.split('\n')[0]).toBe('⚠⚠ verify-db-schema: PERMITIR_TOCAR_MIGRACION está en .env.local y se ignora: sácala de ahí; va solo en la línea del push')
    }
    const comentada = revisarMigracionesTocadas({ git, env, envLocal: '# PERMITIR_TOCAR_MIGRACION=20261020000000\nA=1' })
    expect(comentada.bloquea).toBe(false)
    expect(comentada.texto).not.toMatch(/\.env\.local y se ignora/)
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

describe('VERSION_CLI y NOMBRE_MIGRACION_CLI (nombre-migracion.mjs, fuente única)', () => {
  it('la versión suelta y la del nombre son los mismos 14 dígitos', () => {
    expect(NOMBRE_MIGRACION_CLI.source).toBe('^(\\d{14})_.+\\.sql$')
    expect(VERSION_CLI.test('20261027180000')).toBe(true)
    for (const v of ['2026102718000', '202610271800000', '20261027180000_x', ' 20261027180000']) expect(VERSION_CLI.test(v)).toBe(false)
  })
})

describe('versionDeMigracion', () => {
  it('la versión es el prefijo numérico del nombre', () => {
    expect(versionDeMigracion('supabase/migrations/20261027180000_timba_libre_datos.sql')).toBe('20261027180000')
    expect(versionDeMigracion('supabase\\migrations\\20261027180000_x.sql')).toBe('20261027180000')
    expect(versionDeMigracion('supabase/migrations/2026_sin_version_cli.sql')).toBeNull()
  })
})
