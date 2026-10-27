// Empaqueta una tanda APROBADA para subirla a Instagram.
//
// No publica por API. El plan v2 decidió subir por navegador con la extensión de
// Chrome, pieza a pieza, porque la app de Meta exige un perfil de Facebook que la
// cuenta no tiene (docs/rrss/setup-meta-y-bot.md). Lo que hace este script es
// dejar todo en una carpeta en el orden exacto de subida: los archivos numerados,
// el caption listo para pegar y la hora sugerida. Cuando exista la app de Meta,
// el publicador por API reemplaza el último paso y todo lo anterior sigue igual.
//
// El portón: si la tanda no está en `aprobada`, acá no pasa nada. Es el mismo
// control que en aprobacion.mjs pero del otro lado, porque este script se puede
// correr solo y "alguien validó antes" no es una garantía.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { SLUG_PIEZA, huellaVisual } from './marca.mjs'
import { validarPieza } from './validar.mjs'
import { escribirTanda, leerTanda, transicionar } from './cola.mjs'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const DIR_PIEZAS = path.join(RAIZ, 'scripts', 'rrss', 'piezas')
const DIR_SALIDA = path.join(RAIZ, 'out', 'rrss')

export function rutaPiezaJson(slug) {
  if (!SLUG_PIEZA.test(slug ?? '')) throw new Error(`Slug de pieza inválido: "${slug}".`)
  return path.join(DIR_PIEZAS, `${slug}.json`)
}

/**
 * Los archivos que el render dejó para una pieza, verificando que correspondan a
 * la pieza COMO ESTÁ AHORA.
 *
 * El control que importa es la huella visual: `render.mjs` la escribe en
 * `publicacion.json` con los campos que deciden los píxeles, y acá se recalcula.
 * Si alguien corrigió un titular o cambió una cifra de una tabla después de
 * renderizar —y pasa, es el ciclo normal de una revisión— los PNG en disco son de
 * la versión anterior y se publicaría la vieja sin que nada avise. La huella hace
 * que eso sea un error y no una sorpresa en el feed.
 */
export function mediosDePieza(pieza) {
  const dir = path.join(DIR_SALIDA, pieza.slug)
  const manifiesto = path.join(dir, 'publicacion.json')
  if (!existsSync(manifiesto))
    throw new Error(`La pieza ${pieza.slug} no está renderizada: falta ${path.relative(RAIZ, manifiesto)}.`)
  const pub = JSON.parse(readFileSync(manifiesto, 'utf8'))
  const esperada = huellaVisual(pieza)
  if (pub.huella_visual !== esperada)
    throw new Error(
      `La pieza ${pieza.slug} cambió después de renderizarse (huella ${pub.huella_visual ?? 'ausente'} ≠ ${esperada}). ` +
        `Volvé a correr: node scripts/rrss/render.mjs scripts/rrss/piezas/${pieza.slug}.json`,
    )
  const archivos = []
  // El video manda cuando existe: un reel se sube como video y las láminas son
  // sus fotogramas de control, no piezas aparte.
  const video = path.join(dir, `${pieza.slug}.mp4`)
  if (existsSync(video)) archivos.push(video)
  else
    for (const rel of pub.laminas ?? []) {
      const abs = path.join(RAIZ, rel)
      if (!existsSync(abs)) throw new Error(`La pieza ${pieza.slug} declara una lámina que no está en disco: ${rel}`)
      archivos.push(abs)
    }
  if (!archivos.length) throw new Error(`La pieza ${pieza.slug} no tiene nada que subir.`)
  return { archivos, dir }
}

/**
 * Arma la carpeta de subida de una tanda aprobada. Devuelve qué quedó dónde para
 * que quien suba (la extensión de Chrome o Juanjo desde el teléfono) no tenga que
 * adivinar el orden.
 */
