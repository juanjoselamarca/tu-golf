#!/usr/bin/env node
/**
 * Deriva del esquema de prod (item 5 de docs/PLAN-MAX.md). migraciones-prod guarda la huella del esquema tras cada
 * aplicación aprobada (--guardar) y prod-canarios la compara cada noche (--comparar): si difieren, alguien cambió
 * prod por fuera de una migración revisada.
 *
 * La huella es la de la base de pruebas (scripts/test-db/sync-schema.mjs), leída vía exec_sql (solo lectura, service
 * key). Se guarda cada objeto con el sha256 de su definición: el artifact de un repo público no expone definiciones
 * ni permisos.
 *
 * Uso:  node scripts/ci/deriva-esquema.mjs --guardar <archivo> | --comparar <archivo>
 * Env:  NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { execSql } from '../lib/exec-sql.mjs'
import { leerCatalogo, huella, diferencias } from '../test-db/sync-schema.mjs'

const PAUSA_MS = 1_000 // prod es Nano: las lecturas van de a una y con pausa.

const ACL = /^(privilegio|default-acl|esquema) /

/**
 * Objeto → sha256. Las claves de ACL terminan en `<grantee> <privilegio>`: se agrupan por objeto para que el artifact
 * y el log de una deriva no publiquen quién puede qué en prod.
 */
export function hashear(h) {
  const grupos = new Map()
  for (const [k, v] of h) {
    const objeto = ACL.test(k) ? k.split(' ').slice(0, -2).join(' ') : k
    grupos.set(objeto, [...(grupos.get(objeto) ?? []), ACL.test(k) ? `${k} ${v}` : v])
  }
  return new Map([...grupos].map(([k, vs]) => [k, createHash('sha256').update(vs.sort().join('\n')).digest('hex')]))
}

export function comparar(referencia, actual) {
  return diferencias(new Map(Object.entries(referencia.objetos)), actual, ['la última aplicación', 'prod'])
}

async function huellaDeProd() {
  return hashear(huella(await leerCatalogo(q => execSql(q), { pausa: PAUSA_MS })))
}

async function main([modo, archivo]) {
  if (!['--guardar', '--comparar'].includes(modo) || !archivo) throw new Error('uso: --guardar <archivo> | --comparar <archivo>')
  if (modo === '--guardar') {
    const actual = await huellaDeProd()
    writeFileSync(archivo, JSON.stringify({ fecha: new Date().toISOString(), objetos: Object.fromEntries(actual) }, null, 1))
    console.log(`✔ huella del esquema de prod guardada: ${actual.size} objetos → ${archivo}`)
    return
  }
  if (!existsSync(archivo)) {
    throw new Error('no hay huella de referencia (vence a los 90 días sin migraciones). Para fijarla, correr a mano el workflow migraciones-prod.')
  }
  const referencia = JSON.parse(readFileSync(archivo, 'utf8'))
  const dif = comparar(referencia, await huellaDeProd())
  if (dif.length) {
    console.error(`✘ el esquema de prod cambió por fuera de una migración en ${dif.length} punto(s) desde la última aplicación (${referencia.fecha}):\n- ${dif.slice(0, 60).join('\n- ')}`)
    process.exitCode = 1
    return
  }
  console.log(`✔ esquema de prod igual al de la última aplicación (${referencia.fecha}, ${Object.keys(referencia.objetos).length} objetos)`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(e => { console.error(`✘ deriva-esquema: ${e.message}`); process.exitCode = 1 })
}
