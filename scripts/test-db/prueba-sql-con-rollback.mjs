// Corre archivos .sql en la BASE DE PRUEBAS en UNA transacción (Management API). Pensado para pruebas que terminan en
// RAISE (rollback total, ver prueba-skins-congelado.sql): imprime el mensaje de la excepción. Nunca prod:
// resolverPruebas aborta si el destino es prod o no se llama golfersplus-test.
//   node --env-file=.env.local scripts/test-db/prueba-sql-con-rollback.mjs <a.sql> [<b.sql> ...]
import { readFileSync } from 'node:fs'
import { sqlEn } from '../lib/management-sql.mjs'
import { resolverPruebas } from './proyectos.mjs'

const archivos = process.argv.slice(2)
if (archivos.length === 0) {
  console.error('Uso: node --env-file=.env.local scripts/test-db/prueba-sql-con-rollback.mjs <a.sql> [<b.sql> ...]')
  process.exit(1)
}
const ref = await resolverPruebas()
const sql = archivos.map(f => readFileSync(f, 'utf8')).join('\n;\n')
try {
  const out = await sqlEn(ref, sql)
  console.log('Terminó SIN excepción (la prueba debía cerrar con RAISE):', JSON.stringify(out).slice(0, 500))
  process.exit(1)
} catch (e) {
  console.log(String(e?.message ?? e).slice(0, 8000))
}
