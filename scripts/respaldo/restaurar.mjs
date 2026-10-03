#!/usr/bin/env node
/**
 * Restaura una tabla desde el respaldo diario (scripts/respaldo/respaldo-diario.mjs).
 *
 * Por defecto NO escribe en producción: carga el respaldo en una tabla TEMPORAL de sesión (pg_temp: PostgREST
 * no la ve y muere con la conexión) con la misma estructura y cuenta las filas. Solo con `--aplicar` inserta en
 * la tabla real — escritura sobre datos de usuarios (zona crítica): antes, `revisor-fable` revisa el SQL que
 * imprime `--mostrar-sql`.
 *
 * Lo que el SQL ingenuo (`insert … select * from json_populate_recordset`) no resuelve:
 *   - Columnas: solo las que trae el respaldo y no son GENERATED (Postgres recalcula courses.nombre_canonico,
 *     knowledge_chunks.tsv, auth.users.confirmed_at…). Una columna que el respaldo no trae (agregada después, o
 *     quitada a propósito) no se escribe NULL: toma su DEFAULT, salvo las de `alRestaurar` (tablas-auth.mjs).
 *   - IDENTITY ALWAYS (pattern_observations.id, external_priors_*): OVERRIDING SYSTEM VALUE. Tras aplicar se
 *     sincronizan las secuencias (si no, en un proyecto nuevo cada insert de la app chocaría con ids restaurados).
 *   - `--modo actualizar` pisa filas existentes: exige `--ids` para no devolver toda la tabla a ayer.
 *   - Sin superuser no se apagan triggers: restaurar auth.users dispara on_auth_user_created (profile vacío).
 *     Flujo: auth.users --aplicar → imprime los ids → profiles --modo actualizar --ids <esos ids> --aplicar.
 *
 * Uso:
 *   node --env-file=.env.local scripts/respaldo/restaurar.mjs --tabla public.courses [--fecha AAAA-MM-DD]
 *        [--modo faltantes|actualizar] [--ids id1,id2] [--aplicar] [--mostrar-sql] [--origen <carpeta>]
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { gunzipSync } from 'node:zlib'
import { projectRefDe } from '../lib/supabase-ref.mjs'
import { AUTH_TABLAS, NO_RESTAURABLES } from './tablas-auth.mjs'

const argv = process.argv.slice(2)
const arg = k => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : undefined }
const flag = k => argv.includes(`--${k}`)
const salir = m => { console.error(m); process.exit(1) }
const tabla = arg('tabla')
const modo = arg('modo') ?? 'faltantes'
const ids = arg('ids') ? arg('ids').split(',').map(s => s.trim()).filter(Boolean) : null
const ORIGEN = arg('origen') ?? join(homedir(), 'OneDrive', 'GolfersPlus-Respaldos')
const REF = projectRefDe(process.env.NEXT_PUBLIC_SUPABASE_URL)
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
if (!tabla || !/^(public|auth)\.[a-z_][a-z0-9_]*$/.test(tabla)) salir('Falta --tabla esquema.tabla (public.* o auth.*).')
if (NO_RESTAURABLES.includes(tabla)) salir(`${tabla} no se respalda ni se restaura (ver scripts/respaldo/tablas-auth.mjs).`)
if (!['faltantes', 'actualizar'].includes(modo)) salir('--modo debe ser faltantes o actualizar.')
if (modo === 'actualizar' && !ids) salir('--modo actualizar exige --ids: pisar toda la tabla la devolvería entera al día del respaldo.')
if (!REF || !TOKEN) salir('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_ACCESS_TOKEN (.env.local).')

const fechas = existsSync(ORIGEN) ? readdirSync(ORIGEN).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d) && existsSync(join(ORIGEN, d, '_manifiesto.json'))).sort() : []
const fecha = arg('fecha') ?? fechas.at(-1)
if (!fecha || !fechas.includes(fecha)) salir(`No hay respaldo para ${fecha ?? '(ninguna fecha)'} en ${ORIGEN}. Disponibles: ${fechas.join(', ') || 'ninguno'}`)
const archivo = join(ORIGEN, fecha, `${tabla}.json.gz`)
if (!existsSync(archivo)) salir(`El respaldo ${fecha} no tiene ${tabla}.`)
const filas = JSON.parse(gunzipSync(readFileSync(archivo)))

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }), signal: AbortSignal.timeout(180_000),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 500)}`)
  return JSON.parse(t)
}

const [esq, nom] = tabla.split('.')
const lit = s => `'${String(s).replace(/'/g, "''")}'`
const qi = s => `"${String(s).replace(/"/g, '""')}"`
const tq = `${qi(esq)}.${qi(nom)}`

const columnas = await sql(`select column_name c, is_generated g, identity_generation i from information_schema.columns
  where table_schema=${lit(esq)} and table_name=${lit(nom)} order by ordinal_position`)
if (!columnas.length) salir(`${tabla} no existe en la base.`)
const pk = (await sql(`select a.attname c from pg_index x join pg_attribute a on a.attrelid=x.indrelid and a.attnum=any(x.indkey)
  where x.indrelid=${lit(tabla)}::regclass and x.indisprimary`)).map(r => r.c)
if (!pk.length) salir(`${tabla} no tiene llave primaria: restaurar a mano.`)
if (ids && pk.length !== 1) salir(`--ids solo funciona con llave primaria de una columna (${tabla} tiene ${pk.join(', ')}).`)

const enRespaldo = new Set(filas.flatMap(f => Object.keys(f)))
const forzadas = AUTH_TABLAS[tabla]?.alRestaurar ?? {}
// Columnas a escribir: no generadas y presentes en el respaldo, más las forzadas (tokens de auth con '').
const cols = columnas.filter(c => c.g !== 'ALWAYS' && (enRespaldo.has(c.c) || c.c in forzadas)).map(c => c.c)
if (!pk.every(c => cols.includes(c))) salir(`El respaldo de ${tabla} no trae la llave primaria.`)
const identity = columnas.some(c => c.i === 'ALWAYS' && cols.includes(c.c))
const lista = cols.map(qi).join(', ')
// Forzadas: siempre con coalesce (si el respaldo no las trae, o las trae NULL, vuelven con su valor seguro).
const seleccion = cols.map(c => (c in forzadas ? (enRespaldo.has(c) ? `coalesce(r.${qi(c)}, ${forzadas[c]}) as ${qi(c)}` : `${forzadas[c]} as ${qi(c)}`) : `r.${qi(c)}`)).join(', ')
const conflicto = modo === 'actualizar'
  ? `on conflict (${pk.map(qi).join(', ')}) do update set ${cols.filter(c => !pk.includes(c)).map(c => `${qi(c)} = excluded.${qi(c)}`).join(', ')}`
  : `on conflict (${pk.map(qi).join(', ')}) do nothing`
// La Management API rechaza cuerpos grandes (HTTP 413 con knowledge_chunks, ~10 MB; 2 MB pasa): por lotes.
// Se mide en BYTES y con margen: lit() duplica comillas y el body JSON escapa comillas y saltos de línea.
const LOTE_BYTES = 600_000
let seleccionadas = ids ? filas.filter(f => ids.includes(String(f[pk[0]]))) : filas
if (ids) {
  const faltan = ids.filter(id => !seleccionadas.some(f => String(f[pk[0]]) === id))
  if (faltan.length) salir(`No están en el respaldo ${fecha}: ${faltan.join(', ')}`)
}

// FK hacia la misma tabla (courses.parent_id / canonical_course_id, inbox_reports, coach_episodic_memory): las FK
// se validan por statement, así que un hijo no puede ir en un lote anterior al de su padre. Orden: primero las
// filas cuyas referencias son NULL, apuntan a filas que ya existen en la base o a filas ya emitidas.
const selfFk = await sql(`select a.attname c, b.attname ref from pg_constraint k
  join pg_attribute a on a.attrelid=k.conrelid and a.attnum=any(k.conkey)
  join pg_attribute b on b.attrelid=k.confrelid and b.attnum=any(k.confkey)
  where k.contype='f' and k.conrelid=k.confrelid and k.conrelid=${lit(tabla)}::regclass and cardinality(k.conkey)=1`)
let ordenPorFk = false
if (selfFk.length) {
  // Cada FK propia compara la columna hija con la columna que referencia (hoy siempre `id`, pero se lee del catálogo).
  const refs = [...new Set(selfFk.map(x => x.ref))]
  const enBase = Object.fromEntries(await Promise.all(refs.map(async r => [r, new Set((await sql(`select ${qi(r)}::text v from ${tq}`)).map(x => x.v))])))
  const emitidas = Object.fromEntries(refs.map(r => [r, new Set()]))
  const enSeleccion = Object.fromEntries(refs.map(r => [r, new Set(seleccionadas.map(f => String(f[r])))]))
  const resuelta = (f, { c, ref }) => f[c] == null || enBase[ref].has(String(f[c])) || emitidas[ref].has(String(f[c])) || String(f[c]) === String(f[ref])
  const pendientes = [...seleccionadas], orden = []
  while (pendientes.length) {
    const listas = pendientes.filter(f => selfFk.every(k => resuelta(f, k)))
    if (!listas.length) {
      // ¿Falta un padre (no está ni en la base ni en lo seleccionado) o es un ciclo de verdad?
      const huerfanas = pendientes.flatMap(f => selfFk.filter(k => f[k.c] != null && !enBase[k.ref].has(String(f[k.c])) && !enSeleccion[k.ref].has(String(f[k.c]))).map(k => `${f[pk[0]]}→${k.c}=${f[k.c]}`))
      if (huerfanas.length) salir(`${tabla}: ${huerfanas.length} filas apuntan a padres que no están ni en la base ni en lo seleccionado: ${huerfanas.slice(0, 10).join(', ')}. Agregarlos a --ids.`)
      salir(`${tabla}: referencias circulares entre ${pendientes.length} filas del respaldo; restaurar a mano.`)
    }
    for (const f of listas) {
      orden.push(f)
      for (const r of refs) emitidas[r].add(String(f[r]))
      pendientes.splice(pendientes.indexOf(f), 1)
    }
  }
  seleccionadas = orden
  ordenPorFk = true
}

const lotes = []
for (let i = 0, actual = [], tam = 0; i <= seleccionadas.length; i++) {
  const f = seleccionadas[i]
  const t = f ? Buffer.byteLength(JSON.stringify(f)) : 0
  if (actual.length && (!f || tam + t > LOTE_BYTES)) { lotes.push(actual); actual = []; tam = 0 }
  if (f) { actual.push(f); tam += t }
}
const insertar = (destino, lote, retorno = '') => `insert into ${destino} (${lista})${identity ? ' overriding system value' : ''}
  select ${seleccion} from json_populate_recordset(null::${tq}, ${lit(JSON.stringify(lote))}::json) r ${conflicto}${retorno}`

if (flag('mostrar-sql')) console.log(insertar(tq, []).replace(`'[]'::json`, `'<${seleccionadas.length} filas del respaldo ${fecha}, en ${lotes.length} lotes>'::json`))

if (!flag('aplicar')) {
  // Cada lote en su propia tabla TEMPORAL de sesión: no queda en `public`, PostgREST no la expone y desaparece
  // con la conexión (verificado: la Management API abre una sesión nueva por consulta). Además: ninguna columna
  // forzada (tokens de auth) puede quedar NULL — el login no lo acepta.
  const nulos = Object.keys(forzadas).filter(c => cols.includes(c)).map(c => `${qi(c)} is null`).join(' or ') || 'false'
  let n = 0, conNulos = 0
  for (const lote of lotes) {
    const tmp = `restaurar_prueba_${Date.now()}`
    const [r] = await sql(`create temporary table ${qi(tmp)} (like ${tq} including all);
      ${insertar(qi(tmp), lote)};
      select count(*)::int n, count(*) filter (where ${nulos})::int con_nulos from ${qi(tmp)}`)
    n += r.n; conNulos += r.con_nulos
  }
  if (conNulos) console.log(`✘ ${conNulos} filas quedarían con columnas forzadas en NULL (romperían el login).`)
  const ok = n === seleccionadas.length && conNulos === 0
  console.log(`${ok ? '✔' : '✘'} PRUEBA ${tabla} (respaldo ${fecha}${ids ? `, ${ids.length} ids` : ''}, ${lotes.length} lote${lotes.length === 1 ? '' : 's'}): ${n}/${seleccionadas.length} filas entran (columnas generadas, identity, columnas faltantes${ordenPorFk ? ', orden por FK propia' : ''}). Nada se escribió en la tabla real.`)
  process.exit(ok ? 0 : 1)
}

const antes = (await sql(`select count(*)::int n from ${tq}`))[0].n
const tocadas = []
let aplicados = 0
try {
  for (const lote of lotes) {
    tocadas.push(...await sql(insertar(tq, lote, ` returning ${qi(pk[0])}::text id`)))
    aplicados++
  }
} catch (e) {
  console.error(`✘ Falló el lote ${aplicados + 1}/${lotes.length}: ${e.message}`)
  console.error(`Lotes aplicados: ${aplicados}/${lotes.length}. Volver a correr es seguro: lo ya escrito no se repite (ON CONFLICT).`)
  process.exitCode = 1
} finally {
  // Primero el informe (los ids escritos son lo que se necesita para el paso siguiente, p. ej. profiles --ids):
  // si la sincronización de secuencias falla después (base colgada), no se pierden.
  if (tocadas.length) console.log(`ids escritos: ${tocadas.map(t => t.id).join(',')}`)
  try {
    // Secuencias (serial/identity): al máximo restaurado, para que los inserts de la app no choquen con ids viejos.
    const seqs = (await sql(`select a.attname c, pg_get_serial_sequence(${lit(tq)}, a.attname) seq from pg_attribute a
      where a.attrelid=${lit(tabla)}::regclass and a.attnum>0 and not a.attisdropped`)).filter(r => r.seq)
    for (const { c, seq } of seqs) await sql(`select setval(${lit(seq)}, greatest((select coalesce(max(${qi(c)}), 0) from ${tq}), 1))`)
  } catch (e) {
    console.error(`✘ No se sincronizaron las secuencias: ${e.message}. Repetir con --aplicar (0 filas nuevas) cuando la base responda.`)
    process.exitCode = 1
  }
}
const despues = (await sql(`select count(*)::int n from ${tq}`))[0].n
console.log(`${process.exitCode ? 'PARCIAL' : 'APLICADO'} ${tabla} (${modo}, respaldo ${fecha}): ${antes} → ${despues} filas; ${tocadas.length} filas escritas.`)
