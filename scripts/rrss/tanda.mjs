#!/usr/bin/env node
// Arma la tanda de la semana con piezas ya renderizadas y la manda a aprobar.
//
//   node --env-file=.env.local scripts/rrss/tanda.mjs "La idea de la semana" \
//     --pieza 2026-10-27-anota-todos-ven:central:2026-10-28T19:00:00-03:00 \
//     --pieza 2026-10-27-donde-se-van-los-golpes:derivado
//
// Es el paso que convierte "unos archivos en out/" en algo que se puede aprobar.
// Antes de mandar nada verifica que cada pieza exista, pase los controles de marca
// y esté renderizada en su versión actual: una vista previa armada con láminas
// viejas se aprueba igual, y lo que se publica después es otra cosa.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { crearTanda, semanaISO, tandaAbierta } from './cola.mjs'
import { enviarParaAprobacion } from './aprobacion.mjs'
import { mediosDePieza, rutaPiezaJson } from './publicar.mjs'
import { validarPieza } from './validar.mjs'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

/** `slug:rol[:hora]` → la entrada de la tanda. */
export function parsearPieza(texto) {
  const [pieza, rol, ...resto] = String(texto).split(':')
  if (!pieza || !rol) throw new Error(`--pieza mal escrito: "${texto}". Forma: <slug>:<rol>[:<hora ISO>]`)
  const hora = resto.join(':')
  return { pieza, rol, ...(hora ? { hora_sugerida: hora } : {}) }
}

/**
 * Lo que hace falta para mandar la tanda: las piezas leídas y los adjuntos.
 *
 * El adjunto de una pieza es su hoja de contactos (todas las láminas en una
 * imagen) y, si es un reel, el MP4. Mandar las láminas sueltas llena el chat de
 * seis fotos y la decisión se vuelve incómoda justo en el momento en que tiene
 * que ser fácil.
 */
export function prepararEnvio(entradas) {
  const piezas = {}
  const adjuntos = []
  for (const e of entradas) {
    const ruta = rutaPiezaJson(e.pieza)
    if (!existsSync(ruta)) throw new Error(`No existe la pieza ${e.pieza} (${path.relative(RAIZ, ruta)}).`)
    const pieza = JSON.parse(readFileSync(ruta, 'utf8'))
    const problemas = validarPieza(pieza)
    if (problemas.length)
      throw new Error(`La pieza ${e.pieza} no pasa los controles de marca:\n   · ${problemas.join('\n   · ')}`)
    // Verifica de paso que el render en disco sea de esta versión de la pieza.
    const { archivos, dir } = mediosDePieza(pieza)
    piezas[e.pieza] = pieza
    const video = archivos.find((a) => a.endsWith('.mp4'))
    if (video) adjuntos.push({ tipo: 'video', ruta: video, pie: `${e.rol} · ${e.pieza}` })
    const hoja = path.join(dir, 'hoja-de-contactos.png')
    if (existsSync(hoja)) adjuntos.push({ tipo: 'foto', ruta: hoja, pie: `${e.rol} · ${e.pieza}` })
  }
  return { piezas, adjuntos }
}

export async function armarYEnviar({ idea, entradas, slug = semanaISO(), env = process.env }) {
  const abierta = tandaAbierta(slug)
  if (abierta && abierta.estado !== 'cambios_pedidos')
    throw new Error(
      `Ya hay una tanda ${slug} en "${abierta.estado}". ` +
        'Una tanda por semana: cerrá esa antes de armar otra, o corregí la que está.',
    )
  const { piezas, adjuntos } = prepararEnvio(entradas)
  // Una tanda que volvió con cambios se regenera, no se duplica: vuelve a
  // borrador conservando su historial, que es donde está la nota de qué cambiar.
  const base = abierta
    ? { ...abierta, idea, piezas: entradas, estado: 'borrador', historial: [...abierta.historial, { estado: 'borrador', cuando: new Date().toISOString(), nota: 'regenerada tras los cambios pedidos' }] }
    : crearTanda({ slug, idea, piezas: entradas })
  const resultado = await enviarParaAprobacion(base, { piezas, adjuntos, env })
  return { ...resultado, piezas }
}

async function main() {
  const args = process.argv.slice(2)
  const entradas = []
  const idea = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--pieza') entradas.push(parsearPieza(args[++i]))
    else if (args[i] === '--slug') i++
    else idea.push(args[i])
  }
  const iSlug = args.indexOf('--slug')
  const slug = iSlug === -1 ? semanaISO() : args[iSlug + 1]
  if (!idea.length || !entradas.length) {
    console.error('Uso: node --env-file=.env.local scripts/rrss/tanda.mjs "<idea>" --pieza <slug>:<rol>[:<hora>] ...')
    console.error(`     roles: central, derivado, story · tanda por defecto: ${semanaISO()}`)
    process.exit(1)
  }
  const { tanda, canal: c, texto } = await armarYEnviar({ idea: idea.join(' '), entradas, slug })
  console.log(`✅ tanda ${tanda.slug} → ${tanda.estado} (canal: ${c})`)
  if (c === 'telegram') {
    console.log('   Juanjo la tiene en Telegram con los tres botones.')
    console.log('   Para leer su respuesta: node --env-file=.env.local scripts/rrss/aprobacion.mjs')
  } else {
    console.log('   Sin bot configurado: presentale esto y registrá el veredicto con')
    console.log(`   node scripts/rrss/aprobacion.mjs --veredicto ${tanda.slug} aprobar|cambios|rechazar "<nota>"`)
    console.log(`\n${texto}\n`)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => {
    console.error(`❌ ${e.message}`)
    process.exit(1)
  })
}
