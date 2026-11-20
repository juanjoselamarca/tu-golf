// Puente inbox → bandeja de referencias de RRSS.
//
// Juanjo manda los links que le parecen benchmark al bot del inbox
// (@Golfers_App_Bot), no al bot RRSS aparte que planteó el diseño del 26-oct.
// Sin este puente, el análisis quedaba en `inbox_reports.notas` y `/rrss` —que
// solo lee `scripts/rrss/referencias/` en `main`— no veía ninguna referencia: al
// 19-nov había 14 analizadas en el inbox y 0 en la bandeja.
//
// Ciclo de un reporte:
//   pendiente ──(ficha escrita)──► en_progreso "esperando merge ficha RRSS: <id>"
//             ──(ficha en origin/main, --cerrar-mergeadas)──► resuelto
//   Si no se pudo bajar: queda triaged con categoria='referencia-rrss' y el motivo
//   en las notas. El snapshot de /inbox excluye esa categoría, así que nunca entra
//   al triage como si fuera un bug, y la próxima corrida lo reintenta.
//
// Modos:
//   (sin flags)                   links pendientes → fichas.
//   --foto <uuid>                 la foto de ese reporte → ficha de imagen.
//   --nota-de <uuid> --para <id>  el texto de ese reporte va como nota de Juanjo a
//                                 una ficha existente (link y comentario por separado).
//   --cerrar-mergeadas            cierra los reportes cuya ficha ya está en origin/main.
//   --dry                         solo muestra qué haría.
//
// Correr desde un worktree propio (`setup-worktree.mjs`): las fichas se escriben
// junto a este script y van en un PR.
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { idDeLink, ingerir, ingerirImagen, linkDeReferencia, rutaFicha } from './referencias.mjs'

const PENDIENTES = ['nuevo', 'triaged']
export const CATEGORIA = 'referencia-rrss'
export const ESPERA_MERGE = 'esperando merge ficha RRSS: '
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * Sobre este largo, el texto que acompaña al link deja de ser "una referencia con
 * un comentario" y pasa a ser un reporte que trae un link (p. ej. un bug del
 * botón compartir). Ese va al triage, no se cierra solo.
 */
export const MAX_PALABRAS_NOTA = 25

/** El texto del reporte sin el link: lo que Juanjo dijo de la referencia, si dijo algo. */
export function notaDelReporte(reporte, link) {
  return [reporte.texto, reporte.caption]
    .filter(Boolean)
    .join('\n')
    .replace(link ?? '', '')
    .trim()
}

/** Los reportes pendientes que son links de referencia, con su link ya extraído. */
export function reportesDeReferencia(reportes) {
  return reportes
    .filter((r) => PENDIENTES.includes(r.status))
    .map((r) => ({ reporte: r, link: linkDeReferencia(`${r.texto ?? ''}\n${r.caption ?? ''}`) }))
    .filter((x) => x.link)
    .filter((x) => notaDelReporte(x.reporte, x.link).split(/\s+/).filter(Boolean).length <= MAX_PALABRAS_NOTA)
}

/** Agrega una línea fechada a las notas sin perder lo que ya tenían (ni repetirla). */
export function agregarNota(notasPrevias, linea, cuando = new Date()) {
  const previas = notasPrevias?.trim() ?? ''
  if (previas.includes(linea)) return previas
  const fechada = `${cuando.toISOString().slice(0, 10)}: ${linea}`
  return previas ? `${previas}\n${fechada}` : fechada
}

/**
 * La ficha que espera un reporte y desde cuándo, sacadas de sus notas (la última
 * marca: un reporte reintentado vuelve a marcarse con fecha nueva).
 */
export function fichaEsperada(notas) {
  const marcas = [
    ...String(notas ?? '').matchAll(new RegExp(`(?:(\\d{4}-\\d{2}-\\d{2}): )?${ESPERA_MERGE}([A-Za-z0-9_-]+)`, 'g')),
  ]
  const ultima = marcas.at(-1)
  return ultima ? { id: ultima[2], desde: ultima[1] ?? null } : null
}

/** Días que un reporte espera su PR de fichas antes de volver a la cola para reintentarse. */
export const DIAS_ESPERA_MAX = 3

/** Lo que Juanjo dijo en el reporte, sin el link si traía uno. Es lo que la ficha tiene que guardar. */
export const notaEsperada = (r) => notaDelReporte(r, linkDeReferencia(`${r.texto ?? ''}\n${r.caption ?? ''}`))

/**
 * ¿La versión de la ficha que está en main ya trae lo que este reporte aportó?
 * No basta que el archivo exista: un `--nota-de` o un link reenviado con
 * comentario escriben en una ficha que ya estaba en main, y el reporte se
 * cerraría antes de que su nota llegue.
 */
export function fichaCumple(fichaEnMain, nota) {
  if (!fichaEnMain) return false
  return !nota || String(fichaEnMain.nota_juanjo ?? '').includes(nota)
}

