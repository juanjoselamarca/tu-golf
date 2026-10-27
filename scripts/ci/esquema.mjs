#!/usr/bin/env node
/**
 * Genera supabase/schema.sql: el esquema que dejan todas las migraciones (tablas, columnas, RLS, policies y
 * privilegios), para leerlo sin recorrer las migraciones. Lo escribe generarDDL (scripts/test-db/sync-schema.mjs, el
 * mismo que generó el baseline), sin el paso de vaciado.
 *
 * Levanta un Postgres desechable con las migraciones (supabase db start: Docker y el CLI de Supabase), lee su
 * catálogo y lo borra. El workflow `esquema` lo corre en cada PR que toca supabase/migrations/ y falla si el archivo
 * del PR no es el que generan; sin Docker, el archivo correcto queda como artifact `schema-sql` de ese run.
 *
 * Uso:  node scripts/ci/esquema.mjs
 */
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { leerCatalogo, generarDDL } from '../test-db/sync-schema.mjs'

const RAIZ = path.resolve(import.meta.dirname, '../..')
const ESQUEMA = path.join(RAIZ, 'supabase', 'schema.sql')
const CABECERA = `-- GENERADO por scripts/ci/esquema.mjs: no editar a mano. Es el esquema que dejan las migraciones de
-- supabase/migrations, y el workflow esquema lo verifica en cada PR. Tras una migración: node scripts/ci/esquema.mjs
`

/** Un puerto libre, para no chocar con otro Supabase local. */
const puertoLibre = () => new Promise((resolve, reject) => {
  const s = createServer().once('error', reject).listen(0, () => {
    const { port } = s.address()
    s.close(() => resolve(port))
  })
})

/**
 * psql dentro del contenedor (el equipo no necesita cliente de Postgres), con search_path vacío para que las
 * definiciones salgan calificadas, como en el baseline. Un bigint que no cabe en un número de JS (maxvalue de las
 * secuencias) queda como su texto exacto.
 */
const lectorDe = contenedor => q => JSON.parse(
  execFileSync('docker', ['exec', '-i', contenedor, 'psql', '-U', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1'], {
    input: `set search_path to ''; select coalesce(json_agg(t), '[]') from (${q}) t;`,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  }),
  (_, v, { source }) => (Number.isInteger(v) && !Number.isSafeInteger(v) ? source : v),
)

async function main() {
  // Ctrl+C también le llega al proceso hijo: que muera él y el finally baje el contenedor.
  process.on('SIGINT', () => {})
  const dir = mkdtempSync(path.join(tmpdir(), 'golfers-esquema-'))
  const proyecto = `golfers-esquema-${process.pid}`
  const supabase = (...args) => execFileSync('supabase', [...args, '--workdir', dir], { stdio: ['ignore', 'ignore', 'inherit'] })
  try {
    cpSync(path.join(RAIZ, 'supabase', 'migrations'), path.join(dir, 'supabase', 'migrations'), { recursive: true })
    writeFileSync(path.join(dir, 'supabase', 'config.toml'),
      `project_id = "${proyecto}"\n\n[db]\nport = ${await puertoLibre()}\nmajor_version = 17\n\n[db.seed]\nenabled = false\n`)
    supabase('db', 'start')
    const ddl = generarDDL(await leerCatalogo(lectorDe(`supabase_db_${proyecto}`)), [], { vaciar: false })
    writeFileSync(ESQUEMA, `${CABECERA}\n${ddl}\n`)
    console.log(`✔ ${path.relative(RAIZ, ESQUEMA)} generado desde supabase/migrations`)
  } finally {
    try {
      supabase('stop', '--no-backup')
    } catch (e) {
      // Sin tapar el error original (p. ej. uno anterior a escribir config.toml).
      console.error(`✘ no se detuvo supabase_db_${proyecto}: ${e.message}`)
      process.exitCode = 1
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
}

main().catch(e => { console.error(`✘ esquema: ${e.message}`); process.exitCode = 1 })
