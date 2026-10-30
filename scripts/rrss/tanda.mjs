#!/usr/bin/env node
// Arma la tanda de la semana con piezas ya renderizadas y la manda a aprobar.
//
//   node --env-file=.env.local scripts/rrss/tanda.mjs "La idea de la semana" \
//     --pieza 2026-10-27-anota-todos-ven:central:2026-10-28T19:00:00-03:00 \
//     --pieza 2026-10-27-donde-se-van-los-golpes:derivado
//
// Es el paso que convierte "unos archivos en out/" en algo que se puede aprobar.
// Exige `--revision <archivo>`: el veredicto del agente `revisor-rrss`, que no
// produjo las piezas. Sin eso no manda nada, porque el primer par de ojos frescos
// sobre una pieza no puede ser el de Juanjo.
// Antes de mandar nada verifica que cada pieza exista, pase los controles de marca
// y esté renderizada en su versión actual: una vista previa armada con láminas
// viejas se aprueba igual, y lo que se publica después es otra cosa.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { crearTanda, semanaISO, tandaAbierta } from './cola.mjs'
import { enviarParaAprobacion } from './aprobacion.mjs'
import { sinRutasDeDisco } from './saneado.mjs'
import { framesDeEscena, huellaDelCierre, mediosDePieza, rutaPiezaJson } from './publicar.mjs'
import { huellaEscena } from './escenas.mjs'
import { ENCABEZADO_DE_EXPEDIENTE, huellaDeLoRevisado } from './marca.mjs'
import { motivoNoPublicable, validarPieza } from './validar.mjs'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

/** `slug:rol[:hora]` → la entrada de la tanda. */
export function parsearPieza(texto) {
  const [pieza, rol, ...resto] = String(texto).split(':')
  if (!pieza || !rol) throw new Error(`--pieza mal escrito: "${texto}". Forma: <slug>:<rol>[:<hora ISO>]`)
  const hora = resto.join(':')
  return { pieza, rol, ...(hora ? { hora_sugerida: hora } : {}) }
}

/**
 * Lo que el revisor tuvo delante, en el orden de la tanda: cada pieza con su rol y,
 * si lleva reel, los fotogramas de su toma —que es donde una pieza cambia sin que
 * cambie su JSON—.
 *
 * Se exporta porque el expediente que el revisor lee tiene que sellar EXACTAMENTE lo
 * mismo que este portón va a exigir (`expediente-pieza.mjs` → `leerEntrada`). Con dos
 * versiones del sello, la huella no calzaría nunca y el gate quedaría pidiendo una
 * revisión que ya se hizo.
 */