export function empaquetar(slug) {
  const tanda = leerTanda(slug)
  if (!tanda) throw new Error(`No existe la tanda ${slug}.`)
  if (tanda.estado !== 'aprobada')
    throw new Error(
      `La tanda ${slug} está en "${tanda.estado}". Solo se empaqueta una tanda aprobada: ` +
        'nada se sube sin que Juanjo la haya aprobado.',
    )

  const destino = path.join(DIR_SALIDA, 'tandas', slug)
  rmSync(destino, { recursive: true, force: true })
  mkdirSync(destino, { recursive: true })

  const subidas = []
  tanda.piezas.forEach((entrada, i) => {
    const pieza = JSON.parse(readFileSync(rutaPiezaJson(entrada.pieza), 'utf8'))
    const problemas = validarPieza(pieza)
    if (problemas.length)
      throw new Error(`La pieza ${pieza.slug} ya no pasa los controles de marca:\n   · ${problemas.join('\n   · ')}`)
    const { archivos } = mediosDePieza(pieza)
    const carpeta = path.join(destino, `${String(i + 1).padStart(2, '0')}-${entrada.rol}`)
    mkdirSync(carpeta, { recursive: true })
    const copiados = archivos.map((a, j) => {
      const nombre = `${String(j + 1).padStart(2, '0')}${path.extname(a)}`
      copyFileSync(a, path.join(carpeta, nombre))
      return nombre
    })
    const textoCaption = [pieza.caption, '', (pieza.hashtags ?? []).join(' ')].join('\n').trim()
    writeFileSync(path.join(carpeta, 'caption.txt'), `${textoCaption}\n`)
    subidas.push({
      orden: i + 1,
      rol: entrada.rol,
      pieza: pieza.slug,
      formato: pieza.formato,
      hora_sugerida: entrada.hora_sugerida ?? null,
      carpeta: path.relative(RAIZ, carpeta),
      archivos: copiados,
    })
  })

  writeFileSync(path.join(destino, 'SUBIR.md'), instruccionesDeSubida(tanda, subidas))
  writeFileSync(
    path.join(destino, 'tanda.json'),
    `${JSON.stringify({ slug: tanda.slug, idea: tanda.idea, estado: tanda.estado, subidas }, null, 2)}\n`,
  )
  return { destino: path.relative(RAIZ, destino), subidas }
}

function instruccionesDeSubida(tanda, subidas) {
  const lineas = [
    `# Subir la tanda ${tanda.slug}`,
    '',
    tanda.idea,
    '',
    '> Aprobada por Juanjo. Se sube por navegador con la extensión de Chrome, pieza a pieza,',
    '> en este orden. El caption de cada una está en su carpeta, listo para pegar entero',
    '> (los hashtags van al final del mismo caption, no en un comentario aparte).',
    '',
  ]
  for (const s of subidas) {
    lineas.push(`## ${s.orden}. ${s.rol} — ${s.formato}`)
    lineas.push('')
    lineas.push(`- Pieza: \`${s.pieza}\``)
    lineas.push(`- Archivos, en orden: ${s.archivos.join(', ')}`)
    if (s.hora_sugerida) lineas.push(`- Hora sugerida: ${s.hora_sugerida}`)
    lineas.push(`- Carpeta: \`${s.carpeta}\``)
    lineas.push('')
  }
  lineas.push('## Cuando esté publicado')
  lineas.push('')
  lineas.push('Para poder medir la tanda después hace falta el link de cada publicación:')
  lineas.push('')
  lineas.push('```')
  lineas.push(`node scripts/rrss/publicar.mjs --publicada ${tanda.slug} <link-1> <link-2> ...`)
  lineas.push('```')
  lineas.push('')
  return `${lineas.join('\n')}\n`
}

/**
 * Cierra la tanda con el link de cada publicación. Los links son lo que después
 * permite pedirle las métricas a Instagram; sin ellos la tanda queda publicada y
 * ciega, que es como no haber publicado para efectos de aprender algo.
 */
export function marcarPublicada(slug, links) {
  const tanda = leerTanda(slug)
  if (!tanda) throw new Error(`No existe la tanda ${slug}.`)
  if (links.length !== tanda.piezas.length)
    throw new Error(`La tanda ${slug} tiene ${tanda.piezas.length} piezas y llegaron ${links.length} links.`)
  const piezas = tanda.piezas.map((p, i) => ({ ...p, publicada_en: links[i] }))
  const movida = transicionar({ ...tanda, piezas }, 'publicada', { nota: `${links.length} publicaciones` })
  escribirTanda(movida)
  return movida
}

function main() {
  const args = process.argv.slice(2)
  const iPub = args.indexOf('--publicada')
  if (iPub !== -1) {
    const [slug, ...links] = args.slice(iPub + 1)
    const movida = marcarPublicada(slug, links)
    console.log(`✅ ${slug} → ${movida.estado}`)
    return
  }
  const slug = args[0]
  if (!slug) {
    console.error('Uso: node scripts/rrss/publicar.mjs <tanda>            # empaqueta una tanda aprobada')
    console.error('     node scripts/rrss/publicar.mjs --publicada <tanda> <link>...')
    process.exit(1)
  }
  const { destino, subidas } = empaquetar(slug)
  console.log(`✅ tanda ${slug} empaquetada en ${destino}`)
  subidas.forEach((s) => console.log(`   ${s.orden}. ${s.rol} · ${s.formato} · ${s.archivos.length} archivo(s)`))
  console.log(`   instrucciones: ${path.join(destino, 'SUBIR.md')}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main()
  } catch (e) {
    console.error(`❌ ${e.message}`)
    process.exit(1)
  }
}
