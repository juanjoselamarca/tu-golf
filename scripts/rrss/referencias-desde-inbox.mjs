// Puente inbox → bandeja de referencias de RRSS.
//
// Juanjo manda los links que le parecen benchmark al bot del inbox
// (@Golfers_App_Bot), no al bot RRSS aparte que planteó el diseño del 26-oct.
// Sin este puente, el análisis quedaba en `inbox_reports.notas` y `/rrss` —que
// solo lee `scripts/rrss/referencias/`— no veía ninguna referencia: al 19-nov
// había 14 analizadas en el inbox y 0 en la bandeja.
//
// Qué hace:
//   (sin flags)  cada reporte pendiente (nuevo/triaged) cuyo texto trae un link de
//                Instagram/TikTok/YouTube → ficha en scripts/rrss/referencias/ y el
//                reporte queda `resuelto` con la ruta de la ficha en las notas.
//   --foto <uuid>                 la foto de ese reporte → ficha de imagen.
//   --nota-de <uuid> --para <id>  el texto de ese reporte se agrega como nota de
//                                 Juanjo a una ficha que ya existe (cuando manda
//                                 el link y después, aparte, el comentario).
//   --dry                         solo muestra qué haría.
//
// Las fichas son archivos del repo: hay que commitearlas para que `/rrss` las vea
// desde cualquier sesión (lo dice `/inbox`).
import { createClient } from '@supabase/supabase-js'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { idDeLink, ingerir, ingerirImagen, linkDeReferencia, rutaFicha } from './referencias.mjs'

const PENDIENTES = ['nuevo', 'triaged']

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
}

/** Las notas con las que el reporte queda cerrado: lo que ya tenía, más dónde quedó la ficha. */
export function notasAlCerrar(notasPrevias, idFicha, cuando = new Date()) {
  const linea = `${cuando.toISOString().slice(0, 10)}: ficha RRSS scripts/rrss/referencias/${idFicha}.json`
  return notasPrevias?.trim() ? `${notasPrevias.trim()}\n${linea}` : linea
}

function cliente() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !clave) throw new Error('Faltan las variables de Supabase (corre con node --env-file=.env.local).')
  return createClient(url, clave, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function cerrar(s, reporte, idFicha) {
  const { error } = await s
    .from('inbox_reports')
    .update({
      status: 'resuelto',
      categoria: 'referencia-rrss',
      procesado_en: new Date().toISOString(),
      notas: notasAlCerrar(reporte.notas, idFicha),
    })
    .eq('id', reporte.id)
  if (error) throw new Error(`No pude cerrar el reporte ${reporte.id}: ${error.message}`)
}

async function reporte(s, id) {
  const { data, error } = await s.from('inbox_reports').select('*').eq('id', id).single()
  if (error) throw new Error(`No encontré el reporte ${id}: ${error.message}`)
  return data
}

async function links({ dry }) {
  const s = cliente()
  const { data, error } = await s.from('inbox_reports').select('*').in('status', PENDIENTES).order('recibido_en')
  if (error) throw new Error(error.message)
  const candidatos = reportesDeReferencia(data ?? [])
  console.log(`${candidatos.length} referencias pendientes en el inbox`)
  let fallos = 0
  for (const { reporte: r, link } of candidatos) {
    const id = idDeLink(link)
    if (dry) {
      console.log(`   [dry] ${r.id.slice(0, 8)} → ${id}${existsSync(rutaFicha(id)) ? ' (ya existe)' : ''}`)
      continue
    }
    try {
      const res = await ingerir(link, { nota: notaDelReporte(r, link), origen: `inbox:${r.id}` })
      await cerrar(s, r, res.id)
      console.log(`   ${res.reusada ? '↩︎' : '✅'} ${r.id.slice(0, 8)} → ${res.id}${res.ficha.es_de_golf === false ? ' [NO es de golf]' : ''}`)
    } catch (e) {
      fallos++
      // Queda pendiente en el inbox: la próxima corrida lo reintenta.
      console.error(`   ❌ ${r.id.slice(0, 8)} (${link}): ${e.message.split('\n')[0]}`)
    }
  }
  if (fallos) process.exitCode = 1
}

async function foto(uuid, { dry }) {
  const s = cliente()
  const r = await reporte(s, uuid)
  if (!r.fotos_paths?.length) throw new Error(`El reporte ${uuid} no trae foto.`)
  const id = `inbox-${uuid.slice(0, 8)}`
  if (dry) return console.log(`   [dry] foto ${r.fotos_paths[0]} → ${id}`)
  const { data, error } = await s.storage.from('inbox-photos').download(r.fotos_paths[0])
  if (error) throw new Error(`No pude bajar la foto: ${error.message}`)
  const ext = path.extname(r.fotos_paths[0]) || '.jpg'
  const archivo = path.join(mkdtempSync(path.join(tmpdir(), 'rrss-foto-')), `foto${ext}`)
  writeFileSync(archivo, Buffer.from(await data.arrayBuffer()))
  const res = await ingerirImagen(archivo, { id, nota: notaDelReporte(r), origen: `inbox:${r.id}` })
  await cerrar(s, r, res.id)
  console.log(`   ✅ ${uuid.slice(0, 8)} → ${res.id}`)
}

async function notaDe(uuid, idFicha, { dry }) {
  const s = cliente()
  const r = await reporte(s, uuid)
  const ruta = rutaFicha(idFicha)
  if (!existsSync(ruta)) throw new Error(`No existe la ficha ${idFicha}.`)
  const nota = notaDelReporte(r)
  if (!nota) throw new Error(`El reporte ${uuid} no trae texto.`)
  if (dry) return console.log(`   [dry] "${nota}" → nota de ${idFicha}`)
  const ficha = JSON.parse(readFileSync(ruta, 'utf8'))
  ficha.nota_juanjo = [ficha.nota_juanjo, nota].filter(Boolean).join(' · ')
  writeFileSync(ruta, `${JSON.stringify(ficha, null, 2)}\n`)
  await cerrar(s, r, idFicha)
  console.log(`   ✅ ${uuid.slice(0, 8)} → nota de ${idFicha}`)
}

async function main() {
  const args = process.argv.slice(2)
  const dry = args.includes('--dry')
  const valor = (flag) => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }
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