export function selloDeEntradas(entradas, piezas) {
  return entradas.map((e) => {
    const pieza = piezas[e.pieza]
    return {
      rol: e.rol,
      pieza,
      frames: pieza?.escena != null ? framesDeEscena(pieza.escena) : null,
      // Los fotogramas son los de la captura que está en disco; la huella es la de la
      // escena COMO ESTÁ AHORA. Sin ella, corregir un golpe o el gesto de la escena no
      // mueve el sello: el PUBLICAR de la toma anterior seguiría valiendo para un reel
      // que ya no es el que se revisó.
      escena: pieza?.escena != null ? huellaEscena(pieza.escena) : null,
      // Los últimos segundos del MP4 son la lámina de cierre, y sale de la pieza que
      // nombra la escena —que puede no estar en la tanda—. Sin esto se corrige ese
      // titular, se renderiza, se monta, y el PUBLICAR de ayer sigue valiendo para un
      // reel que termina distinto.
      cierre: pieza?.escena != null ? huellaDelCierre(pieza.escena) : null,
    }
  })
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
    // Una pieza fixture pasa todos los controles de marca (para eso está) y
    // entra a la tanda sin que nada chille. Acá se frena: lo que se manda a
    // aprobar es lo que se va a publicar.
    const noPublicable = motivoNoPublicable(pieza)
    if (noPublicable)
      throw new Error(`La pieza ${e.pieza} no es publicable: ${noPublicable}`)
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

/**
 * Las dos líneas etiquetadas que tiene que traer el veredicto de un revisor.
 *
 * La primera versión de este portón se quedaba con la última línea del archivo que
 * mencionara PUBLICAR o CORREGIR, y el agente escribe su veredicto arriba y los
 * hallazgos abajo: un CORREGIR cuyo último hallazgo dijera "así no se puede
 * publicar" llegaba al portón de Juanjo como PUBLICAR. Un gate que busca una
 * palabra suelta en texto libre falla ABIERTO, que es la única dirección que no se
 * puede permitir. Ahora se exige una línea etiquetada, una sola, más la huella de lo
 * que el revisor tuvo delante.
 */
// Lo que puede venir ANTES de la etiqueta: títulos (`## Veredicto:`), viñetas,
// numeración, cita, negritas y backticks. El agente escribe markdown, y la primera
// versión de esto solo toleraba viñeta y negrita: un `## Veredicto: CORREGIR` no
// contaba como veredicto y, si más abajo el texto reproducía la línea de ejemplo del
// expediente, el único veredicto que el portón veía era un PUBLICAR que nadie escribió.
const PREFIJO_DE_LINEA = '^\\s*(?:(?:#{1,6}|[-*+]|\\d+[.)]|>)\\s*)*[\\s*`_]*'
const LINEA_VEREDICTO = new RegExp(
  PREFIJO_DE_LINEA + 'veredicto[\\s*`_]*:[\\s*`_]*(publicar|corregir)\\b',
  'i',
)
/**
 * Lo que PARECE un veredicto. Si una línea calza acá y no calza en `LINEA_VEREDICTO`,
 * el archivo no se interpreta: se devuelve. Es el único orden seguro —estricto para
 * aceptar, laxo para dudar—, porque un formato que el portón no reconoce es
 * exactamente el camino por el que un CORREGIR pasaba de largo.
 */
const PARECE_VEREDICTO = /veredicto\b.*\b(publicar|corregir)\b/i
/** Los dos veredictos en la misma línea: es el ejemplo del formato, no una decisión. */
const LOS_DOS = /\bpublicar\b.*\bcorregir\b|\bcorregir\b.*\bpublicar\b/i
const LINEA_HUELLA = new RegExp(
  PREFIJO_DE_LINEA + 'huella[\\s*`_]*:[\\s*`_]*([0-9a-f]{6,})\\b',
  'i',
)

const COMO_SE_REVISA =
  '  1. node scripts/rrss/expediente-pieza.mjs --idea "<idea>" --pieza <slug>:<rol> ...\n' +
  '  2. despacha el agente revisor-rrss con ese expediente\n' +
  '  3. guarda su respuesta en un archivo y p\u00e1salo con --revision <archivo>\n' +
  '     (trae una sola l\u00ednea "Veredicto: PUBLICAR" o "Veredicto: CORREGIR", m\u00e1s la "Huella:" del expediente)'

/**
 * El veredicto del revisor independiente, leído del archivo donde quedó archivado.
 *
 * Existe porque el revisor es un agente y su respuesta es texto: sin un artefacto en
 * disco, "ya la revisé" es una afirmación que nadie puede contradecir después. Con
 * el archivo, Juanjo puede leer qué se revisó y con qué criterio, y un CORREGIR no
 * puede llegar a su teléfono disfrazado de tanda lista.
 *
 * `huellaEsperada` ata el veredicto a lo que se va a mandar. Sin eso, el camino que
 * se cuela no necesita mala fe: Juanjo pide un cambio, se corrige el caption, y el
 * mismo archivo del PUBLICAR de ayer alcanza para mandar la tanda de hoy.
 *
 * Todo lo dudoso cae en "no se manda": cero líneas de veredicto, dos, una huella que
 * no calza. Equivocarse hacia "no publicar" cuesta un día; hacia "publicar", la
 * credibilidad de la cuenta.
 */
/**
 * La ruta del veredicto como se puede archivar en una tanda VERSIONADA.
 *
 * `scripts/rrss/tandas/<slug>.json` se commitea y el repo es público. El archivo del
 * veredicto, en cambio, lo escribe quien corre el comando y puede estar en cualquier
 * parte: el scratchpad de una sesión (`C:/Users/<quien sea>/AppData/Local/Temp/...`)
 * o el home de otra máquina. Guardar eso tal cual publica la distribución del disco
 * de quien revisó y el nombre de su usuario, y además no sirve para nada: la ruta es
 * una pista de dónde mirar, no evidencia —la evidencia es el texto, que va completo.
 * De lo que queda afuera del repo se archiva solo el nombre del archivo.
 */
export function rutaArchivable(ruta) {
  const abs = path.resolve(ruta)
  const dentro = path.relative(RAIZ, abs)
  if (dentro.startsWith('..') || path.isAbsolute(dentro)) return path.basename(abs)
  return dentro.split(path.sep).join('/')
}

export function veredictoDeRevision(ruta, huellaEsperada) {
  if (!ruta)
    throw new Error(
      'Falta la revisi\u00f3n independiente. El que produce la pieza no es el que la revisa:\n' +
        COMO_SE_REVISA,
    )
  if (!existsSync(ruta)) throw new Error(`No existe el veredicto del revisor: "${ruta}".`)
  const texto = readFileSync(ruta, 'utf8')
  // El expediente imprime la línea del formato y la huella de su propia tanda, y queda en
  // la carpeta vecina con un nombre parecido: pasado como --revision, el portón lo leía
  // como un PUBLICAR válido. Un tab-complete mandaba la tanda sin que nadie revisara. El
  // archivo que se exige acá es la RESPUESTA del revisor, no lo que el revisor leyó.
  //
  // Se mira la PRIMERA línea y no el texto entero: un revisor que cite el encabezado al
  // decir dónde vio algo escribió un veredicto legítimo, y rechazárselo es un callejón
  // sin salida —el mensaje de más abajo le prohíbe, con razón, editar su respuesta—. Que
  // no lo use además como título se le pide en `.claude/agents/revisor-rrss.md`.
  if (texto.trimStart().startsWith(ENCABEZADO_DE_EXPEDIENTE))
    throw new Error(
      `El archivo "${ruta}" es el EXPEDIENTE de la tanda, no el veredicto del revisor ` +
        '(empieza con el encabezado que arma `expediente-pieza.mjs`). Lo que va acá es la ' +
        'respuesta del agente `revisor-rrss`, guardada tal cual:\n' +
        COMO_SE_REVISA,
    )
  const lineas = texto.split(/\r?\n/)
  const etiquetadas = lineas.filter((l) => LINEA_VEREDICTO.test(l))
  // "Veredicto: PUBLICAR|CORREGIR" matcheaba como PUBLICAR, y esa l\u00ednea estaba
  // impresa como ejemplo del formato: copiarla tal cual alcanzaba para mandar la tanda
  // sin que nadie hubiera decidido nada.
  const ambiguas = etiquetadas.filter((l) => LOS_DOS.test(l))
  if (ambiguas.length)
    throw new Error(
      `El archivo "${ruta}" trae los dos veredictos en la misma l\u00ednea ` +
        `("${ambiguas[0].trim().slice(0, 120)}"). Eso es el formato de ejemplo, no una ` +
        'decisi\u00f3n: deja "Veredicto: PUBLICAR" o "Veredicto: CORREGIR", una sola palabra.',
    )
  const veredictos = etiquetadas.map((l) => LINEA_VEREDICTO.exec(l)[1].toUpperCase())
  if (!veredictos.length)
    throw new Error(
      `El archivo "${ruta}" no trae la l\u00ednea del veredicto. Tiene que decir, en una ` +
        'l\u00ednea propia, "Veredicto: PUBLICAR" o "Veredicto: CORREGIR". Una palabra ' +
        'suelta en el texto no es un veredicto, y sin veredicto no se manda a aprobar.',
    )
  if (veredictos.length > 1)
    throw new Error(
      `El archivo "${ruta}" trae ${veredictos.length} l\u00edneas "Veredicto:" ` +
        `(${veredictos.join(', ')}). Una revisi\u00f3n, un veredicto: deja uno solo.`,
    )
  const [veredicto] = veredictos
  if (veredicto === 'CORREGIR')
    throw new Error(
      `El revisor dijo CORREGIR. Arregla lo que encontr\u00f3 (${ruta}) y vuelve a revisar; ` +
        'la tanda no pasa al port\u00f3n con hallazgos abiertos.',
    )
  // Solo queda vivo el camino del PUBLICAR, as\u00ed que ac\u00e1 se devuelve todo lo que el
  // port\u00f3n no sabe leer: una l\u00ednea que menciona un veredicto fuera del formato
  // exigido puede ser el veredicto de verdad —escrito de otra forma— y desde ac\u00e1 no
  // hay manera de saber que no lo es.
  const sueltas = lineas.filter((l) => !LINEA_VEREDICTO.test(l) && PARECE_VEREDICTO.test(l))
  if (sueltas.length)
    throw new Error(
      `El archivo "${ruta}" trae ${sueltas.length} l\u00ednea(s) que hablan de un veredicto ` +
        `fuera del formato exigido (la primera: "${sueltas[0].trim().slice(0, 120)}"). ` +
        'Mientras eso est\u00e9 ah\u00ed no se puede saber cu\u00e1l es la decisi\u00f3n. No edites ' +
        'su respuesta: el flujo la archiva tal cual porque es la evidencia de que alguien ' +
        'revis\u00f3, y arreglarle el formato a mano es escribir el veredicto por \u00e9l. P\u00eddele ' +
        'al agente que la repita con el formato, una sola l\u00ednea "Veredicto: PUBLICAR" o "Veredicto: CORREGIR".',
    )
  const huellas = [
    ...new Set(
      lineas
        .map((l) => LINEA_HUELLA.exec(l))
        .filter(Boolean)
        .map((m) => m[1].toLowerCase()),
    ),
  ]
  if (!huellas.length)
    throw new Error(
      `El PUBLICAR de "${ruta}" no dice qu\u00e9 revis\u00f3: falta la l\u00ednea ` +
        `"Huella: ${huellaEsperada}", que el expediente imprime para copiar tal cual. ` +
        'Un veredicto sin huella sirve para cualquier versi\u00f3n de la tanda, y entonces ' +
        'no sirve para ninguna.',
    )
  if (huellas.length > 1 || huellas[0] !== huellaEsperada)
    throw new Error(
      `El PUBLICAR de "${ruta}" es de otra versi\u00f3n: revis\u00f3 ${huellas.join(' y ')} y lo ` +
        `que se va a mandar es ${huellaEsperada}. Algo cambi\u00f3 despu\u00e9s de la revisi\u00f3n ` +
        '(el caption, una l\u00e1mina, la toma del reel). Arma el expediente de nuevo y hazlo ' +
        'revisar:\n' +
        COMO_SE_REVISA,
    )
  const saneado = sinRutasDeDisco(texto)
  return {
    veredicto,
    texto: saneado,
    // Se dice siempre, y no solo cuando hubo que sacar algo: leyendo la tanda, `false`
    // es "esto es textual lo que escribió el revisor" y la ausencia del campo no dice
    // nada. La evidencia tiene que saber si se la tocó.
    texto_saneado: saneado !== texto,
    ruta: rutaArchivable(ruta),
    huella: huellaEsperada,
  }
}

export async function armarYEnviar({ idea, entradas, slug = semanaISO(), env = process.env, revision }) {
  // La idea de la semana es el tercer escritor de texto libre que termina en el JSON
  // que se commitea, y el único que no pasaba por acá: la arma `main()` juntando los
  // argumentos sueltos de la línea de comandos, así que trae lo que el agente tenía a
  // mano —"la toma buena es la de C:\Users\…\out\01.png"—. El canario de las tandas
  // recorre TODO string del archivo, así que una idea con una ruta pone rojo el
  // pre-push cuando el texto ya está commiteado y sin salida limpia.
  //
  // Se sanea acá y no en `crearTanda` porque la rama de regeneración de abajo no pasa
  // por ahí. Y solo si es un texto: si no lo es, el error de "la tanda necesita una
  // idea central" lo da `crearTanda` y dice más que un TypeError del saneado.
  const ideaSaneada = typeof idea === 'string' ? sinRutasDeDisco(idea) : idea
  const abierta = tandaAbierta(slug)
  if (abierta && abierta.estado !== 'cambios_pedidos')
    throw new Error(
      `Ya hay una tanda ${slug} en "${abierta.estado}". ` +
        'Una tanda por semana: cierra esa antes de armar otra, o corrige la que está.',
    )
  const { piezas, adjuntos } = prepararEnvio(entradas)
  // Recién ahora el portón propio: una pieza que no pasa los controles de marca da
  // un error más útil que "falta la revisión", y no tiene sentido hacer revisar algo
  // que ninguna máquina dejó pasar todavía. Pero va antes de escribir o mandar nada:
  // el mensaje al teléfono de Juanjo es lo único que no se puede deshacer.
  //
  // La huella sale de las piezas que `prepararEnvio` acaba de leer del disco, no de
  // lo que diga la línea de comandos: lo que se sella es lo que se va a mandar.
  const revisado = veredictoDeRevision(
    revision,
    huellaDeLoRevisado(selloDeEntradas(entradas, piezas)),
  )
  // Una tanda que volvió con cambios se regenera, no se duplica: vuelve a
  // borrador conservando su historial, que es donde está la nota de qué cambiar.
  // `aprobada_por` NO se arrastra: una tanda en borrador no está aprobada por
  // nadie, y ese campo es lo que `SUBIR.md` cita para decir quién dio el visto.
  const base = abierta
    ? (({ aprobada_por: _ignorado, ...resto }) => ({
        ...resto,
        idea: ideaSaneada,
        piezas: entradas,
        estado: 'borrador',
        historial: [
          ...abierta.historial,
          { estado: 'borrador', cuando: new Date().toISOString(), nota: 'regenerada tras los cambios pedidos' },
        ],
      }))(abierta)
    : crearTanda({ slug, idea: ideaSaneada, piezas: entradas })
  base.historial = [
    ...base.historial,
    {
      estado: base.estado,
      cuando: new Date().toISOString(),
      nota: `revisión independiente: ${revisado.veredicto} (huella ${revisado.huella})`,
      // El texto entero: el archivo del veredicto vive fuera de lo versionado y muere
      // con el worktree, y dentro de un mes la pregunta "¿quién dejó pasar esto y con
      // qué criterio?" solo se puede contestar con lo que el revisor escribió. La
      // ruta va saneada (`rutaArchivable`) porque esta tanda se commitea en un repo
      // público y la del veredicto puede ser una carpeta del disco de quien revisó.
      revision: {
        ruta: revisado.ruta,
        huella: revisado.huella,
        texto: revisado.texto,
        texto_saneado: revisado.texto_saneado,
      },
    },
  ]
  const resultado = await enviarParaAprobacion(base, { piezas, adjuntos, env })
  return { ...resultado, piezas }
}

async function main() {
  const args = process.argv.slice(2)
  const entradas = []
  const idea = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--pieza') entradas.push(parsearPieza(args[++i]))
    else if (args[i] === '--slug' || args[i] === '--revision') i++
    else idea.push(args[i])
  }
  const iSlug = args.indexOf('--slug')
  const slug = iSlug === -1 ? semanaISO() : args[iSlug + 1]
  const iRev = args.indexOf('--revision')
  const revision = iRev === -1 ? undefined : args[iRev + 1]
  if (!idea.length || !entradas.length) {
    console.error('Uso: node --env-file=.env.local scripts/rrss/tanda.mjs "<idea>" --pieza <slug>:<rol>[:<hora>] ...')
    console.error(`     roles: central, derivado, story · tanda por defecto: ${semanaISO()}`)
    console.error('     --revision <archivo>: el veredicto del agente revisor-rrss (obligatorio).')
    console.error('       Trae "Veredicto: PUBLICAR" y la "Huella:" que imprime el expediente.')
    process.exit(1)
  }
  const { tanda, canal: c, texto } = await armarYEnviar({ idea: idea.join(' '), entradas, slug, revision })
  console.log(`✅ tanda ${tanda.slug} → ${tanda.estado} (canal: ${c})`)
  if (c === 'telegram') {
    console.log('   Juanjo la tiene en Telegram con los tres botones.')
    console.log('   Para leer su respuesta: node --env-file=.env.local scripts/rrss/aprobacion.mjs')
  } else {
    console.log('   Sin bot configurado: preséntale esto y registra el veredicto con')
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