/**
 * Con qué categoría vuelve a la cola un reporte cuya ficha no llegó a main.
 * Solo un reporte con link lo recoge `links()` solo; uno de `--foto` o
 * `--nota-de` tiene que verlo una persona, así que vuelve sin categoría y cae
 * al snapshot de /inbox (si conservara 'referencia-rrss', no lo vería nadie).
 */
export function categoriaAlReintentar(r) {
  // La misma regla con la que links() elige: si no, un reporte con link y nota larga
  // quedaría excluido del snapshot y de links() a la vez.
  return reportesDeReferencia([{ ...r, status: 'triaged' }]).length ? CATEGORIA : null
}

/** Agrega la nota de Juanjo a una ficha local, sin repetirla. Devuelve si cambió algo. */
function anotarFicha(ruta, nota) {
  const ficha = JSON.parse(readFileSync(ruta, 'utf8'))
  if (!nota || String(ficha.nota_juanjo ?? '').includes(nota)) return false
  ficha.nota_juanjo = [ficha.nota_juanjo, nota].filter(Boolean).join(' · ')
  writeFileSync(ruta, `${JSON.stringify(ficha, null, 2)}\n`)
  return true
}

function cliente() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !clave) throw new Error('Faltan las variables de Supabase (corre con node --env-file=.env.local).')
  return createClient(url, clave, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function actualizar(s, reporte, cambios) {
  const { error } = await s.from('inbox_reports').update(cambios).eq('id', reporte.id)
  if (error) throw new Error(`No pude actualizar el reporte ${reporte.id}: ${error.message}`)
}

/** Ficha escrita: el reporte espera que llegue a main. No se cierra todavía. */
const esperarMerge = (s, reporte, idFicha) =>
  actualizar(s, reporte, {
    status: 'en_progreso',
    categoria: CATEGORIA,
    notas: agregarNota(reporte.notas, `${ESPERA_MERGE}${idFicha}`),
  })

async function reporte(s, id) {
  const { data, error } = await s.from('inbox_reports').select('*').eq('id', id).single()
  if (error) throw new Error(`No encontré el reporte ${id}: ${error.message}`)
  return data
}

function exigirPendiente(r) {
  if (!PENDIENTES.includes(r.status))
    throw new Error(`El reporte ${r.id} está "${r.status}": ya se procesó. No lo toco dos veces.`)
}

async function links({ dry }) {
  const s = cliente()
  const { data, error } = await s.from('inbox_reports').select('*').in('status', PENDIENTES).order('recibido_en')
  if (error) throw new Error(error.message)
  const todos = reportesDeReferencia(data ?? [])
  // Un post de imagen no lo baja yt-dlp nunca: reintentarlo solo gasta minutos. Se revisa a mano.
  const imagen = todos.filter((x) => /post de imagen/.test(x.reporte.notas ?? ''))
  const candidatos = todos.filter((x) => !imagen.includes(x))
  console.log(`${candidatos.length} referencias pendientes en el inbox`)
  for (const { reporte: r, link } of imagen) console.log(`   🖼  ${r.id.slice(0, 8)} post de imagen, revisar a mano: ${link}`)
  let fallos = 0
  for (const { reporte: r, link } of candidatos) {
    const id = idDeLink(link)
    if (dry) {
      console.log(`   [dry] ${r.id.slice(0, 8)} → ${id}${existsSync(rutaFicha(id)) ? ' (ya existe)' : ''}`)
      continue
    }
    try {
      const nota = notaDelReporte(r, link)
      const res = await ingerir(link, { nota, origen: `inbox:${r.id}` })
      // Reenvío de un link que ya tenía ficha: el comentario nuevo no se pierde.
      if (res.reusada) anotarFicha(res.ruta, nota)
      await esperarMerge(s, r, res.id)
      console.log(`   ${res.reusada ? '↩︎' : '✅'} ${r.id.slice(0, 8)} → ${res.id}${res.ficha.es_de_golf === false ? ' [NO es de golf]' : ''}`)
    } catch (e) {
      fallos++
      const motivo = e.message.split('\n')[0]
      // Queda pendiente pero marcado como referencia: fuera del triage de bugs.
      await actualizar(s, r, {
        status: 'triaged',
        categoria: CATEGORIA,
        notas: agregarNota(r.notas, `referencia RRSS que no se pudo bajar: ${motivo}`),
      }).catch((err) => console.error(`      (y no pude anotarlo: ${err.message})`))
      console.error(`   ❌ ${r.id.slice(0, 8)} (${link}): ${motivo}`)
    }
  }
  if (fallos) process.exitCode = 1
}

async function foto(uuid, { dry }) {
  const s = cliente()
  const r = await reporte(s, uuid)
  exigirPendiente(r)
  if (!r.fotos_paths?.length) throw new Error(`El reporte ${uuid} no trae foto.`)
  const id = `inbox-${r.id.slice(0, 8)}`
  if (dry) return console.log(`   [dry] foto ${r.fotos_paths[0]} → ${id}`)
  const { data, error } = await s.storage.from('inbox-photos').download(r.fotos_paths[0])
  if (error) throw new Error(`No pude bajar la foto: ${error.message}`)
  const ext = path.extname(r.fotos_paths[0]) || '.jpg'
  const archivo = path.join(mkdtempSync(path.join(tmpdir(), 'rrss-foto-')), `foto${ext}`)
  writeFileSync(archivo, Buffer.from(await data.arrayBuffer()))
  // notaEsperada: la misma fuente con la que --cerrar-mergeadas la busca en main.
  const res = await ingerirImagen(archivo, { id, nota: notaEsperada(r), origen: `inbox:${r.id}` })
  await esperarMerge(s, r, res.id)
  console.log(`   ✅ ${r.id.slice(0, 8)} → ${res.id}`)
}

async function notaDe(uuid, idFicha, { dry }) {
  const s = cliente()
  const r = await reporte(s, uuid)
  exigirPendiente(r) // correrlo dos veces duplicaría la nota
  const ruta = rutaFicha(idFicha)
  if (!existsSync(ruta)) throw new Error(`No existe la ficha ${idFicha}.`)
  const nota = notaEsperada(r)
  if (!nota) throw new Error(`El reporte ${uuid} no trae texto.`)
  if (dry) return console.log(`   [dry] "${nota}" → nota de ${idFicha}`)
  anotarFicha(ruta, nota)
  await esperarMerge(s, r, idFicha)
  console.log(`   ✅ ${r.id.slice(0, 8)} → nota de ${idFicha}`)
}

/** La ficha tal como está en origin/main (lo que lee /rrss), o null si todavía no llega. */
function fichaEnMain(idFicha) {
  try {
    const texto = execFileSync('git', ['show', `origin/main:scripts/rrss/referencias/${idFicha}.json`], {
      cwd: RAIZ,
      stdio: 'pipe',
      encoding: 'utf8',
    })
    return JSON.parse(texto)
  } catch {
    return null
  }
}

async function cerrarMergeadas({ dry }) {
  const s = cliente()
  execFileSync('git', ['fetch', '--quiet', 'origin', 'main'], { cwd: RAIZ, stdio: 'pipe', timeout: 120_000 })
  const { data, error } = await s
    .from('inbox_reports')
    .select('*')
    .eq('status', 'en_progreso')
    .eq('categoria', CATEGORIA)
  if (error) throw new Error(error.message)
  let esperando = 0
  for (const r of data ?? []) {
    const espera = fichaEsperada(r.notas)
    if (!espera) continue
    const idFicha = espera.id
    if (!fichaCumple(fichaEnMain(idFicha), notaEsperada(r))) {
      const dias = espera.desde ? (Date.now() - Date.parse(espera.desde)) / 86_400_000 : 0
      if (dias > DIAS_ESPERA_MAX) {
        // El PR de fichas no llegó nunca (worktree descartado, PR cerrado): de vuelta
        // a la cola, para que la próxima corrida la rehaga. La marca vieja se reescribe
        // para que la nueva espera parta con fecha propia.
        if (dry) {
          console.log(`   [dry] ${r.id.slice(0, 8)} → vuelve a la cola (${idFicha} no llegó a main)`)
          continue
        }
        const categoria = categoriaAlReintentar(r)
        await actualizar(s, r, {
          status: 'triaged',
          categoria,
          notas: agregarNota(
            r.notas.replaceAll(ESPERA_MERGE, 'no llegó a main la ficha RRSS: '),
            `${Math.floor(dias)} días sin que ${idFicha} llegue a main: ${
              categoria ? 'se reintenta' : 'rehacer a mano con --foto o --nota-de'
            }`,
          ),
        })
        console.log(`   ↺ ${r.id.slice(0, 8)} → vuelve a la cola (${idFicha} no llegó a main)`)
        continue
      }
      esperando++
      console.log(`   ⏳ ${r.id.slice(0, 8)} → ${idFicha} todavía no está en main`)
      continue
    }
    if (dry) {
      console.log(`   [dry] ${r.id.slice(0, 8)} → resuelto (${idFicha} en main)`)
      continue
    }
    await actualizar(s, r, {
      status: 'resuelto',
      procesado_en: new Date().toISOString(),
      notas: agregarNota(r.notas, `ficha RRSS en main: scripts/rrss/referencias/${idFicha}.json`),
    })
    console.log(`   ✅ ${r.id.slice(0, 8)} → resuelto (${idFicha})`)
  }
  if (esperando) console.log(`${esperando} esperando merge de su PR de fichas`)
}

async function main() {
  const args = process.argv.slice(2)
  const dry = args.includes('--dry')
  const valor = (flag) => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }
  if (args.includes('--cerrar-mergeadas')) return cerrarMergeadas({ dry })
  if (valor('--foto')) return foto(valor('--foto'), { dry })
  if (valor('--nota-de')) {
    if (!valor('--para')) throw new Error('Uso: --nota-de <uuid> --para <id-de-ficha>')
    return notaDe(valor('--nota-de'), valor('--para'), { dry })
  }
  return links({ dry })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => {
    console.error(`❌ ${e.message}`)
    process.exit(1)
  })
}
