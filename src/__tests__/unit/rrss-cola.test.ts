// La cola de RRSS tiene una sola garantía dura: nada llega a publicarse sin que
// Juanjo lo haya aprobado. Todo lo demás del sistema (render, captions, horas) se
// puede corregir después de publicar; eso no.
//
// Por eso lo que se prueba acá no es "los estados existen" sino que NO exista un
// camino de `borrador` a `publicada` sin pasar por `aprobada`, y que el
// empaquetador —que se puede correr suelto desde la terminal— se niegue por su
// cuenta en vez de confiar en que alguien validó antes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const MODULO_COLA = '../../../scripts/rrss/cola.mjs'
const MODULO_APROBACION = '../../../scripts/rrss/aprobacion.mjs'
const MODULO_MARCA = '../../../scripts/rrss/marca.mjs'
const MODULO_TANDA = '../../../scripts/rrss/tanda.mjs'
const MODULO_SANEADO = '../../../scripts/rrss/saneado.mjs'
const MODULO_TELEGRAM = '../../../scripts/rrss/telegram.mjs'

interface EntradaTanda {
  pieza: string
  rol: string
  hora_sugerida?: string
}
interface Tanda {
  slug: string
  idea: string
  estado: string
  piezas: EntradaTanda[]
  historial: Array<{
    estado: string
    cuando: string
    nota: string
    revision?: { ruta: string; huella: string; texto: string; texto_saneado?: boolean }
  }>
  aprobada_por?: string
  // Una tanda lleva además campos que este espejo no nombra —`publicada_en`, la huella de
  // la revisión, el que agregue el próximo que toque el módulo—. Están acá como índice y no
  // uno por uno porque lo que el test afirma de ellos es justamente que no hace falta
  // enumerarlos: `escribirTanda` los sanea igual.
  [campo: string]: unknown
}
type Cola = {
  ESTADOS: string[]
  TRANSICIONES: Record<string, string[]>
  SLUG_TANDA: RegExp
  semanaISO: (f?: Date) => string
  crearTanda: (o: { slug?: string; idea: string; piezas: EntradaTanda[] }) => Tanda
  transicionar: (t: Tanda, nuevo: string, o?: Record<string, unknown>) => Tanda
  escribirTanda: (t: Tanda) => string
  leerTanda: (slug: string) => Tanda | null
  listarTandas: () => Tanda[]
  pendientesDeAprobacion: () => Tanda[]
  tandaAbierta: (slug?: string) => Tanda | null
  esTerminal: (estado: string) => boolean
  rutaTanda: (slug: string) => string
  dirTandas: () => string
}

/**
 * Cada string del JSON de una tanda, con la ruta del campo para el mensaje del error.
 *
 * El canario de las fugas recorre el archivo PARSEADO y no el texto crudo: en el crudo,
 * un salto de línea es un `\` seguido de una `n` y cualquier patrón que incluya el
 * backslash caza ahí. Recorrerlo entero —y no solo los campos que se conocen hoy— es lo
 * que hace que un campo nuevo quede cubierto desde el día en que se agrega.
 */
function* camposDeTexto(valor: unknown, ruta = ''): Generator<[string, string]> {
  if (typeof valor === 'string') yield [ruta, valor]
  else if (Array.isArray(valor))
    for (const [i, v] of valor.entries()) yield* camposDeTexto(v, `${ruta}[${i}]`)
  else if (valor && typeof valor === 'object')
    for (const [k, v] of Object.entries(valor)) yield* camposDeTexto(v, `${ruta}.${k}`)
}

// El scratchpad de una sesión POSIX no tiene letra de unidad ni backslash, y codifica el
// usuario en el nombre de la carpeta (`/tmp/claude/C--Users-<quien sea>-.../`): citada
// sin barras, esa forma encodeada es la única huella que queda.
const TEMPORAL = /\/(?:tmp|var\/folders)\//
// Límite conocido y asumido de este patrón: también marca la prosa que HABLA de la forma
// encodeada ("el scratchpad codifica el usuario como C--Users-…-OneDrive"), que el saneado
// no toca porque ahí no hay nada que sanear. Es previsible que pase: el próximo veredicto
// que revise este mismo archivo lo escribe. Se queda igual, porque es el único patrón que
// ve esa fuga —sin separadores de ruta, el saneado no la distingue de una palabra— y
// porque la salida no cuesta nada: se escribe `<quien sea>` en vez del usuario, que es lo
// que hay que escribir de todos modos en un repo público.
const USUARIO_ENCODEADO = /[-\\/]Users[-\\/]/i
// La cola que el saneado deja cuando la ruta tenía espacios en las carpetas
// (`[ruta local] IA/mis fotos/01.png`): pedirle un separador solo es lo que haría que se
// comiera un "y/o" o un "9/18" de la prosa, así que la red son dos.
const MARCA_CON_COLA = /\[ruta local\][^\n]*?[\\/][^\n]*?[\\/]/

/**
 * Las rutas del disco de quien revisó que quedaron archivadas en una tanda.
 *
 * El control de fondo es el PUNTO FIJO contra la fuente canónica: si al saneado le queda
 * algo que hacer con un texto que ya está archivado, entonces ese texto se archivó sin
 * pasar por él. Preguntárselo a la función en vez de repetir sus patrones acá evita las
 * dos formas de equivocarse, y la segunda ya pasó: un patrón escrito de memoria que no
 * caza la forma real, y uno MÁS ANCHO que el saneado, que pone rojo el verify con una
 * tanda legítima.
 *
 * Los tres patrones de encima no están para cazar lo que el punto fijo ya caza: están
 * para que esta red no dependa de que la fuente canónica siga siendo correcta. Si mañana
 * alguien toca el saneado y deja pasar el scratchpad, el punto fijo se queda ciego y
 * estos siguen viendo. Van LÍNEA POR LÍNEA del texto parseado, nunca sobre el JSON crudo.
 */
// Lo que un canario tiene que decir es qué hacer. El texto ya está commiteado cuando esto
// se pone rojo, así que la salida no es "sanear de nuevo" sino editar la tanda a mano.
const COMO_SALIR =
  'editar ese texto en scripts/rrss/tandas/<slug>.json (nombrar el archivo sin la ruta, y ' +
  '`<quien sea>` donde iba el usuario) y volver a correr el montaje'

/**
 * Las fugas de todos los archivos de una carpeta de tandas, y cuántos textos miró.
 *
 * Recorre la CARPETA y no `listarTandas()`: lo que se audita tiene que ser el archivo que
 * existe, no el que se re-deriva del slug que trae adentro. `listarTandas()` lee todo
 * `*.json` sin mirar el nombre, así que una copia de conflicto de OneDrive
 * (`2026-W44-DESKTOP-ABC.json`) o un `2026-W44.bak.json` con el mismo slug adentro
 * quedaban sin inspeccionar —`rutaTanda(slug)` devuelve siempre el canónico, que se
 * auditaba dos veces—, y con un slug inválido adentro ni eso: `rutaTanda` levanta
 * "Slug inválido" y el canario se caía por el motivo equivocado.
 */
function fugasDeLaCarpeta(dir: string, sinRutasDeDisco: (texto: string) => string) {
  const archivos = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : []
  const fugas: string[] = []
  let camposVistos = 0
  for (const archivo of archivos) {
    const datos: unknown = JSON.parse(readFileSync(path.join(dir, archivo), 'utf8'))
    camposVistos += [...camposDeTexto(datos)].length
    fugas.push(...fugasDeTanda(datos, sinRutasDeDisco).map((f) => `${archivo}${f}`))
  }
  return { fugas, camposVistos }
}

function fugasDeTanda(datos: unknown, sinRutasDeDisco: (texto: string) => string): string[] {
  const fugas: string[] = []
  for (const [campo, valor] of camposDeTexto(datos)) {
    if (sinRutasDeDisco(valor) !== valor)
      fugas.push(`${campo}: al saneado le queda algo que hacer — ${COMO_SALIR}`)
    for (const linea of valor.split('\n')) {
      if (TEMPORAL.test(linea)) fugas.push(`${campo}: carpeta temporal — ${COMO_SALIR}`)
      if (USUARIO_ENCODEADO.test(linea))
        fugas.push(`${campo}: nombre de usuario, o prosa que lo nombra — ${COMO_SALIR}`)
      if (MARCA_CON_COLA.test(linea)) fugas.push(`${campo}: cola de la ruta — ${COMO_SALIR}`)
    }
  }
  return fugas
}

let dirTemporal: string
let dirPiezas: string
let dirSalida: string
let cola: Cola

const CARRUSEL = '2026-10-27-donde-se-van-los-golpes'

const PIEZAS_OK: EntradaTanda[] = [
  { pieza: '2026-10-27-anota-todos-ven', rol: 'central', hora_sugerida: '2026-10-28T19:00:00-03:00' },
  { pieza: CARRUSEL, rol: 'derivado' },
]

beforeEach(async () => {
  dirTemporal = mkdtempSync(path.join(tmpdir(), 'rrss-cola-'))
  dirPiezas = mkdtempSync(path.join(tmpdir(), 'rrss-piezas-'))
  dirSalida = mkdtempSync(path.join(tmpdir(), 'rrss-salida-'))
  vi.stubEnv('RRSS_DIR_TANDAS', dirTemporal)
  // Las piezas y la salida también van a disco propio. Sin el stub de
  // `RRSS_DIR_SALIDA`, un `empaquetar()` de prueba borraba y reescribía
  // out/rrss/tandas/<slug>/ de verdad: el paquete que el operador tenía listo
  // para subir desaparecía a mitad de una corrida de tests, reemplazado por el
  // de un caso de prueba, y sin que nada fallara.
  vi.stubEnv('RRSS_DIR_PIEZAS', dirPiezas)
  vi.stubEnv('RRSS_DIR_SALIDA', dirSalida)
  vi.resetModules()
  cola = (await import(MODULO_COLA)) as unknown as Cola
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  for (const d of [dirTemporal, dirPiezas, dirSalida]) rmSync(d, { recursive: true, force: true })
})

/** Una pieza real del repo, tal cual está en disco. */
function piezaReal(slug: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'scripts', 'rrss', 'piezas', `${slug}.json`), 'utf8'))
}

/**
 * Copia una pieza real al disco temporal para que el empaquetador la lea.
 *
 * Se parte de una pieza de verdad porque tiene que pasar los controles de marca
 * enteros —escribir una a mano acá sería mantener una segunda guía de marca—,
 * pero se copia en vez de leerse en su lugar: así un cambio de contenido del
 * lanzamiento no rompe un test que habla de otra cosa.
 */
function sembrarPieza(slug: string, cambios: Record<string, unknown> = {}): Record<string, unknown> {
  const { publicable: _fixtureDelRepo, ...base } = piezaReal(slug)
  const pieza = { ...base, ...cambios }
  writeFileSync(path.join(dirPiezas, `${slug}.json`), JSON.stringify(pieza))
  return pieza
}

/** Lo que `render.mjs` dejaría en disco para esa pieza, con la huella de ahora. */
async function sembrarRender(pieza: Record<string, unknown>) {
  const { huellaVisual } = (await import(MODULO_MARCA)) as { huellaVisual: (p: unknown) => string }
  const dir = path.join(dirSalida, pieza.slug as string)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, '01.png'), 'png')
  writeFileSync(
    path.join(dir, 'publicacion.json'),
    JSON.stringify({
      slug: pieza.slug,
      laminas: [path.relative(process.cwd(), path.join(dir, '01.png'))],
      huella_visual: huellaVisual(pieza),
    }),
  )
}

/**
 * El veredicto del revisor independiente, que `armarYEnviar` exige para mandar la
 * tanda al teléfono de Juanjo. Acá se siembra ya aprobado: lo que estos casos
 * prueban es otra cosa. El gate en sí tiene sus propios casos en
 * `rrss-expediente.test.ts`.
 *
 * La huella sale de las mismas dos funciones que usa el portón, sobre las piezas que
 * ya están en el disco temporal: un PUBLICAR vale solo para la versión que el revisor
 * tuvo delante, así que una huella inventada sería un veredicto que el gate rechaza
 * con razón —y el test fallaría por el motivo equivocado—.
 *
 * `cuerpo` es lo que el revisor escribió arriba del veredicto. Por defecto no tiene
 * ninguna ruta, y eso dejaba el saneado del texto sin ningún caso que pase por
 * `armarYEnviar`: la función tenía sus pruebas, el cableado no.
 */
async function veredictoSembrado(
  entradas: { pieza: string; rol: string }[] | null,
  cuerpo = 'Sin hallazgos que impidan publicar.',
) {
  const { huellaDeLoRevisado } = await import(MODULO_MARCA)
  const { prepararEnvio, selloDeEntradas } = await import(MODULO_TANDA)
  // `null` es para los casos que fallan ANTES del portón: ahí leer las piezas del
  // disco revienta acá —con el error que el test quiere ver, pero en el lugar
  // equivocado—, así que la huella da igual.
  const huella = entradas
    ? huellaDeLoRevisado(selloDeEntradas(entradas, prepararEnvio(entradas).piezas))
    : '000000000000'
  const ruta = path.join(dirSalida, 'veredicto-de-prueba.md')
  mkdirSync(dirSalida, { recursive: true })
  writeFileSync(ruta, `${cuerpo}\n\nVeredicto: PUBLICAR\nHuella: ${huella}\n`)
  return ruta
}

/**
 * El sello que `enviarParaAprobacion` le pone a una entrada de la tanda.
 *
 * Los tests que arman una tanda a mano lo necesitan entero: desde que el
 * empaquetador exige los tres sellos, una entrada a la que le falta uno se
 * rechaza por eso y no por lo que el test quería probar.
 */
async function selloDe(pieza: Record<string, unknown>) {
  const { huellaTexto, huellaVisual } = await import(MODULO_MARCA)
  const { huellaEscena } = await import('../../../scripts/rrss/escenas.mjs')
  return {
    huella_texto: huellaTexto(pieza),
    huella_visual: huellaVisual(pieza),
    ...(pieza.escena != null ? { huella_escena: huellaEscena(pieza.escena) } : {}),
  }
}

describe('semana ISO (la clave primaria de una tanda)', () => {
  it('usa el año de la semana, no el del día', () => {
    // El 1 de enero de 2027 cae viernes: ISO lo pone en la última semana de 2026.
    // Si la tanda se llamara "2027-W01", la del 28-dic-2026 y la del 1-ene-2027
    // serían dos tandas distintas de la misma semana y las dos se publicarían.
    expect(cola.semanaISO(new Date('2027-01-01T12:00:00Z'))).toBe('2026-W53')
    expect(cola.semanaISO(new Date('2026-12-28T12:00:00Z'))).toBe('2026-W53')
  })

  it('el lunes y el domingo de la misma semana dan la misma tanda', () => {
    expect(cola.semanaISO(new Date('2026-10-26T00:00:00Z'))).toBe(cola.semanaISO(new Date('2026-11-01T23:00:00Z')))
  })

  it('lo que devuelve es un slug válido', () => {
    expect(cola.semanaISO(new Date('2026-01-05T12:00:00Z'))).toMatch(cola.SLUG_TANDA)
    expect(cola.semanaISO(new Date('2026-10-27T12:00:00Z'))).toMatch(cola.SLUG_TANDA)
  })
})

describe('slug de tanda', () => {
  it('rechaza un slug que se saldría de la carpeta', () => {
    // El slug entra en una ruta que el empaquetador borra con rm -r.
    for (const malo of ['../../etc', '2026-W44/..', 'x', '2026-44', '']) {
      expect(() => cola.rutaTanda(malo)).toThrow(/inválido/i)
    }
  })
})

describe('crear una tanda', () => {
  it('no se puede crear sin idea: la idea es lo que se aprueba', () => {
    expect(() => cola.crearTanda({ idea: '   ', piezas: PIEZAS_OK })).toThrow(/idea/i)
  })

  it('no se puede crear sin pieza central', () => {
    expect(() =>
      cola.crearTanda({ idea: 'x', piezas: [{ pieza: '2026-10-27-a', rol: 'derivado' }] }),
    ).toThrow(/central/i)
  })

  it('rechaza un rol inventado', () => {
    expect(() => cola.crearTanda({ idea: 'x', piezas: [{ pieza: '2026-10-27-a', rol: 'reel' }] })).toThrow(/rol/i)
  })

  it('nace en borrador y con historial', () => {
    const t = cola.crearTanda({ slug: '2026-W44', idea: 'La idea', piezas: PIEZAS_OK })
    expect(t.estado).toBe('borrador')
    expect(t.historial).toHaveLength(1)
  })

  it('guarda referencias a las piezas, no copias de su texto', () => {
    // Si la tanda guardara el caption, corregirlo en la pieza dejaría la tanda
    // con el viejo y se publicaría ese, sin que nada avise.
    const t = cola.crearTanda({ slug: '2026-W44', idea: 'La idea', piezas: PIEZAS_OK })
    expect(JSON.stringify(t.piezas)).not.toMatch(/caption|hashtag/i)
  })
})

describe('máquina de estados: el portón de la aprobación', () => {
  const borrador = () => cola.crearTanda({ slug: '2026-W44', idea: 'La idea', piezas: PIEZAS_OK })

  it('NO hay camino a publicada que no pase por aprobada', () => {
    // Esta es la garantía del sistema. Se prueba recorriendo el grafo completo, no
    // afirmando una transición suelta: una transición nueva mal agregada en
    // TRANSICIONES tiene que hacer fallar este test, aunque nadie se acuerde de
    // venir a actualizarlo.
    const alcanzables = (desde: string, visitados = new Set<string>()): Set<string> => {
      for (const siguiente of cola.TRANSICIONES[desde] ?? []) {
        if (visitados.has(siguiente)) continue
        visitados.add(siguiente)
        alcanzables(siguiente, visitados)
      }
      return visitados
    }
    const sinAprobada = Object.fromEntries(
      Object.entries(cola.TRANSICIONES).map(([k, v]) => [k, v.filter((e) => e !== 'aprobada')]),
    )
    const alcanzablesSinAprobada = (desde: string, visitados = new Set<string>()): Set<string> => {
      for (const siguiente of sinAprobada[desde] ?? []) {
        if (visitados.has(siguiente)) continue
        visitados.add(siguiente)
        alcanzablesSinAprobada(siguiente, visitados)
      }
      return visitados
    }
    expect(alcanzables('borrador')).toContain('publicada') // existe el camino bueno
    expect([...alcanzablesSinAprobada('borrador')]).not.toContain('publicada')
  })

  it('cada estado de ESTADOS está en TRANSICIONES y al revés', () => {
    expect(Object.keys(cola.TRANSICIONES).sort()).toEqual([...cola.ESTADOS].sort())
    for (const destinos of Object.values(cola.TRANSICIONES))
      for (const d of destinos) expect(cola.ESTADOS).toContain(d)
  })

  it('un borrador no se puede publicar de una', () => {
    expect(() => cola.transicionar(borrador(), 'publicada')).toThrow(/no puede pasar/i)
  })

  it('una tanda publicada es terminal: no se re-publica ni se re-aprueba', () => {
    const publicada = cola.transicionar(
      cola.transicionar(cola.transicionar(borrador(), 'en_revision'), 'aprobada'),
      'publicada',
    )
    expect(() => cola.transicionar(publicada, 'publicada')).toThrow(/terminal/i)
    expect(() => cola.transicionar(publicada, 'aprobada')).toThrow(/terminal/i)
  })

  it('aprobar dos veces la misma tanda falla', () => {
    // Es lo que protege de un toque de botón leído dos veces en Telegram cuando se
    // pierde el marcador de offset.
    const aprobada = cola.transicionar(cola.transicionar(borrador(), 'en_revision'), 'aprobada')
    expect(() => cola.transicionar(aprobada, 'aprobada')).toThrow(/no puede pasar/i)
  })

  it('"cambios_pedidos" sin nota no existe', () => {
    const enRevision = cola.transicionar(borrador(), 'en_revision')
    expect(() => cola.transicionar(enRevision, 'cambios_pedidos')).toThrow(/nota/i)
    expect(cola.transicionar(enRevision, 'cambios_pedidos', { nota: 'cambiá el gancho' }).estado).toBe(
      'cambios_pedidos',
    )
  })

  it('no muta la tanda que recibe', () => {
    const t = borrador()
    cola.transicionar(t, 'en_revision')
    expect(t.estado).toBe('borrador')
    expect(t.historial).toHaveLength(1)
  })

  it('rechaza un estado inventado', () => {
    expect(() => cola.transicionar(borrador(), 'casi_aprobada')).toThrow(/desconocido/i)
  })
})

describe('la cola en disco', () => {
  it('escribe, lee y lista', () => {
    cola.escribirTanda(cola.crearTanda({ slug: '2026-W44', idea: 'A', piezas: PIEZAS_OK }))
    cola.escribirTanda(cola.crearTanda({ slug: '2026-W45', idea: 'B', piezas: PIEZAS_OK }))
    expect(cola.leerTanda('2026-W44')?.idea).toBe('A')
    expect(cola.listarTandas().map((t) => t.slug)).toEqual(['2026-W45', '2026-W44']) // la más nueva primero
    expect(cola.leerTanda('2026-W01')).toBeNull()
  })

  it('pendientesDeAprobacion trae solo las que esperan veredicto', () => {
    cola.escribirTanda(cola.crearTanda({ slug: '2026-W44', idea: 'A', piezas: PIEZAS_OK }))
    cola.escribirTanda(
      cola.transicionar(cola.crearTanda({ slug: '2026-W45', idea: 'B', piezas: PIEZAS_OK }), 'en_revision'),
    )
    expect(cola.pendientesDeAprobacion().map((t) => t.slug)).toEqual(['2026-W45'])
  })

  it('tandaAbierta ignora las cerradas', () => {
    cola.escribirTanda(
      cola.transicionar(cola.crearTanda({ slug: '2026-W44', idea: 'A', piezas: PIEZAS_OK }), 'rechazada'),
    )
    expect(cola.tandaAbierta('2026-W44')).toBeNull()
  })
})

describe('registrar un veredicto', () => {
  it('aprobar deja constancia de quién aprobó', async () => {
    const { registrarVeredicto } = await import(MODULO_APROBACION)
    cola.escribirTanda(
      cola.transicionar(cola.crearTanda({ slug: '2026-W44', idea: 'A', piezas: PIEZAS_OK }), 'en_revision'),
    )
    const t = registrarVeredicto('2026-W44', 'aprobar', { quien: 'juanjo' })
    expect(t.estado).toBe('aprobada')
    expect(t.aprobada_por).toBe('juanjo')
    expect(cola.leerTanda('2026-W44')?.estado).toBe('aprobada') // quedó en disco
  })

  it('la nota se archiva sin la ruta del disco de quien la escribió', async () => {
    // La nota la escribe Juanjo en el teléfono —"cambia la lámina de C:\Users\...\01.png"—
    // y queda en `scripts/rrss/tandas/<slug>.json`, que se commitea en un repo PÚBLICO.
    // Se saneaba el veredicto del revisor y no la nota: entraba cruda, y el canario la
    // cazaba recién en el push, con el texto ya commiteado y sin salida limpia. Se sanea
    // en `registrarVeredicto`, que es por donde pasan los dos canales —el botón de
    // Telegram y la línea de comandos—, para que no haya un llamador que se olvide.
    const { registrarVeredicto } = await import(MODULO_APROBACION)
    cola.escribirTanda(
      cola.transicionar(cola.crearTanda({ slug: '2026-W44', idea: 'A', piezas: PIEZAS_OK }), 'en_revision'),
    )
    const t = registrarVeredicto('2026-W44', 'cambios', {
      nota: 'cambia la lámina de C:\\Users\\juan.perez\\out\\rrss\\01.png, quedó cortada',
    })
    expect(t.historial.at(-1)?.nota).toBe('cambia la lámina de 01.png, quedó cortada')
    expect(cola.leerTanda('2026-W44')?.historial.at(-1)?.nota).not.toContain('juan.perez')
  })

  it('rechazar NO escribe quién la aprobó', async () => {
    // `aprobada_por` es el único registro de quién dio el visto bueno y es lo que
    // cita SUBIR.md. Escribirlo en cualquier veredicto dejaba una tanda
    // RECHAZADA diciendo que Juanjo la aprobó.
    const { registrarVeredicto } = await import(MODULO_APROBACION)
    for (const [veredicto, destino] of [
      ['rechazar', 'rechazada'],
      ['cambios', 'cambios_pedidos'],
    ] as const) {
      cola.escribirTanda(
        cola.transicionar(cola.crearTanda({ slug: '2026-W44', idea: 'A', piezas: PIEZAS_OK }), 'en_revision'),
      )
      const t = registrarVeredicto('2026-W44', veredicto, { quien: 'juanjo', nota: 'no me gusta' })
      expect(t.estado).toBe(destino)
      expect(t.aprobada_por, veredicto).toBeUndefined()
    }
  })

  it('rechaza un veredicto que no existe', async () => {
    const { registrarVeredicto } = await import(MODULO_APROBACION)
    cola.escribirTanda(cola.crearTanda({ slug: '2026-W44', idea: 'A', piezas: PIEZAS_OK }))
    expect(() => registrarVeredicto('2026-W44', 'quizas')).toThrow(/desconocido/i)
  })

  it('el canal es "chat" cuando no hay credenciales del bot', async () => {
    const { canal } = await import(MODULO_APROBACION)
    expect(canal({})).toBe('chat')
    expect(canal({ RRSS_TELEGRAM_BOT_TOKEN: 'x', RRSS_TELEGRAM_CHAT_ID: '1' })).toBe('telegram')
    // Media credencial no alcanza: mandar a un chat sin id es mandar a nadie.
    expect(canal({ RRSS_TELEGRAM_BOT_TOKEN: 'x' })).toBe('chat')
  })

  it('la vista previa lleva el caption completo', async () => {
    const { resumenDeTanda } = await import(MODULO_APROBACION)
    const tanda = cola.crearTanda({ slug: '2026-W44', idea: 'La idea de la semana', piezas: PIEZAS_OK })
    const texto = resumenDeTanda(
      tanda,
      {
        '2026-10-27-anota-todos-ven': { formato: 'reel', caption: 'Anota. Todos ven lo mismo.', hashtags: ['#golfchile'] },
      },
      { formato: 'plano' },
    )
    // Sin el caption en la vista previa hay que abrir archivos para aprobar, y una
    // aprobación que cuesta trabajo se posterga.
    expect(texto).toContain('Anota. Todos ven lo mismo.')
    expect(texto).toContain('#golfchile')
    expect(texto).toContain('La idea de la semana')
    expect(texto).toContain('2026-10-28T19:00:00-03:00')
  })

  it('un caption con "<5 sobre par" no tumba la vista previa', async () => {
    const { resumenDeTanda } = await import(MODULO_APROBACION)
    // El mensaje va con `parse_mode: HTML` y el contenido se interpolaba crudo. En golf
    // se escribe "<5 sobre par" y "<90 golpes" todo el tiempo: Telegram ve una etiqueta
    // que no entiende, contesta `can't parse entities` y la vista previa NO llega. El
    // portón se cae en silencio justo cuando hay algo que aprobar, y el caption lo
    // escribe un modelo: esto no es un borde, es el lunes que viene.
    const tanda = cola.crearTanda({
      slug: '2026-W44',
      idea: 'Augusta & los pares 3',
      piezas: PIEZAS_OK,
    })
    const piezas = {
      '2026-10-27-anota-todos-ven': {
        formato: 'reel',
        caption: 'Si tiras <5 sobre par, mira esto. Scramble & best ball.',
        hashtags: ['#golfchile'],
      },
    }
    const texto = resumenDeTanda(tanda, piezas, { formato: 'html' })
    // Las únicas etiquetas que quedan son las `<b>` que pone el armador.
    const etiquetas = [...texto.matchAll(/<(\/?[A-Za-z][\w-]*)/g)].map((m) => m[1])
    expect([...new Set(etiquetas)].sort()).toEqual(['/b', 'b'])
    // Ni un `<` suelto ni un `&` sin entidad: eso es lo que Telegram rechaza.
    expect(texto).not.toMatch(/<(?![/A-Za-z])/)
    expect(texto).not.toMatch(/&(?!(?:amp|lt|gt|quot|#\d+);)/)
    // Y el criterio se lee igual: lo que cambia es cómo viaja, no qué dice.
    expect(texto).toContain('Si tiras &lt;5 sobre par, mira esto. Scramble &amp; best ball.')
    expect(texto).toContain('Augusta &amp; los pares 3')
    // El default es el modo que se cae en silencio si se olvida.
    expect(resumenDeTanda(tanda, piezas)).toBe(texto)
  })

  it('en la consola el caption se lee como se va a publicar, sin entidades', async () => {
    const { resumenDeTanda } = await import(MODULO_APROBACION)
    // Este resumen va a dos lados: a Telegram, que lo interpreta como HTML, y a la
    // consola cuando no hay bot configurado —el camino por el que pasa una tanda antes de
    // que el token esté puesto—. Escapar dentro del compositor servía para Telegram y
    // arruinaba el otro: en la consola se leía `Scramble &amp; best ball`, o sea un
    // caption que no es el que se va a publicar, en la pantalla donde se aprueba.
    const tanda = cola.crearTanda({
      slug: '2026-W44',
      idea: 'Augusta & los pares 3',
      piezas: PIEZAS_OK,
    })
    const texto = resumenDeTanda(
      tanda,
      {
        '2026-10-27-anota-todos-ven': {
          formato: 'reel',
          caption: 'Si tiras <5 sobre par, mira esto. Scramble & best ball.',
          hashtags: ['#golfchile'],
        },
      },
      { formato: 'plano' },
    )
    expect(texto).toContain('Si tiras <5 sobre par, mira esto. Scramble & best ball.')
    expect(texto).toContain('Augusta & los pares 3')
    // Ni una entidad ni una etiqueta: en la consola `<b>` se lee como basura.
    expect(texto).not.toMatch(/&(?:amp|lt|gt);/)
    expect(texto).not.toMatch(/<\/?b>/)
  })

  it('el pie de un adjunto se escapa en el envío', async () => {
    const { escaparHtml } = await import(MODULO_TELEGRAM)
    // `mandarArchivo` escapa el pie adentro porque un pie es siempre texto plano, nunca
    // HTML armado. Sin eso, un pie con `&` o `<` tumba la foto y la aprobación se queda
    // sin la lámina que hay que mirar.
    expect(escaparHtml('CENTRAL · Scramble & best ball <reel>')).toBe(
      'CENTRAL · Scramble &amp; best ball &lt;reel&gt;',
    )
    // Y no toca las comillas, que en un caption se leen mejor como comillas.
    expect(escaparHtml('el "mejor" hoyo')).toBe('el "mejor" hoyo')
  })
})

describe('lo que se aprueba es lo que se sube', () => {
  const PIEZA = {
    slug: '2026-10-27-anota-todos-ven',
    formato: 'story',
    caption: 'Uno anota. Todos ven lo mismo.',
    hashtags: ['#golfchile'],
  }

  it('la huella del texto cambia con el caption y con los hashtags, y no con las láminas', async () => {
    const { huellaTexto } = await import(MODULO_MARCA)
    const base = { ...PIEZA, laminas: [{ plantilla: 'cierre', titular: 'A' }] }
    expect(huellaTexto({ ...base, caption: 'otra cosa' })).not.toBe(huellaTexto(base))
    expect(huellaTexto({ ...base, hashtags: ['#otro'] })).not.toBe(huellaTexto(base))
    // Lo visual tiene su propia huella: renderizar de nuevo no invalida una
    // aprobación de texto, y corregir el texto no obliga a renderizar.
    expect(huellaTexto({ ...base, laminas: [{ plantilla: 'cierre', titular: 'B' }] })).toBe(huellaTexto(base))
  })

  it('mandar a aprobar sella todo lo que se mostró: el texto, lo visual y la escena', async () => {
    const { enviarParaAprobacion } = await import(MODULO_APROBACION)
    const { huellaTexto, huellaVisual } = await import(MODULO_MARCA)
    const { huellaEscena } = await import('../../../scripts/rrss/escenas.mjs')
    const REEL = { ...PIEZA, escena: 'anota-todos-ven', rotulo: 'R', laminas: [{ plantilla: 'cierre' }] }
    const tanda = cola.crearTanda({ slug: '2026-W44', idea: 'A', piezas: PIEZAS_OK })
    const { tanda: enRevision, texto } = await enviarParaAprobacion(tanda, {
      piezas: { [REEL.slug]: REEL },
      env: {},
    })
    const sellada = enRevision.piezas.find((p: EntradaTanda) => p.pieza === REEL.slug) as EntradaTanda &
      Record<string, string | undefined>
    expect(sellada.huella_texto).toBe(huellaTexto(REEL))
    // Lo visual tiene su propio sello: sin él, corregir un rótulo y volver a
    // renderizar pasaba entero por un control que solo miraba el caption.
    expect(sellada.huella_visual).toBe(huellaVisual(REEL))
    expect(sellada.huella_escena).toBe(huellaEscena(REEL.escena))
    // Y lo sellado es lo que se mostró, no otra cosa.
    expect(texto).toContain(PIEZA.caption)
  })

  it('una pieza sin escena no inventa un sello de escena', async () => {
    // `huellaEscena` revienta con una escena que no existe: si se sellara
    // siempre, mandar a aprobar un carrusel tiraría un error que no tiene nada
    // que ver con el carrusel.
    const { enviarParaAprobacion } = await import(MODULO_APROBACION)
    const tanda = cola.crearTanda({ slug: '2026-W44', idea: 'A', piezas: PIEZAS_OK })
    const { tanda: enRevision } = await enviarParaAprobacion(tanda, { piezas: { [PIEZA.slug]: PIEZA }, env: {} })
    const sellada = enRevision.piezas.find((p: EntradaTanda) => p.pieza === PIEZA.slug) as EntradaTanda &
      Record<string, string | undefined>
    expect(sellada).not.toHaveProperty('huella_escena')
  })

  it('empaquetar se niega si el caption cambió después de aprobarse', async () => {
    // Se aprueba el martes con el caption A; el miércoles alguien arregla una
    // coma; el jueves el paquete sale con el caption B bajo un SUBIR.md que dice
    // "Aprobada por Juanjo". Nadie miente y nadie se entera.
    const { empaquetar } = await import('../../../scripts/rrss/publicar.mjs')
    const pieza = sembrarPieza(CARRUSEL)
    await sembrarRender(pieza)
    const base = cola.crearTanda({
      slug: '2026-W44',
      idea: 'A',
      piezas: [
        { pieza: CARRUSEL, rol: 'central', ...(await selloDe(pieza)), huella_texto: '0000000000000000' } as EntradaTanda,
      ],
    })
    cola.escribirTanda({ ...cola.transicionar(base, 'en_revision'), estado: 'aprobada', aprobada_por: 'juanjo' })
    expect(() => empaquetar('2026-W44')).toThrow(/caption[\s\S]*cambió después de aprobarse/i)
  })

  it('con la huella correcta el paquete se arma entero', async () => {
    // El control negativo: si se negara siempre, el test de arriba no probaría
    // nada. Y se exige el camino completo —no solo "no se queja del caption"—
    // porque un empaquetado que revienta por cualquier otra razón también
    // cumpliría con eso.
    const { empaquetar } = await import('../../../scripts/rrss/publicar.mjs')
    const pieza = sembrarPieza(CARRUSEL)
    await sembrarRender(pieza)
    const base = cola.crearTanda({
      slug: '2026-W44',
      idea: 'A',
      piezas: [{ pieza: CARRUSEL, rol: 'central', ...(await selloDe(pieza)) } as EntradaTanda],
    })
    cola.escribirTanda({ ...cola.transicionar(base, 'en_revision'), estado: 'aprobada', aprobada_por: 'juanjo' })
    const { subidas } = empaquetar('2026-W44')
    expect(subidas).toHaveLength(1)
    expect(readFileSync(path.join(dirSalida, 'tandas', '2026-W44', '01-central', 'caption.txt'), 'utf8')).toContain(
      pieza.caption as string,
    )
  })

  it('el paquete lo firma quien aprobó, y una tanda sin firma no se empaqueta', async () => {
    // SUBIR.md encabeza con "Aprobada por <nombre>", y ese nombre estaba escrito
    // a mano: una tanda sin `aprobada_por` salía igual, firmada por alguien que
    // no la había visto.
    const { empaquetar } = await import('../../../scripts/rrss/publicar.mjs')
    const pieza = sembrarPieza(CARRUSEL)
    await sembrarRender(pieza)
    const base = cola.crearTanda({
      slug: '2026-W44',
      idea: 'A',
      piezas: [{ pieza: CARRUSEL, rol: 'central', ...(await selloDe(pieza)) } as EntradaTanda],
    })
    const enRevision = cola.transicionar(base, 'en_revision')
    cola.escribirTanda({ ...enRevision, estado: 'aprobada' })
    expect(() => empaquetar('2026-W44')).toThrow(/no registra quién la aprobó/i)

    cola.escribirTanda({ ...enRevision, estado: 'aprobada', aprobada_por: 'max' })
    empaquetar('2026-W44')
    const subir = readFileSync(path.join(dirSalida, 'tandas', '2026-W44', 'SUBIR.md'), 'utf8')
    expect(subir).toContain('Aprobada por max')
    // Y encabeza con el DESTINO en Instagram, no con la medida del lienzo:
    // "story" ahí arriba hace que el reel del lanzamiento se suba como
    // historia y desaparezca en 24 h.
    expect(subir).toMatch(/## 1\. central — carrusel del feed/)
    expect(subir).toMatch(/- Formato: carrusel/)
  })

  it('una pieza que el plan descartó no entra a una tanda ni al paquete', async () => {
    // Hay piezas que existen para ejercitar el motor y que el plan descartó como
    // contenido. Pasan todos los controles de marca —esa es su función— y una ya
    // había entrado a la tanda del lanzamiento con hora sugerida. La única señal
    // era una frase en `proposito`, que no lee ninguna máquina.
    const { empaquetar } = await import('../../../scripts/rrss/publicar.mjs')
    const { armarYEnviar } = await import('../../../scripts/rrss/tanda.mjs')
    const pieza = sembrarPieza(CARRUSEL, {
      publicable: false,
      proposito: 'fixture del motor',
    })
    await sembrarRender(pieza)

    // Con la revisión ya aprobada: el control de la pieza no depende de ella, y el
    // error que sale es el específico ("no es publicable"), no "falta la revisión".
    // Hacer revisar una pieza que ninguna máquina dejó pasar es gastar un revisor.
    await expect(
      armarYEnviar({
        idea: 'A',
        entradas: [{ pieza: CARRUSEL, rol: 'central' }],
        slug: '2026-W44',
        env: { NODE_ENV: 'test' },
        revision: await veredictoSembrado(null),
      }),
    ).rejects.toThrow(/no es publicable[\s\S]*fixture del motor/i)

    // Y del otro lado: una tanda guardada antes de que el control existiera
    // sigue en disco con la pieza adentro, y el empaquetador no la vuelve a
    // armar, solo la lee.
    const base = cola.crearTanda({
      slug: '2026-W44',
      idea: 'A',
      piezas: [{ pieza: CARRUSEL, rol: 'central', ...(await selloDe(pieza)) } as EntradaTanda],
    })
    cola.escribirTanda({ ...cola.transicionar(base, 'en_revision'), estado: 'aprobada', aprobada_por: 'juanjo' })
    expect(() => empaquetar('2026-W44')).toThrow(/no es publicable/i)
  })

  it('sellar solo el texto dejaba pasar una lámina corregida después de aprobarse', async () => {
    // El agujero que dejó abierto el sello de texto: se corrige algo que NO es
    // el caption —un rótulo, el titular de una lámina— y se vuelve a
    // renderizar. La pieza y su `publicacion.json` se mueven JUNTOS, así que el
    // control de "render al día" calza; el caption no se tocó, así que el de
    // texto tampoco chilla. El paquete salía con una lámina que nadie aprobó,
    // bajo un SUBIR.md que dice "Aprobada por Juanjo".
    const { empaquetar } = await import('../../../scripts/rrss/publicar.mjs')
    const { huellaTexto } = await import(MODULO_MARCA)
    const pieza = sembrarPieza(CARRUSEL)
    await sembrarRender(pieza)
    const sello = await selloDe(pieza)
    const base = cola.crearTanda({
      slug: '2026-W44',
      idea: 'A',
      piezas: [{ pieza: CARRUSEL, rol: 'central', ...sello } as EntradaTanda],
    })
    cola.escribirTanda({ ...cola.transicionar(base, 'en_revision'), estado: 'aprobada', aprobada_por: 'juanjo' })
    empaquetar('2026-W44') // control: con todo al día, el paquete sale

    const corregida = sembrarPieza(CARRUSEL, { rotulo: `${pieza.rotulo} (corregido)` })
    await sembrarRender(corregida)
    // Lo que cambió no es el texto: el sello viejo sigue calzando ahí.
    expect(huellaTexto(corregida)).toBe(sello.huella_texto)
    expect(() => empaquetar('2026-W44')).toThrow(/lo visual[\s\S]*cambió después de aprobarse/i)
  })

  it('un sello que falta no pasa por un sello que calza', async () => {
    // La versión fail-open del control: `if (sellado !== undefined && ...)`.
    // Una entrada agregada a mano al JSON de la tanda no trae sellos, y
    // entonces era la única que no se verificaba —justo la sospechosa—.
    const { empaquetar } = await import('../../../scripts/rrss/publicar.mjs')
    const pieza = sembrarPieza(CARRUSEL)
    await sembrarRender(pieza)
    const sello = await selloDe(pieza)
    for (const campo of ['huella_texto', 'huella_visual'] as const) {
      const { [campo]: _sinEste, ...resto } = sello
      const base = cola.crearTanda({
        slug: '2026-W44',
        idea: 'A',
        piezas: [{ pieza: CARRUSEL, rol: 'central', ...resto } as EntradaTanda],
      })
      cola.escribirTanda({ ...cola.transicionar(base, 'en_revision'), estado: 'aprobada', aprobada_por: 'juanjo' })
      expect(() => empaquetar('2026-W44'), campo).toThrow(new RegExp(`falta el sello[\\s\\S]*${campo}`, 'i'))
    }
  })

  it('un sello que la pieza ya no necesita no se queda sin comparar', async () => {
    // Si el set de sellos a verificar saliera de la pieza, el archivo vigilado
    // decidiría qué se vigila: una pieza aprobada como reel que pierde el campo
    // `escena` deja su `huella_escena` sellada y sin comparar, las otras dos
    // calzan (ninguna cubre `escena`) y se empaqueta la lámina de cierre sola.
    // Ese es el bug original del reel, por la puerta de atrás.
    const { problemasDeSello } = await import('../../../scripts/rrss/publicar.mjs')
    const pieza = sembrarPieza(CARRUSEL)
    const sello = await selloDe(pieza)
    expect(problemasDeSello(sello, pieza)).toEqual([])
    expect(problemasDeSello({ ...sello, huella_escena: 'a0a0a0a0a0a0a0a0' }, pieza)).toEqual([
      expect.stringMatching(/la escena del reel[\s\S]*ya no lo tiene/i),
    ])
  })

  it('un empaquetado que se niega deja intacto el paquete anterior', async () => {
    // `empaquetar` borra la carpeta de destino entera antes de llenarla. Si los
    // controles corrieran después de ese `rmSync`, un empaquetado que se niega
    // dejaría a Juanjo sin el paquete que YA tenía listo para subir: el error se
    // lee en la terminal, la carpeta vacía se descubre con el teléfono en la mano.
    const { empaquetar } = await import('../../../scripts/rrss/publicar.mjs')
    const pieza = sembrarPieza(CARRUSEL)
    await sembrarRender(pieza)
    const base = cola.crearTanda({
      slug: '2026-W44',
      idea: 'A',
      piezas: [{ pieza: CARRUSEL, rol: 'central', ...(await selloDe(pieza)) } as EntradaTanda],
    })
    cola.escribirTanda({ ...cola.transicionar(base, 'en_revision'), estado: 'aprobada', aprobada_por: 'juanjo' })
    empaquetar('2026-W44')
    const subir = path.join(dirSalida, 'tandas', '2026-W44', 'SUBIR.md')
    const antes = readFileSync(subir, 'utf8')

    sembrarPieza(CARRUSEL, { caption: `${pieza.caption}\n\nY una línea más que nadie aprobó.` })
    expect(() => empaquetar('2026-W44')).toThrow(/cambió después de aprobarse/i)
    expect(readFileSync(subir, 'utf8')).toBe(antes)
  })


  it('una tanda regenerada no arrastra quién la había aprobado', async () => {
    // Una tanda que volvió con cambios vuelve a `borrador`, y en borrador no está
    // aprobada por nadie: `aprobada_por` es lo que SUBIR.md cita como visto bueno.
    const { armarYEnviar } = await import('../../../scripts/rrss/tanda.mjs')
    const SOLO_CARRUSEL = [{ pieza: CARRUSEL, rol: 'central' }]
    // `armarYEnviar` verifica el render de cada pieza contra su JSON, así que las
    // dos cosas van al disco temporal.
    await sembrarRender(sembrarPieza(CARRUSEL))
    cola.escribirTanda({
      ...cola.crearTanda({ slug: '2026-W44', idea: 'A', piezas: SOLO_CARRUSEL }),
      estado: 'cambios_pedidos',
      aprobada_por: 'juanjo',
      historial: [{ estado: 'cambios_pedidos', cuando: new Date().toISOString(), nota: 'cambia el titular' }],
    })
    const { tanda } = await armarYEnviar({
      idea: 'A corregida',
      entradas: SOLO_CARRUSEL,
      slug: '2026-W44',
      env: { NODE_ENV: 'test' },
      revision: await veredictoSembrado(SOLO_CARRUSEL),
    })
    expect(tanda.estado).toBe('en_revision')
    expect(tanda.aprobada_por).toBeUndefined()
  })

  it('la tanda que queda en disco no lleva el disco de quien revisó', async () => {
    // Los casos de `sinRutasDeDisco` prueban la función; este prueba el CABLEADO, que es
    // otra cosa: que el JSON que se commitea —no el objeto que devuelve `armarYEnviar`—
    // sea el saneado. Sin esto, el único respaldo era el canario de las tandas
    // versionadas, y hoy no hay ninguna tanda con veredicto archivado: no discrimina
    // nada, y cuando discrimine va a ser después de haber commiteado la fuga.
    const { armarYEnviar } = await import('../../../scripts/rrss/tanda.mjs')
    const SOLO_CARRUSEL = [{ pieza: CARRUSEL, rol: 'central' }]
    await sembrarRender(sembrarPieza(CARRUSEL))
    // La forma real: `C:\Users\<quien sea>\OneDrive\Escritorio\Proyectos IA\tu-golf\...`,
    // con el espacio que parte la ruta en dos y hace falta la tercera pasada.
    const local = String.raw`C:\Users\quiensea\OneDrive\Escritorio\Proyectos IA\tu-golf\out\01.png`
    await armarYEnviar({
      idea: 'A',
      entradas: SOLO_CARRUSEL,
      slug: '2026-W44',
      env: { NODE_ENV: 'test' },
      revision: await veredictoSembrado(SOLO_CARRUSEL, `- P2: va cortada la lámina ${local}.`),
    })
    const crudo = readFileSync(cola.rutaTanda('2026-W44'), 'utf8')
    expect(crudo).not.toMatch(/quiensea/)
    expect(crudo).not.toMatch(/tu-golf/)
    // Un backslash en el JSON escrito es una ruta de Windows que se escapó: en el texto
    // de un revisor chileno no hay otra cosa que lo lleve.
    expect(crudo).not.toMatch(/\\\\/)
    const json = JSON.parse(crudo) as {
      historial: { revision?: { texto: string; texto_saneado: boolean } }[]
    }
    const conRevision = json.historial.filter((h) => h.revision !== undefined)
    expect(conRevision).toHaveLength(1)
    const revision = conRevision[0].revision
    // Y el criterio queda entero: se reemplaza el tramo de la ruta, no la línea.
    expect(revision?.texto).toContain('01.png.')
    expect(revision?.texto).toContain('va cortada')
    expect(revision?.texto_saneado).toBe(true)
  })

  it('la idea de la semana tampoco lleva el disco de quien la escribió', async () => {
    // El tercer escritor de texto libre del JSON. `main()` arma la idea juntando los
    // argumentos sueltos de la línea de comandos, así que trae lo que el agente tenía a
    // mano: "la toma buena es la de C:\...\01.png". El canario de las tandas recorre TODO
    // string del archivo, así que una idea con una ruta lo pone rojo cuando el texto ya
    // está commiteado y sin salida limpia.
    //
    // Se prueban los DOS caminos porque la rama de regeneración no pasa por `crearTanda`:
    // sanear ahí dentro cubría solo el primero.
    const { armarYEnviar } = await import(MODULO_TANDA)
    const SOLO_CARRUSEL = [{ pieza: CARRUSEL, rol: 'central' }]
    await sembrarRender(sembrarPieza(CARRUSEL))
    const sucia = String.raw`la toma buena es la de C:\Users\quiensea\out\rrss\01.png, esa`
    await armarYEnviar({
      idea: sucia,
      entradas: SOLO_CARRUSEL,
      slug: '2026-W44',
      env: { NODE_ENV: 'test' },
      revision: await veredictoSembrado(SOLO_CARRUSEL),
    })
    const nueva = JSON.parse(readFileSync(cola.rutaTanda('2026-W44'), 'utf8')) as { idea: string }
    expect(nueva.idea).not.toMatch(/quiensea/)
    expect(nueva.idea).not.toMatch(/\\/)
    // Y la idea queda legible: se reemplaza el tramo de la ruta, no la frase.
    expect(nueva.idea).toContain('la toma buena es la de')
    expect(nueva.idea).toContain('01.png')

    // Ahora la regeneración: la tanda vuelve con cambios y se arma de nuevo con otra idea
    // igual de sucia, por la rama que NO llama a `crearTanda`.
    const enRevision = cola.leerTanda('2026-W44')
    if (!enRevision) throw new Error('la tanda que acaba de escribir `armarYEnviar` tendría que estar en disco')
    cola.escribirTanda({
      ...enRevision,
      estado: 'cambios_pedidos',
      historial: [{ estado: 'cambios_pedidos', cuando: new Date().toISOString(), nota: 'cambia el titular' }],
    })
    await armarYEnviar({
      idea: String.raw`mejor la de C:\Users\quiensea\out\rrss\02.png`,
      entradas: SOLO_CARRUSEL,
      slug: '2026-W44',
      env: { NODE_ENV: 'test' },
      revision: await veredictoSembrado(SOLO_CARRUSEL),
    })
    const regenerada = JSON.parse(readFileSync(cola.rutaTanda('2026-W44'), 'utf8')) as { idea: string }
    expect(regenerada.idea).not.toMatch(/quiensea/)
    expect(regenerada.idea).not.toMatch(/\\/)
    expect(regenerada.idea).toContain('02.png')
  })

  it('regenerar sin idea se niega, igual que crear sin idea', async () => {
    // La rama de regeneración no pasa por `crearTanda`, así que la validación de la idea
    // tampoco: escribía `idea: "   "` y la vista previa le llegaba a Juanjo sin la idea,
    // que es exactamente lo que se le pide aprobar. El mensaje tiene que ser UNO: sale de
    // `exigirIdea`, que usan los dos caminos.
    const { armarYEnviar } = await import(MODULO_TANDA)
    const SOLO_CARRUSEL = [{ pieza: CARRUSEL, rol: 'central' }]
    await sembrarRender(sembrarPieza(CARRUSEL))
    cola.escribirTanda({
      ...cola.crearTanda({ slug: '2026-W44', idea: 'A', piezas: SOLO_CARRUSEL }),
      estado: 'cambios_pedidos',
      historial: [{ estado: 'cambios_pedidos', cuando: new Date().toISOString(), nota: 'cambia el titular' }],
    })
    for (const vacia of ['   ', '', undefined]) {
      await expect(
        armarYEnviar({
          idea: vacia,
          entradas: SOLO_CARRUSEL,
          slug: '2026-W44',
          env: { NODE_ENV: 'test' },
          revision: await veredictoSembrado(SOLO_CARRUSEL),
        }),
      ).rejects.toThrow(/necesita una idea central/)
    }
    // Y la tanda que estaba no se tocó: el que se niega no deja a medias lo anterior.
    expect(cola.leerTanda('2026-W44')?.idea).toBe('A')
    expect(cola.leerTanda('2026-W44')?.estado).toBe('cambios_pedidos')
  })
})

describe('escribir una tanda es el punto único del saneado', () => {
  it('sanea todo string del archivo, sin lista de campos que haya que acordarse', () => {
    // Tres vueltas de revisión encontraron tres escritores de texto libre de a uno —el
    // veredicto, la nota de Juanjo, la idea de la semana—, cada uno con la misma
    // consecuencia: el canario recorre TODO string del archivo, así que la fuga pone rojo
    // el pre-push con el texto ya commiteado. Buscar escritores de a uno no termina nunca.
    //
    // Acá se prueban los dos que NO son texto libre y vienen igual de afuera del repo
    // (`aprobada_por` sale del usuario de Telegram, `hora_sugerida` del `--pieza`, que no
    // valida forma) y un campo que no existe hoy, que es el escritor que vendrá.
    const local = String.raw`C:\Users\quiensea\OneDrive\Escritorio\Proyectos IA\tu-golf\out\01.png`
    cola.escribirTanda({
      ...cola.crearTanda({ slug: '2026-W44', idea: 'A', piezas: PIEZAS_OK }),
      // El `@usuario` de Telegram queda (es quién aprobó); lo que se va es la ruta.
      aprobada_por: `@maxundurraga desde ${local}`,
      piezas: [{ pieza: CARRUSEL, rol: 'central', hora_sugerida: local }],
      campo_que_no_existe_hoy: { anidado: [`la toma en ${local}`] },
    })
    const crudo = readFileSync(cola.rutaTanda('2026-W44'), 'utf8')
    expect(crudo).not.toMatch(/quiensea/)
    expect(crudo).not.toMatch(/tu-golf/)
    expect(crudo).not.toMatch(/\\\\/)
    expect(crudo).toContain('01.png')
    expect(crudo).toContain('@maxundurraga')
  })

  it('y no toca lo que tiene que volver idéntico', () => {
    // El saneado parejo solo es seguro si no muerde los campos que son identidad: un link
    // de Instagram que ya se publicó, el slug de una pieza, la hora, la huella, el
    // `@usuario` que aprobó y las fechas. Si alguno cambiara, la tanda dejaría de
    // corresponder a lo que hay en Instagram y nadie lo notaría hasta buscar el link.
    const identicos = {
      publicada_en: ['https://www.instagram.com/p/De-G6_KgoKN/', 'https://www.instagram.com/reel/Dehz-PKATXm/'],
      aprobada_por: '@maxundurraga',
      huella: 'a3f9c1e4b2d7',
      cuando: '2026-10-30T03:40:00.000Z',
    }
    cola.escribirTanda({
      ...cola.crearTanda({ slug: '2026-W44', idea: 'A', piezas: [{ pieza: CARRUSEL, rol: 'central', hora_sugerida: '09:00' }] }),
      ...identicos,
    })
    const enDisco = JSON.parse(readFileSync(cola.rutaTanda('2026-W44'), 'utf8')) as Record<string, unknown> & {
      piezas: { pieza: string; hora_sugerida: string }[]
    }
    for (const [campo, valor] of Object.entries(identicos)) expect(enDisco[campo], campo).toEqual(valor)
    expect(enDisco.slug).toBe('2026-W44')
    expect(enDisco.piezas[0].pieza).toBe(CARRUSEL)
    expect(enDisco.piezas[0].hora_sugerida).toBe('09:00')
  })
})

describe('los links de una tanda publicada', () => {
  function tandaAprobada() {
    const base = cola.crearTanda({ slug: '2026-W44', idea: 'A', piezas: PIEZAS_OK })
    cola.escribirTanda({ ...cola.transicionar(base, 'en_revision'), estado: 'aprobada', aprobada_por: 'juanjo' })
  }

  it('rechaza links vacíos o que no son de Instagram', async () => {
    // `publicada` es terminal: una tanda que entra ahí con un link vacío queda
    // ciega para siempre, y medir era el único motivo de pedirlos.
    const { marcarPublicada } = await import('../../../scripts/rrss/publicar.mjs')
    for (const malos of [
      ['', ''],
      ['https://www.instagram.com/p/Abc123/', ''],
      ['https://www.instagram.com/p/Abc123/', 'mañana lo pego'],
      ['http://instagram.com/p/Abc123/', 'https://www.instagram.com/p/Def/'],
    ]) {
      tandaAprobada()
      expect(() => marcarPublicada('2026-W44', malos), malos.join(' | ')).toThrow(/instagram/i)
      expect(cola.leerTanda('2026-W44')?.estado).toBe('aprobada')
    }
  })

  it('acepta los links de verdad y cierra la tanda', async () => {
    const { marcarPublicada } = await import('../../../scripts/rrss/publicar.mjs')
    tandaAprobada()
    const t = marcarPublicada('2026-W44', [
      ' https://www.instagram.com/reel/Abc-1_2/ ',
      'https://instagram.com/p/Def456/?img_index=1',
    ])
    expect(t.estado).toBe('publicada')
    expect(t.piezas[0].publicada_en).toBe('https://www.instagram.com/reel/Abc-1_2/')
  })
})

describe('un estado terminal es el que no tiene salida', () => {
  it('sale de TRANSICIONES y no de una lista escrita aparte', () => {
    for (const estado of cola.ESTADOS) {
      expect(cola.esTerminal(estado), estado).toBe((cola.TRANSICIONES[estado] ?? []).length === 0)
    }
    expect(cola.ESTADOS.filter((e) => cola.esTerminal(e))).toEqual(['publicada', 'rechazada'])
  })

  it('una tanda en un estado terminal ya no es la tanda abierta de la semana', () => {
    for (const estado of cola.ESTADOS) {
      cola.escribirTanda({ ...cola.crearTanda({ slug: '2026-W44', idea: 'A', piezas: PIEZAS_OK }), estado })
      expect(Boolean(cola.tandaAbierta('2026-W44')), estado).toBe(!cola.esTerminal(estado))
    }
  })

  it('un estado terminal nuevo se respeta sin tocar tandaAbierta', () => {
    // El control que separa "lo deriva de TRANSICIONES" de "tiene la lista
    // escrita a mano": con el literal `['publicada', 'rechazada']` un séptimo
    // estado terminal quedaría como tanda abierta para siempre, y /rrss se
    // negaría a armar la tanda de la semana siguiente sin decir por qué.
    cola.ESTADOS.push('archivada')
    try {
      cola.TRANSICIONES.archivada = []
      cola.escribirTanda({
        ...cola.crearTanda({ slug: '2026-W44', idea: 'A', piezas: PIEZAS_OK }),
        estado: 'archivada',
      })
      expect(cola.tandaAbierta('2026-W44')).toBeNull()
      // Y al revés: si tuviera salida, seguiría abierta.
      cola.TRANSICIONES.archivada = ['borrador']
      expect(cola.tandaAbierta('2026-W44')?.estado).toBe('archivada')
    } finally {
      cola.ESTADOS.pop()
      delete cola.TRANSICIONES.archivada
    }
  })
})

describe('el veredicto lo firma quien lo apretó', () => {
  const CREDS = { RRSS_TELEGRAM_BOT_TOKEN: 't0ken', RRSS_TELEGRAM_CHAT_ID: '123' }

  /** Lo que `fetch` devuelve: Telegram contesta JSON con `ok` arriba. */
  const contesta = (result: unknown) => ({
    status: 200,
    text: async () => JSON.stringify({ ok: true, result }),
  })

  /**
   * Un toque de botón como llega de verdad, y las llamadas que el código le
   * hace a la API para poder afirmar sobre ellas.
   */
  function telegramQueToca(callback: Record<string, unknown>) {
    const llamadas: Array<{ metodo: string; cuerpo: Record<string, unknown> }> = []
    vi.stubGlobal('fetch', async (url: string, opciones: { body: string }) => {
      const metodo = String(url).split('/').pop() as string
      llamadas.push({ metodo, cuerpo: JSON.parse(opciones.body) })
      if (metodo === 'getUpdates') return contesta([{ update_id: 7, callback_query: callback }])
      return contesta({})
    })
    return llamadas
  }

  function enRevision() {
    const base = cola.crearTanda({ slug: '2026-W44', idea: 'A', piezas: PIEZAS_OK })
    cola.escribirTanda(cola.transicionar(base, 'en_revision'))
  }

  it('escribe el nombre de quien tocó el botón, no un "juanjo" fijo', async () => {
    // `esDelChatAprobador` compara el CHAT: si `RRSS_TELEGRAM_CHAT_ID`
    // apunta a un grupo (Juanjo y Max), los dos pueden aprobar —y está
    // bien—, pero `SUBIR.md` encabeza con "Aprobada por" y ese nombre era
    // "juanjo" escrito en el código, dijera lo que dijera Telegram.
    const { recogerVeredictos } = await import(MODULO_APROBACION)
    enRevision()
    const llamadas = telegramQueToca({
      id: 'cb1',
      data: 'aprobar:2026-W44',
      from: { username: 'maxundurraga', first_name: 'Max' },
      message: { chat: { id: 123 } },
    })
    const r = (await recogerVeredictos({ env: CREDS })) as {
      canal: string
      aplicados: Array<{ slug: string; estado: string }>
      avisos: string[]
    }
    expect(r.canal).toBe('telegram')
    expect(r.aplicados).toEqual([{ slug: '2026-W44', estado: 'aprobada' }])
    expect(cola.leerTanda('2026-W44')?.aprobada_por).toBe('@maxundurraga')
    expect(llamadas.map((l) => l.metodo)).toContain('answerCallbackQuery')
  })

  it('sin @usuario firma con el nombre, y nunca con el string vacío', async () => {
    const { recogerVeredictos } = await import(MODULO_APROBACION)
    enRevision()
    telegramQueToca({
      id: 'cb1',
      data: 'aprobar:2026-W44',
      from: { first_name: 'Juan José', last_name: 'Lamarca' },
      message: { chat: { id: 123 } },
    })
    await recogerVeredictos({ env: CREDS })
    expect(cola.leerTanda('2026-W44')?.aprobada_por).toBe('Juan José Lamarca')
  })

  it('el slug que vuelve del toque se escapa antes de ir al chat', async () => {
    // El slug no es un dato nuestro: sale de `callback_data`, o sea de lo que Telegram
    // devuelve, y se interpola en un mensaje que se manda con `parse_mode: HTML`. Un `&`
    // ahí deja el mensaje mal formado y Telegram no lo entrega: el aviso de "¿qué
    // cambio?" se perdería y la tanda quedaría esperando una nota que nadie pidió. Se
    // escapa en las CUATRO ramas que lo nombran, no en dos.
    const { recogerVeredictos } = await import(MODULO_APROBACION)
    enRevision()
    const llamadas = telegramQueToca({
      id: 'cb1',
      data: 'cambios:2026-W44 & <b>ojo</b>',
      from: { username: 'juanjoselamarca' },
      message: { chat: { id: 123 } },
    })
    await recogerVeredictos({ env: CREDS })
    const textos = llamadas.filter((l) => l.metodo === 'sendMessage').map((l) => String(l.cuerpo.text))
    expect(textos.join(' ')).toContain('2026-W44 &amp; &lt;b&gt;ojo&lt;/b&gt;')
    expect(textos.join(' ')).not.toContain('<b>ojo</b>')
  })

  it('un toque de otro chat no aprueba nada', async () => {
    // El camino completo del control, no solo el predicado: los
    // `callback_data` son adivinables y el bot le contesta a cualquiera que
    // le escriba.
    const { recogerVeredictos } = await import(MODULO_APROBACION)
    enRevision()
    telegramQueToca({
      id: 'cb1',
      data: 'aprobar:2026-W44',
      from: { username: 'desconocido' },
      message: { chat: { id: 999 } },
    })
    const r = (await recogerVeredictos({ env: CREDS })) as { aplicados: unknown[]; avisos: string[] }
    expect(r.aplicados).toEqual([])
    expect(r.avisos.join(' ')).toMatch(/chat 999/)
    expect(cola.leerTanda('2026-W44')?.estado).toBe('en_revision')
    expect(cola.leerTanda('2026-W44')?.aprobada_por).toBeUndefined()
  })
})

describe('solo el chat que aprueba manda', () => {
  it('ignora un toque que viene de otro chat', async () => {
    const { esDelChatAprobador } = await import(MODULO_TELEGRAM)
    const creds = { token: 't', chatId: '123' }
    // Los callback_data son adivinables y el bot le responde a cualquiera que le
    // escriba: sin este filtro, un desconocido aprueba una publicación.
    expect(esDelChatAprobador({ deChat: '123' }, creds)).toBe(true)
    expect(esDelChatAprobador({ deChat: '999' }, creds)).toBe(false)
    expect(esDelChatAprobador({ deChat: '' }, creds)).toBe(false)
  })
})

describe('huella visual (el render en disco corresponde a la pieza)', () => {
  it('cambia si cambia una lámina y NO cambia si cambia el caption', async () => {
    const { huellaVisual } = await import(MODULO_MARCA)
    const base = {
      formato: 'carrusel',
      direccion: 'bloomberg',
      rotulo: 'Golf · Datos',
      laminas: [{ plantilla: 'cierre', titular: 'A' }],
      caption: 'uno',
      hashtags: ['#a'],
    }
    // Un titular corregido en la revisión tiene que invalidar los PNG...
    expect(huellaVisual({ ...base, laminas: [{ plantilla: 'cierre', titular: 'B' }] })).not.toBe(huellaVisual(base))
    expect(huellaVisual({ ...base, rotulo: 'Otro' })).not.toBe(huellaVisual(base))
    expect(huellaVisual({ ...base, formato: 'story' })).not.toBe(huellaVisual(base))
    // ...y una coma del texto de Instagram no, porque no se dibuja y obligaría a
    // renderizar seis láminas de nuevo por nada.
    expect(huellaVisual({ ...base, caption: 'dos', hashtags: ['#b'] })).toBe(huellaVisual(base))
  })
})

describe('empaquetar para publicar', () => {
  it('se niega si la tanda no está aprobada', async () => {
    const { empaquetar } = await import('../../../scripts/rrss/publicar.mjs')
    for (const estado of ['borrador', 'en_revision'] as const) {
      const t = cola.crearTanda({ slug: '2026-W44', idea: 'A', piezas: PIEZAS_OK })
      cola.escribirTanda(estado === 'borrador' ? t : cola.transicionar(t, 'en_revision'))
      expect(() => empaquetar('2026-W44')).toThrow(/aprobada/i)
    }
  })

  it('se niega si el render en disco es de una versión anterior de la pieza', async () => {
    // El caso real: se corrige una cifra en la revisión, nadie vuelve a
    // renderizar, y lo que se sube es la lámina vieja.
    const { mediosDePieza } = await import('../../../scripts/rrss/publicar.mjs')
    const { huellaVisual } = await import(MODULO_MARCA)
    const pieza = {
      slug: '2026-10-27-prueba-huella',
      formato: 'carrusel',
      direccion: 'bloomberg',
      rotulo: 'R',
      laminas: [{ plantilla: 'cierre', titular: 'nuevo' }],
    }
    const dir = path.join(dirSalida, pieza.slug)
    mkdirSync(dir, { recursive: true })
    try {
      writeFileSync(
        path.join(dir, 'publicacion.json'),
        JSON.stringify({
          slug: pieza.slug,
          laminas: [],
          huella_visual: huellaVisual({ ...pieza, laminas: [{ plantilla: 'cierre', titular: 'viejo' }] }),
        }),
      )
      expect(() => mediosDePieza(pieza)).toThrow(/cambió después de renderizarse/i)
      // Con la huella correcta el que falla es otro control (no hay láminas), no este.
      writeFileSync(
        path.join(dir, 'publicacion.json'),
        JSON.stringify({ slug: pieza.slug, laminas: [], huella_visual: huellaVisual(pieza) }),
      )
      expect(() => mediosDePieza(pieza)).toThrow(/no tiene nada que subir/i)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('se niega si la pieza nunca se renderizó', async () => {
    const { mediosDePieza } = await import('../../../scripts/rrss/publicar.mjs')
    expect(() => mediosDePieza({ slug: '2026-10-27-nunca-renderizada', laminas: [] })).toThrow(/no está renderizada/i)
  })
})

// El reel y su pieza viven en carpetas distintas y con slugs distintos: el MP4 lo
// deja `montar.mjs` en `out/rrss/<escena>/` (la escena se llama `anota-todos-ven`)
// y las láminas las deja `render.mjs` en `out/rrss/<pieza>/` (la pieza se llama
// `2026-10-27-anota-todos-ven`). No pueden compartir carpeta: `render.mjs` borra
// la de la pieza antes de escribir, así que un MP4 guardado ahí no sobrevive al
// siguiente render de la lámina de cierre.
//
// Lo que estos tests cuidan es el único final posible de ese desencuentro: el
// empaquetador no encuentra el video, cae al camino de las láminas y sube la
// lámina de cierre SOLA —una imagen fija donde iba el reel— sin un solo error.
describe('el video de un reel llega al paquete', () => {
  const PIEZA_REEL = {
    slug: '2026-10-27-anota-todos-ven',
    formato: 'story',
    escena: 'anota-todos-ven',
    direccion: 'bloomberg',
    rotulo: 'R',
    laminas: [{ plantilla: 'cierre', titular: 'Uno anota.' }],
  }

  /**
   * Corre `fn` con la escena real SIN su lámina de cierre, y la devuelve al
   * salir. Se toca `ESCENAS` en vez de inventar una escena nueva porque
   * `huellaEscena` y `videoDePieza` la buscan ahí por clave.
   */
  async function sinLaminaDeCierre(fn: () => Promise<void>) {
    const { ESCENAS } = (await import('../../../scripts/rrss/escenas.mjs')) as {
      ESCENAS: Record<string, { cierre?: unknown }>
    }
    const escena = ESCENAS[PIEZA_REEL.escena]
    const cierre = escena.cierre
    delete escena.cierre
    try {
      await fn()
    } finally {
      escena.cierre = cierre
    }
  }

  /**
   * Deja en disco lo que montar.mjs y render.mjs dejarían, y limpia después.
   *
   * Escribe en una carpeta temporal (`RRSS_DIR_SALIDA`), nunca en `out/rrss/`:
   * esta prueba borra lo que crea, y la pieza y la escena que usa son las de
   * verdad, así que sin el override el `finally` se llevaría puesto el reel que
   * estuviera montado.
   */
  async function conDiscoDeUnReel(
    fn: (p: Record<string, unknown>) => void | Promise<void>,
    {
      video = true,
      manifiestoVideo = true,
      huellaVieja = false,
      cierreViejo = false,
      cierreEnManifiesto = true,
      capturaVieja = false,
      selloDeCaptura = true,
      capturaEnDisco = true,
    } = {},
  ) {
    const { huellaDeCaptura, huellaVisual } = await import(MODULO_MARCA)
    const { huellaEscena } = await import('../../../scripts/rrss/escenas.mjs')
    const raizSalida = mkdtempSync(path.join(tmpdir(), 'rrss-salida-'))
    vi.stubEnv('RRSS_DIR_SALIDA', raizSalida)
    const dirPieza = path.join(raizSalida, PIEZA_REEL.slug)
    const dirEscena = path.join(raizSalida, PIEZA_REEL.escena)
    // `publicacion.json` declara las láminas relativas a la raíz del repo, que es
    // como las escribe render.mjs y como las resuelve mediosDePieza.
    const laminaRel = path.relative(process.cwd(), path.join(dirPieza, '01.png'))
    mkdirSync(dirPieza, { recursive: true })
    mkdirSync(dirEscena, { recursive: true })
    // Los fotogramas que `capturar.mjs` dejaría: `videoDePieza` recalcula su huella
    // contra el sello de `video.json` para cazar una recaptura sin volver a montar.
    const frames = [{ archivo: '001.jpg', ms: 900, nota: 'anota' }, { archivo: '002.jpg', ms: 1100 }]
    // La lámina de cierre sale de la pieza que nombra la ESCENA, y el empaquetador la
    // lee de `RRSS_DIR_PIEZAS`. Sin sembrarla, la huella del cierre queda "ausente" y
    // el reel no se puede empaquetar nunca.
    writeFileSync(path.join(dirPiezas, `${PIEZA_REEL.slug}.json`), JSON.stringify(PIEZA_REEL))
    try {
      writeFileSync(path.join(dirPieza, '01.png'), 'png-de-la-lamina-de-cierre')
      writeFileSync(
        path.join(dirPieza, 'publicacion.json'),
        JSON.stringify({ slug: PIEZA_REEL.slug, laminas: [laminaRel], huella_visual: huellaVisual(PIEZA_REEL) }),
      )
      if (video) writeFileSync(path.join(dirEscena, `${PIEZA_REEL.escena}.mp4`), 'mp4-del-reel')
      // `capturaEnDisco: false` deja el MP4 y su manifiesto con la escena SIN capturar:
      // es lo que queda cuando una recaptura muere a mitad.
      if (capturaEnDisco)
        writeFileSync(path.join(dirEscena, 'frames.json'), JSON.stringify({ escena: PIEZA_REEL.escena, frames }))
      if (manifiestoVideo)
        writeFileSync(
          path.join(dirEscena, 'video.json'),
          JSON.stringify({
            escena: PIEZA_REEL.escena,
            huella_escena: huellaVieja ? '0000000000000000' : huellaEscena(PIEZA_REEL.escena),
            huella_captura: selloDeCaptura
              ? capturaVieja
                ? '000000000000'
                : huellaDeCaptura(frames)
              : undefined,
            cierre: cierreEnManifiesto
              ? {
                  pieza: PIEZA_REEL.slug,
                  huella_visual: cierreViejo
                    ? huellaVisual({ ...PIEZA_REEL, laminas: [{ plantilla: 'cierre', titular: 'otro' }] })
                    : huellaVisual(PIEZA_REEL),
                }
              : null,
          }),
        )
      await fn({ ...PIEZA_REEL })
    } finally {
      rmSync(raizSalida, { recursive: true, force: true })
    }
  }

  it('sube el MP4 de la escena y NO la lámina de cierre', async () => {
    const { mediosDePieza } = await import('../../../scripts/rrss/publicar.mjs')
    await conDiscoDeUnReel((pieza) => {
      const { archivos } = mediosDePieza(pieza)
      expect(archivos).toHaveLength(1)
      expect(archivos[0]).toMatch(/anota-todos-ven[\\/]anota-todos-ven\.mp4$/)
      expect(archivos.join(' ')).not.toMatch(/\.png$/)
    })
  })

  it('una pieza sin escena sigue subiendo sus láminas', async () => {
    // El camino de los carruseles y los stories estáticos no se toca.
    const { mediosDePieza, videoDePieza } = await import('../../../scripts/rrss/publicar.mjs')
    await conDiscoDeUnReel((pieza) => {
      delete pieza.escena
      expect(videoDePieza(pieza)).toBeNull()
      const { archivos } = mediosDePieza(pieza)
      expect(archivos).toHaveLength(1)
      expect(archivos[0]).toMatch(/01\.png$/)
    })
  })

  it('se niega si la escena no está montada, en vez de subir la lámina', async () => {
    const { mediosDePieza } = await import('../../../scripts/rrss/publicar.mjs')
    await conDiscoDeUnReel(
      (pieza) => expect(() => mediosDePieza(pieza)).toThrow(/no está montado/i),
      { video: false },
    )
  })

  it('se niega si el MP4 está pero sin manifiesto: no se sabe de qué versión es', async () => {
    const { mediosDePieza } = await import('../../../scripts/rrss/publicar.mjs')
    await conDiscoDeUnReel(
      (pieza) => expect(() => mediosDePieza(pieza)).toThrow(/no está montado/i),
      { manifiestoVideo: false },
    )
  })

  it('se niega si la escena cambió después de montarse', async () => {
    // Mismo caso real que la huella visual, del lado del video: se corrige un
    // golpe de la escena en la revisión y nadie vuelve a capturar.
    const { mediosDePieza } = await import('../../../scripts/rrss/publicar.mjs')
    await conDiscoDeUnReel(
      (pieza) => expect(() => mediosDePieza(pieza)).toThrow(/cambió después de montarse/i),
      { huellaVieja: true },
    )
  })

  it('la huella de la escena cambia si cambia un golpe', async () => {
    const { huellaEscena } = await import('../../../scripts/rrss/escenas.mjs')
    const escenas = (await import('../../../scripts/rrss/escenas.mjs')).ESCENAS as Record<
      string,
      { jugadores: Array<{ golpes: number[] }> }
    >
    const antes = huellaEscena('anota-todos-ven')
    const golpes = escenas['anota-todos-ven'].jugadores[0].golpes
    const original = golpes[0]
    golpes[0] = original + 1
    try {
      expect(huellaEscena('anota-todos-ven')).not.toBe(antes)
    } finally {
      golpes[0] = original
    }
    expect(huellaEscena('anota-todos-ven')).toBe(antes)
  })

  it('se niega si la lámina de cierre cambió después de montarse', async () => {
    // El bug por la otra puerta. Para un reel, `mediosDePieza` descarta las
    // láminas: van montadas DENTRO del MP4. Entonces el control de siempre
    // —publicacion.json contra la pieza— no mira nada, porque se renderizó recién
    // y calza; y la huella de la escena tampoco cambia, porque ESCENAS no se
    // tocó. Sin esta comparación el reel sube con el titular anterior pegado en
    // los últimos 2,6 segundos y ningún control se entera.
    const { mediosDePieza } = await import('../../../scripts/rrss/publicar.mjs')
    await conDiscoDeUnReel(
      (pieza) => expect(() => mediosDePieza(pieza)).toThrow(/lámina de cierre[\s\S]*cambió después de montarse/i),
      { cierreViejo: true },
    )
  })

  it('una escena que no declara lámina de cierre se empaqueta igual', async () => {
    // No toda escena tiene por qué terminar en una lámina. `montar.mjs` escribe
    // `cierre: null` en ese caso, y exigir la huella igual dejaba a ese reel sin
    // forma de empaquetarse NUNCA, con un error que habla de una lámina que no
    // existe. Quién manda es la escena, no el manifiesto.
    const { mediosDePieza } = await import('../../../scripts/rrss/publicar.mjs')
    await sinLaminaDeCierre(async () => {
      await conDiscoDeUnReel(
        (pieza) => {
          const { archivos } = mediosDePieza(pieza)
          expect(archivos).toHaveLength(1)
          expect(archivos[0]).toMatch(/\.mp4$/)
        },
        { cierreEnManifiesto: false },
      )
    })
  })

  it('se niega si el MP4 lleva un cierre pegado que la escena ya no declara', async () => {
    // El mismo control por el otro lado: se saca la lámina de cierre de la
    // escena y nadie vuelve a montar. El MP4 en disco sigue terminando en la
    // lámina, y sin esto subiría así.
    const { mediosDePieza } = await import('../../../scripts/rrss/publicar.mjs')
    await sinLaminaDeCierre(async () => {
      await conDiscoDeUnReel((pieza) =>
        expect(() => mediosDePieza(pieza)).toThrow(/ya no declara ninguna/i),
      )
    })
  })

  it('se niega si el manifiesto del video no dice nada de la lámina de cierre', async () => {
    // Un video.json de antes de que existiera el sello. "Ausente" no puede pasar
    // por "igual": es justo el caso que no se puede verificar.
    const { mediosDePieza, videoDePieza } = await import('../../../scripts/rrss/publicar.mjs')
    await conDiscoDeUnReel(async (pieza) => {
      const { huellaEscena } = await import('../../../scripts/rrss/escenas.mjs')
      const { huellaDeCaptura } = await import(MODULO_MARCA)
      const dirEscena = path.join(process.env.RRSS_DIR_SALIDA as string, PIEZA_REEL.escena)
      const { frames } = JSON.parse(readFileSync(path.join(dirEscena, 'frames.json'), 'utf8'))
      writeFileSync(
        path.join(dirEscena, 'video.json'),
        JSON.stringify({
          escena: PIEZA_REEL.escena,
          huella_escena: huellaEscena(PIEZA_REEL.escena),
          huella_captura: huellaDeCaptura(frames),
        }),
      )
      expect(() => videoDePieza(pieza)).toThrow(/lámina de cierre[\s\S]*ausente/i)
      expect(() => mediosDePieza(pieza)).toThrow(/lámina de cierre/i)
    })
  })

  it('se niega si se volvió a capturar después de montar', async () => {
    // El caso que ninguna huella anterior cazaba: la escena no cambió —el código es el
    // mismo, su huella no se mueve— y las láminas tampoco. Lo único distinto son los
    // fotogramas en disco, y el MP4 es de la tanda anterior.
    const { mediosDePieza } = await import('../../../scripts/rrss/publicar.mjs')
    await conDiscoDeUnReel(
      (pieza) => expect(() => mediosDePieza(pieza)).toThrow(/no es de la toma que hay en disco/i),
      { capturaVieja: true },
    )
  })

  it('se niega si el MP4 se montó sin sellar la toma', async () => {
    // Un video.json de antes de que el sello existiera: de ese MP4 no se sabe de qué
    // toma salió, y "no se puede verificar" no pasa por "está bien".
    const { mediosDePieza } = await import('../../../scripts/rrss/publicar.mjs')
    await conDiscoDeUnReel(
      (pieza) => expect(() => mediosDePieza(pieza)).toThrow(/no tiene sellada la toma/i),
      { selloDeCaptura: false },
    )
  })

  it('se niega si la escena no está capturada, en vez de dar el MP4 por bueno', async () => {
    // Sin `frames.json` no hay toma contra la que verificar el MP4, y el control de la
    // huella se salteaba solo: quedaba en `null` y la comparación no corría. Es justo lo
    // que deja una recaptura cortada a mitad, y el expediente ya fallaba cerrado ahí
    // mismo: el revisor leía el aviso y el empaquetado subía el reel igual.
    const { mediosDePieza } = await import('../../../scripts/rrss/publicar.mjs')
    await conDiscoDeUnReel((pieza) => expect(() => mediosDePieza(pieza)).toThrow(/no está capturada/i), {
      capturaEnDisco: false,
    })
  })

  it('rechaza un nombre de escena que se saldría de out/rrss', async () => {
    const { videoDePieza } = await import('../../../scripts/rrss/publicar.mjs')
    for (const escena of ['../../etc', 'anota/../..', 'Anota-Todos-Ven']) {
      expect(() => videoDePieza({ slug: '2026-10-27-x', escena }), escena).toThrow(/inseguro/i)
    }
  })
})

/**
 * Lo que deja en disco una toma que muere a mitad.
 *
 * `capturar.mjs` sobrescribe `frames.json` recién al final, y los jpg se llaman por
 * número: si el manifiesto viejo sobrevive, apunta a los cuadros NUEVOS y la huella de
 * la captura no se mueve. El PUBLICAR de ayer seguía valiendo para un MP4 montado con
 * otra toma, y ninguno de los dos controles que miran el manifiesto podía notarlo.
 */
describe('una toma cortada a mitad no deja un manifiesto que miente', () => {
  it('limpiarTomaAnterior borra el manifiesto, no solo los cuadros', async () => {
    const raizSalida = mkdtempSync(path.join(tmpdir(), 'rrss-toma-'))
    vi.stubEnv('RRSS_DIR_SALIDA', raizSalida)
    try {
      const { rutaManifiestoFrames, framesDeEscena, limpiarTomaAnterior } = await import(
        '../../../scripts/rrss/publicar.mjs'
      )
      const dirFrames = path.join(raizSalida, 'anota-todos-ven', 'frames')
      mkdirSync(dirFrames, { recursive: true })
      writeFileSync(path.join(dirFrames, '001.jpg'), 'jpg-de-la-toma-vieja')
      writeFileSync(
        rutaManifiestoFrames('anota-todos-ven'),
        JSON.stringify({ slug: 'anota-todos-ven', frames: [{ archivo: '001.jpg', ms: 900 }] }),
      )
      expect(limpiarTomaAnterior('anota-todos-ven')).toBe(dirFrames)
      // El manifiesto vive FUERA de `frames/`: borrar la carpeta no se lo llevaba.
      expect(existsSync(rutaManifiestoFrames('anota-todos-ven'))).toBe(false)
      // Y el efecto que importa: sin manifiesto, el expediente y el empaquetado fallan
      // cerrado en vez de dar por buena la toma anterior.
      expect(framesDeEscena('anota-todos-ven')).toBeNull()
      expect(existsSync(path.join(dirFrames, '001.jpg'))).toBe(false)
      // Y la carpeta queda lista para los cuadros nuevos.
      expect(existsSync(dirFrames)).toBe(true)
    } finally {
      rmSync(raizSalida, { recursive: true, force: true })
    }
  })
})

describe('las tandas versionadas en el repo son legibles', () => {
  it('cada archivo de scripts/rrss/tandas tiene estado y piezas válidos', async () => {
    // El estado del sistema son estos archivos. Uno corrupto o con un estado que
    // ya no existe rompe /rrss en silencio, y se nota cuando no sale la pieza.
    vi.unstubAllEnvs()
    vi.resetModules()
    const real = (await import(MODULO_COLA)) as unknown as Cola
    const { motivoNoPublicable } = await import('../../../scripts/rrss/validar.mjs')
    const { problemasDeSello } = await import('../../../scripts/rrss/publicar.mjs')
    const todas = real.listarTandas()
    // Sin esto el test pasa con la carpeta vacía, que es el día en que de verdad
    // habría algo que revisar.
    expect(todas.length, 'no hay ninguna tanda versionada en scripts/rrss/tandas').toBeGreaterThan(0)
    for (const t of todas) {
      expect(real.ESTADOS, `tanda ${t.slug}`).toContain(t.estado)
      expect(t.slug).toMatch(real.SLUG_TANDA)
      expect(t.piezas.length, `tanda ${t.slug} sin piezas`).toBeGreaterThan(0)
      expect(t.historial.at(-1)?.estado, `tanda ${t.slug}: historial y estado no calzan`).toBe(t.estado)
      for (const p of t.piezas) {
        const ruta = path.join(process.cwd(), 'scripts', 'rrss', 'piezas', `${p.pieza}.json`)
        expect(() => readFileSync(ruta, 'utf8'), `tanda ${t.slug}: la pieza ${p.pieza} no existe`).not.toThrow()
        // Una tanda versionada es contenido que se va a publicar: una pieza
        // fixture ahí adentro se descubre recién al empaquetar, con la
        // aprobación ya dada. Se pregunta con el predicado de verdad y no con
        // un `!== false` escrito acá: un canario que espeja al código que vigila
        // deja de vigilar el día que el código cambia.
        const json = JSON.parse(readFileSync(ruta, 'utf8'))
        expect(
          motivoNoPublicable(json),
          `tanda ${t.slug}: la pieza ${p.pieza} no es publicable`,
        ).toBeNull()
        // Y lo aprobado tiene que seguir siendo lo que hay en disco. Una tanda
        // esperando el sí de Juanjo, o ya aprobada, con un sello que no calza es
        // una pieza corregida después de mostrarse: se descubre al empaquetar,
        // con la hora de publicar encima.
        if (t.estado === 'en_revision' || t.estado === 'aprobada')
          expect(problemasDeSello(p, json), `tanda ${t.slug}, pieza ${p.pieza}`).toEqual([])
      }
    }
  })

  it('ninguna archiva una ruta del disco de quien revisó', async () => {
    // Estos archivos se commitean y el repo es PÚBLICO. El veredicto del revisor lo
    // escribe quien corre el comando, y la ruta que pasó puede ser el scratchpad de su
    // sesión o su home: archivarla tal cual publica su nombre de usuario y cómo tiene
    // ordenado el disco. Lo que importa de un veredicto es el texto, y ese va completo.
    vi.unstubAllEnvs()
    vi.resetModules()
    const real = (await import(MODULO_COLA)) as unknown as Cola
    const { sinRutasDeDisco } = (await import(MODULO_SANEADO)) as {
      sinRutasDeDisco: (texto: string) => string
    }
    const { fugas, camposVistos } = fugasDeLaCarpeta(real.dirTandas(), sinRutasDeDisco)
    expect(fugas).toEqual([])
    // Sin esto el canario pasa igual de verde con cero tandas en el repo, que es el
    // estado en el que más se parece a estar funcionando. Acopla `verify` al contenido del
    // repo —el día que W44 se archive y no quede ninguna, esto se pone rojo—, y es a
    // propósito: la alternativa es una red que no mira nada y no se nota.
    expect(
      camposVistos,
      'el canario no revisó ningún texto: ¿quedan tandas en scripts/rrss/tandas?',
    ).toBeGreaterThan(0)
    // El flag de cada veredicto archivado tiene que existir y ser booleano. No puede
    // pedirse que sea `true`: `texto_saneado` es `saneado !== texto`, o sea "se tocó", así
    // que un veredicto que no citó ninguna ruta lo trae en `false` con todo bien hecho, y
    // exigir `true` acá pondría rojo el pre-push sobre una tanda legítima. Que el flag
    // diga la verdad no se puede verificar desde el archivo —después del saneado el texto
    // es punto fijo y ya no se sabe si cambió—; eso lo prueba el test del cableado.
    for (const t of real.listarTandas())
      for (const [i, h] of t.historial.entries())
        if (h.revision)
          expect(typeof h.revision.texto_saneado, `tanda ${t.slug}, historial[${i}]`).toBe('boolean')
  })

  it('el detector de fugas caza cada forma de ruta y deja pasar la prosa', async () => {
    // El canario de arriba corre sobre las tandas del repo, que hoy están limpias: sin
    // este, el detector podría no cazar nada y las dos cosas se verían iguales de verdes.
    vi.unstubAllEnvs()
    vi.resetModules()
    const { sinRutasDeDisco } = (await import(MODULO_SANEADO)) as {
      sinRutasDeDisco: (texto: string) => string
    }
    const enVeredicto = (texto: string) => ({ historial: [{ revision: { texto } }] })
    const fugas = (texto: string) => fugasDeTanda(enVeredicto(texto), sinRutasDeDisco)
    for (const texto of [
      'la lámina está en C:\\Users\\quiensea\\out\\01.png',
      'el veredicto quedó en /home/quiensea/out/a.md',
      'corrí `ls /c/Users/quiensea/out/a.md`',
      'quedó en .../tmp/claude/C--Users-quiensea-x/out/a.md',
      'las tomas en [ruta local] IA/mis fotos/01.png',
      'lo dejé en /var/folders/zz/T/claude-quiensea/out/a.md',
    ])
      expect(fugas(texto), texto).not.toEqual([])
    // Y lo que el saneado deja intacto A PROPÓSITO no puede poner rojo nada. El segundo
    // es el falso positivo que este detector reemplaza: el canario anterior corría sobre
    // el JSON CRUDO, donde un salto de línea es un `\` seguido de una `n`, así que un
    // veredicto de dos párrafos ponía rojo el pre-push. No se veía porque ninguna tanda
    // tiene todavía un veredicto archivado.
    for (const texto of [
      'el caption separa con `\\n\\n`, y el arreglo va en tanda.mjs:347.',
      'quedó cortada en [ruta local].\n\nEl fix va en tanda.mjs:347.',
      'las tomas están en [ruta local] y/o en la nube',
      '[ruta local] y el leaderboard 9/18',
      'ver out/rrss/anota-todos-ven/frames.json',
      'la lámina dice "Scramble & best ball" y <5 sobre par',
    ])
      expect(fugas(texto), texto).toEqual([])
    // Los tres patrones de encima del punto fijo valen justamente cuando la fuente
    // canónica deja de cazar algo, así que se prueban con el saneado roto: si se cae uno,
    // esta red se queda viendo solo lo que ya ve el saneado.
    const saneadoRoto = (t: string) => t
    for (const texto of [
      'la sesión es C--Users-quiensea-OneDrive-Escritorio',
      'el log quedó en /tmp/claude/sesion/a.log',
      'las tomas en [ruta local] IA/mis fotos/01.png',
    ])
      expect(fugasDeTanda(enVeredicto(texto), saneadoRoto), texto).not.toEqual([])
  })

  it('marca también la prosa que NOMBRA la forma encodeada, y es un límite asumido', async () => {
    // `USUARIO_ENCODEADO` no distingue una ruta encodeada de una frase que habla de ella,
    // porque ahí no hay separadores de ruta que lo digan: un veredicto que revise este
    // mismo saneado —previsible— pone rojo el pre-push sin que haya ninguna fuga. Se
    // documenta en vez de arreglarse: es el único patrón que ve esa forma, el saneado no
    // la toca, y la salida es escribir `<quien sea>` en vez del usuario, que es lo que hay
    // que escribir igual en un repo público. Si un día esto molesta de verdad, el cambio
    // es pedir dos tramos encodeados seguidos, no borrar el patrón.
    const { sinRutasDeDisco } = await import(MODULO_SANEADO)
    const enVeredicto = (texto: string) => ({ historial: [{ revision: { texto } }] })
    const prosa = 'el scratchpad codifica el usuario como C--Users-<quien sea>-OneDrive'
    expect(sinRutasDeDisco(prosa), 'el saneado no tiene nada que hacer con esta frase').toBe(prosa)
    expect(fugasDeTanda(enVeredicto(prosa), sinRutasDeDisco)).not.toEqual([])
    // Y la forma de escribirla que NO lo despierta, que es la que hay que usar.
    const limpia = 'el scratchpad codifica el usuario en el nombre de la carpeta'
    expect(fugasDeTanda(enVeredicto(limpia), sinRutasDeDisco)).toEqual([])
  })

  it('el canario mira una copia de conflicto, no solo la tanda canónica', async () => {
    // Una copia de conflicto de OneDrive trae el mismo slug adentro, así que auditar por
    // `rutaTanda(slug)` miraba dos veces el archivo canónico y nunca la copia —que es la
    // que tiene el texto sin sanear—. Se recorre la carpeta.
    const { sinRutasDeDisco } = await import(MODULO_SANEADO)
    cola.escribirTanda(cola.crearTanda({ slug: '2026-W44', idea: 'limpia', piezas: PIEZAS_OK }))
    const copia = JSON.parse(readFileSync(path.join(dirTemporal, '2026-W44.json'), 'utf8'))
    copia.historial[0].nota = 'la lámina está en C:\\Users\\juan.perez\\out\\01.png'
    writeFileSync(path.join(dirTemporal, '2026-W44-DESKTOP-ABC.json'), JSON.stringify(copia))
    const { fugas, camposVistos } = fugasDeLaCarpeta(dirTemporal, sinRutasDeDisco)
    expect(fugas.join(' ')).toContain('2026-W44-DESKTOP-ABC.json')
    expect(fugas.filter((f) => f.startsWith('2026-W44.json'))).toEqual([])
    expect(camposVistos).toBeGreaterThan(0)
  })

  it('el perfil a la vieja usanza de Windows queda, y es el límite conocido', async () => {
    // Declarado, no arreglado. `C:\Documents and Settings\juan.perez` queda en
    // `[ruta local] and Settings\juan.perez`: `and` no es cola porque no lleva separador, y
    // el tramo suelto tiene el penúltimo que no es la raíz de los usuarios y el último que
    // no es un nombre de archivo, así que vuelve intacto. Las cuatro redes quedan ciegas,
    // la del punto fijo incluida.
    //
    // Se declara acá para que se lea como límite conocido y no como un olvido. Ensanchar la
    // adyacencia a un separador es empezar a comerse los "y/o" y los "9/18" de la prosa del
    // revisor, que cuesta más —el texto archivado es lo único que queda de su criterio—, y
    // las dos máquinas que revisan tienen el perfil en `C:\Users\`. Si este test se pone
    // rojo porque alguien ensanchó la red y ahora sí lo caza, bórralo: la fuga se arregló.
    const { sinRutasDeDisco } = await import(MODULO_SANEADO)
    const saneado = sinRutasDeDisco(String.raw`el veredicto está en C:\Documents and Settings\juan.perez`)
    expect(saneado).toContain('juan.perez')
    expect(sinRutasDeDisco(saneado), 'es punto fijo, así que esa red tampoco lo ve').toBe(saneado)
    expect(fugasDeTanda({ historial: [{ revision: { texto: saneado } }] }, sinRutasDeDisco)).toEqual([])
    // Con una carpeta abajo del usuario sí lo caza, aunque recién en el push.
    const conCarpeta = sinRutasDeDisco(String.raw`el veredicto está en C:\Documents and Settings\juan.perez\out`)
    expect(fugasDeTanda({ historial: [{ revision: { texto: conCarpeta } }] }, sinRutasDeDisco)).not.toEqual([])
  })

  it('rutaArchivable deja lo del repo relativo y de lo de afuera solo el nombre', async () => {
    const { rutaArchivable } = await import(MODULO_TANDA)
    expect(rutaArchivable(path.join(process.cwd(), 'out', 'rrss', 'veredicto.md'))).toBe(
      'out/rrss/veredicto.md',
    )
    const afuera = path.join(tmpdir(), 'sesion-de-quien-sea', 'veredicto.md')
    expect(rutaArchivable(afuera)).toBe('veredicto.md')
  })

  it('sinRutasDeDisco deja el nombre del archivo y no toca lo del repo', async () => {
    // La ruta del archivo ya la cuida `rutaArchivable`; esto es para el TEXTO, que es la
    // salida cruda de un agente al que el prompt le pasa rutas absolutas y que las cita
    // al decir dónde vio cada cosa.
    const { sinRutasDeDisco } = await import(MODULO_SANEADO)
    // Windows con backslashes es el caso de esta máquina, y el que una expresión escrita
    // de memoria pierde; `/home/...` es el de un runner de CI.
    expect(sinRutasDeDisco('la lámina C:\\Users\\quiensea\\out\\01.png va cortada')).toBe(
      'la lámina 01.png va cortada',
    )
    expect(sinRutasDeDisco('ver `C:/Users/quiensea/sesion/exp.md` y /home/runner/x/02.jpg')).toBe(
      'ver `exp.md` y 02.jpg',
    )
    // Una ruta del repo no dice nada de nadie y es información útil: se queda.
    expect(sinRutasDeDisco('out/rrss/anota-todos-ven/frames.json')).toBe(
      'out/rrss/anota-todos-ven/frames.json',
    )
  })

  it('una URL no es una ruta de disco, y un link del caption se archiva entero', async () => {
    const { sinRutasDeDisco } = await import(MODULO_SANEADO)
    // `s:/` de `https:/` calzaba como letra de unidad: el veredicto quedaba archivado
    // diciendo "el CTA manda a httpen-vivo". Corromper la evidencia es peor que no
    // sanear nada, porque el flag dice que se tocó pero no qué.
    const conLink = 'el CTA manda a https://golfersplus.vercel.app/en-vivo'
    expect(sinRutasDeDisco(conLink)).toBe(conLink)
    // Y una ruta disfrazada de URL sigue cayendo: la letra de unidad va tras una barra.
    expect(sinRutasDeDisco('file:///C:/Users/quiensea/out/01.png')).toBe('file:///01.png')
  })

  it('la ruta real de esta máquina tiene un espacio, y entre backticks se toma entera', async () => {
    const { sinRutasDeDisco } = await import(MODULO_SANEADO)
    // El repo vive en `...\Escritorio\Proyectos IA\tu-golf\...`, y la ruta absoluta que
    // el revisor recibe es esa. Cortando en el primer espacio se iba el nombre de
    // usuario pero quedaba `Proyectos IA\tu-golf\out\...`: cómo tiene ordenado el disco
    // quien revisó, que es la otra mitad de lo que no se publica. Los tres casos de
    // arriba usan rutas sin espacios, que no es la forma real.
    const real = 'C:\\Users\\quiensea\\OneDrive\\Escritorio\\Proyectos IA\\tu-golf\\out\\2026-W44.md'
    expect(sinRutasDeDisco(`ver \`${real}\` y listo`)).toBe('ver `2026-W44.md` y listo')
    // Sin delimitar, la primera pasada corta en el espacio y lo que queda con
    // backslashes es el resto de la ruta: la cola la resuelve `COLA_DE_RUTA` por
    // adyacencia a la marca. Se afirma el texto completo y no sólo qué no aparece: con
    // `not.toMatch` un `OneDrive\\Escritorio` sobreviviente pasaba igual de verde.
    expect(sinRutasDeDisco(`ver ${real} y listo`)).toBe('ver 2026-W44.md y listo')
  })

  it('una ruta que se agota en el home no archiva el nombre de usuario', async () => {
    const { sinRutasDeDisco } = await import(MODULO_SANEADO)
    // `ultimoTramo` devolvía el último tramo pase lo que pase, así que una cita que
    // termina en el home archivaba `quiensea`: exactamente el dato que esto protege,
    // y encima sin backslash ni letra de unidad que delaten la fuga en el canario.
    expect(sinRutasDeDisco('el veredicto está en C:\\Users\\quiensea')).toBe(
      'el veredicto está en [ruta local]',
    )
    expect(sinRutasDeDisco('quedó en /home/alguien')).toBe('quedó en [ruta local]')
    expect(sinRutasDeDisco('quedó en /Users/alguien')).toBe('quedó en [ruta local]')
    // Y el scratchpad de una sesión POSIX, que codifica el usuario en el nombre de la
    // carpeta: `/tmp/claude/C--Users-<quien sea>-OneDrive-.../`.
    expect(sinRutasDeDisco('lo dejé en /tmp/claude/C--Users-quiensea-OneDrive-x/out/a.md')).toBe(
      'lo dejé en a.md',
    )
    expect(sinRutasDeDisco('lo dejé en /var/folders/zz/T/claude-quiensea/out/a.md')).toBe(
      'lo dejé en a.md',
    )
  })

  it('un backslash en la prosa del revisor no es una ruta', async () => {
    const { sinRutasDeDisco } = await import(MODULO_SANEADO)
    // Un revisor hablando de cómo el caption separa los párrafos escribe `\n\n`, y la
    // pasada del backslash lo archivaba como `n`. Corromper el criterio es peor que
    // dejar una carpeta: el flag `texto_saneado` dice que se tocó, no qué.
    for (const prosa of [
      'el caption separa con `\\n\\n` entre párrafos',
      'el hashtag va escapado como \\#golf',
      'ganó 9\\18 hoyos',
    ]) {
      expect(sinRutasDeDisco(prosa)).toBe(prosa)
    }
    // Lo que sí es una ruta cortada en su espacio sigue cayendo, con UNC incluido.
    expect(sinRutasDeDisco(String.raw`ver IA\tu-golf\out\x.md`)).toBe('ver x.md')
    expect(sinRutasDeDisco(String.raw`está en \\servidor\compartido\out\a.md`)).toBe('está en a.md')
  })

  it('el punto con que termina la frase no arrastra la ruta entera', async () => {
    const { sinRutasDeDisco } = await import(MODULO_SANEADO)
    // Así escribe un revisor: la cita cierra la oración. Ese punto entraba al match, el
    // último tramo pasaba a ser `01.png.` —que no es un nombre de archivo— y el tramo se
    // archivaba tal cual: la estructura de carpetas con backslashes y todo.
    const real = 'C:\\Users\\quiensea\\OneDrive\\Escritorio\\Proyectos IA\\tu-golf\\out\\01.png'
    // Los seis cierres que acepta `PUNTUACION_FINAL`, no una muestra: la puntuación es
    // del revisor y vuelve a su lugar, así que la frase queda exactamente como la
    // escribió él.
    for (const cierre of ['.', ',', ';', ':', '!', '?']) {
      expect(sinRutasDeDisco(`la toma está en ${real}${cierre} y la otra no`)).toBe(
        `la toma está en 01.png${cierre} y la otra no`,
      )
    }
  })

  it('un nombre de usuario con punto no es un nombre de archivo', async () => {
    const { sinRutasDeDisco } = await import(MODULO_SANEADO)
    // `juan.perez` cumplía "termina en extensión corta", así que se archivaba entero: el
    // nombre de usuario, que es lo único que esta función existe para no publicar. Y el
    // canario no lo caza, porque ahí ya no queda backslash ni letra de unidad.
    expect(sinRutasDeDisco('el veredicto está en C:\\Users\\juan.perez')).toBe(
      'el veredicto está en [ruta local]',
    )
    // Windows crea el perfil `usuario.DOMINIO` cuando el nombre colisiona.
    expect(sinRutasDeDisco('quedó en `C:\\Users\\juanj.DESKTOP-ABC`')).toBe('quedó en `[ruta local]`')
    expect(sinRutasDeDisco('quedó en /home/juan.perez')).toBe('quedó en [ruta local]')
    // Y un usuario que se llama igual que un archivo: eso lo caza la regla del tramo
    // anterior, no la lista de extensiones.
    expect(sinRutasDeDisco(String.raw`ver C:\Users\juanj.md`)).toBe('ver [ruta local]')
    // Un archivo bajo el home de un usuario con punto sigue archivándose.
    expect(sinRutasDeDisco('ver /home/juan.perez/out/a.md')).toBe('ver a.md')
  })

  it('una URL con /tmp/ o /Users/ en el path no es una ruta de disco', async () => {
    const { sinRutasDeDisco } = await import(MODULO_SANEADO)
    // Los temporales de POSIX reabrieron el bug que el lookbehind había cerrado para la
    // letra de unidad: `https://ejemplo.com/tmp/foto.png` quedaba en
    // `https://ejemplo.comfoto.png`. Corromper el link de una pieza es peor que no
    // sanear nada, porque el flag dice que se tocó pero no qué.
    for (const url of [
      'el caption linkea https://ejemplo.com/tmp/foto.png',
      'y también https://ejemplo.com/Users/juanjo',
    ]) {
      expect(sinRutasDeDisco(url)).toBe(url)
    }
    // Y el scratchpad citado de verdad sigue cayendo, pegado a un paréntesis o a un espacio.
    expect(sinRutasDeDisco('(ver /tmp/claude/C--Users-quiensea-x/out/a.md)')).toBe('(ver a.md)')
  })

  it('un patrón con `\\.` no es un archivo llamado `.md`', async () => {
    const { sinRutasDeDisco } = await import(MODULO_SANEADO)
    // Prosa de un revisor hablando de un patrón, no de un archivo: el punto necesita un
    // carácter de nombre delante para contar como extensión.
    const prosa = 'el patrón es `\\w+\\.md` y nada más'
    expect(sinRutasDeDisco(prosa)).toBe(prosa)
  })

  it('la cola que quedó pegada a la marca no publica la estructura de carpetas', async () => {
    const { sinRutasDeDisco } = await import(MODULO_SANEADO)
    // La fuga que más costó ver. Cuando la ruta no llegaba a un archivo, la pasada de la
    // unidad dejaba la marca y lo que venía después del espacio se quedaba tal cual: la
    // estructura de carpetas entera. Pasaba en los tres casos más normales de todos.
    const base = 'C:\\Users\\quiensea\\OneDrive\\Escritorio\\Proyectos IA\\tu-golf'
    // 1 · la cita termina en una CARPETA, que es lo natural al decir dónde están las tomas.
    expect(sinRutasDeDisco(`las tomas están en ${base}\\out\\rrss\\anota-todos-ven`)).toBe(
      'las tomas están en [ruta local]',
    )
    // 2 · el archivo tiene una extensión que no está en la lista.
    expect(sinRutasDeDisco(`ver ${base}\\scripts\\algo.ps1`)).toBe('ver algo.ps1')
    // 3 · el tramo trae el número de línea pegado.
    expect(sinRutasDeDisco(`el bug está en ${base}\\scripts\\rrss\\tanda.mjs:347:12`)).toBe(
      'el bug está en tanda.mjs:347:12',
    )
    // Y cuando sí llegaba a un archivo, la marca sobra: la cita se lee mejor sin ella.
    expect(sinRutasDeDisco(`la lámina es ${base}\\out\\rrss\\01.png`)).toBe('la lámina es 01.png')
  })

  it('el número de línea con que el revisor cita un archivo se conserva', async () => {
    const { sinRutasDeDisco } = await import(MODULO_SANEADO)
    // Señalar `archivo:línea` es la forma normal de decir dónde está algo. Sin partir ese
    // sufijo el tramo no calzaba como nombre de archivo y la cita quedaba en
    // `[ruta local]`: se perdían el archivo Y la línea, o sea justo el dato por el que el
    // revisor la escribió.
    const base = 'C:\\Users\\quiensea\\OneDrive\\Escritorio\\Proyectos IA\\tu-golf'
    expect(sinRutasDeDisco(`el bug está en \`${base}\\scripts\\rrss\\tanda.mjs:347\``)).toBe(
      'el bug está en `tanda.mjs:347`',
    )
    // Con la puntuación de la frase encima, cada cosa vuelve a su lugar.
    expect(sinRutasDeDisco(`mira ${base}\\scripts\\rrss\\cola.mjs:12.`)).toBe('mira cola.mjs:12.')
  })

  it('la ruta del scratchpad abreviada con puntos suspensivos también cae', async () => {
    const { sinRutasDeDisco } = await import(MODULO_SANEADO)
    // Un revisor abrevia la ruta larga del scratchpad. Con el punto en el lookbehind esa
    // cita salía intacta —y el usuario va codificado en el nombre de la carpeta— sin que
    // ningún canario la viera: ahí no queda letra de unidad ni backslash.
    expect(
      sinRutasDeDisco('la toma está en .../tmp/claude/C--Users-quiensea-OneDrive/out/01.png'),
    ).toBe('la toma está en ...01.png')
    // Un `file:` con una sola barra es forma válida de escribirlo, y también salía intacto.
    expect(sinRutasDeDisco('ver file:/home/quiensea/out/a.md')).toBe('ver file:a.md')
  })

  it('la prosa con una barra normal pegada a la marca no se la come', async () => {
    const { sinRutasDeDisco } = await import(MODULO_SANEADO)
    // La cola se decide por adyacencia a la marca, y justo después de una marca puede
    // venir prosa: el criterio pide además un backslash o un nombre de archivo. Comerse
    // una palabra del revisor es peor que dejar una carpeta, porque el flag
    // `texto_saneado` dice que se tocó pero no qué.
    expect(sinRutasDeDisco('las tomas están en C:\\Users\\quiensea\\out y/o en la nube')).toBe(
      'las tomas están en [ruta local] y/o en la nube',
    )
    expect(sinRutasDeDisco('la foto de C:\\Users\\quiensea\\out 9/18 hoyos')).toBe(
      'la foto de [ruta local] 9/18 hoyos',
    )
  })

  it('no se come el `\\n\\n` que el revisor escribió después de la ruta', async () => {
    const { sinRutasDeDisco } = await import(MODULO_SANEADO)
    // Esto se archivaba mal en UNA sola aplicación, y es texto del revisor perdido: una
    // ruta que termina en el nombre de usuario deja la marca sola, y lo que venía después
    // —el `\n\n` con que se explica cómo separa los párrafos el caption— pasaba a ser "la
    // cola de la ruta" por pura vecindad. El flag `texto_saneado` dice que se tocó, no qué
    // se perdió, así que nadie lo iba a notar.
    expect(sinRutasDeDisco('el veredicto en C:\\Users\\juan.perez `\\n\\n` separa')).toBe(
      'el veredicto en [ruta local] `\\n\\n` separa',
    )
    expect(sinRutasDeDisco('el home Users\\juan.perez \\n\\n separa')).toBe(
      'el home [ruta local] \\n\\n separa',
    )
    expect(sinRutasDeDisco('quedó en /home/juan.perez \\n\\n y sigue')).toBe(
      'quedó en [ruta local] \\n\\n y sigue',
    )
  })

  it('aplicarla dos veces da lo mismo que aplicarla una', async () => {
    const { sinRutasDeDisco } = await import(MODULO_SANEADO)
    // Son cuatro pasadas y la de la cola va en bucle: si alguna pudiera morder su propia
    // salida, el texto se seguiría degradando en cada vuelta y el veredicto archivado
    // dependería de cuántas veces se guardó.
    //
    // Y además es la invariante sobre la que está hecho el canario de las tandas, que
    // pregunta `sinRutasDeDisco(archivado) === archivado`: si la función deja de ser punto
    // fijo, el pre-push se pone rojo sobre una tanda limpia y sin salida, porque el texto
    // ya está commiteado. Los cuatro últimos casos son los que lo rompían: la marca que
    // escribe la pasada de los tramos sueltos no volvía a pasar por la de la cola.
    const base = 'C:\\Users\\quiensea\\OneDrive\\Escritorio\\Proyectos IA\\tu-golf'
    for (const texto of [
      `la lámina ${base}\\out\\01.png va cortada.`,
      `las tomas están en ${base}\\out\\rrss\\anota-todos-ven`,
      `el bug está en \`${base}\\scripts\\rrss\\tanda.mjs:347\``,
      'la toma está en .../tmp/claude/C--Users-quiensea/out/01.png',
      'el veredicto está en C:\\Users\\juan.perez',
      'el caption linkea https://ejemplo.com/tmp/foto.png',
      'el caption separa con `\\n\\n` los párrafos y el hashtag es \\#golf',
      'las tomas están en C:\\Users\\quiensea\\out y/o en la nube',
      'el home Users\\juan.perez \\n\\n separa',
      'la carpeta Users\\quiensea y el caption con \\n\\n',
      'Users\\juan.perez out/fotos/01.png',
      `${base} \\n\\n y sigue`,
    ]) {
      const una = sinRutasDeDisco(texto)
      expect(sinRutasDeDisco(una), `no es idempotente: ${texto}`).toBe(una)
    }
  })

  it('el punto fijo aguanta un corpus generado, no solo los casos que ya rompieron', async () => {
    const { sinRutasDeDisco } = await import(MODULO_SANEADO)
    // Los casos del test de arriba son los que rompieron alguna vez; este es el control de
    // los que todavía no. El punto fijo es la invariante sobre la que está hecho el canario
    // de las tandas, y lo que lo rompe es siempre lo mismo: una pasada que muerde la marca
    // que escribió otra. Eso aparece cuando los fragmentos se pegan en un orden que nadie
    // escribió a mano, así que acá se pegan todos contra todos.
    //
    // Determinista a propósito —PRNG con semilla fija, no `Math.random()`—: un test que
    // falla una vez de cada cien no se puede arreglar, y el mensaje imprime el texto
    // entero para reproducirlo sin la semilla.
    //
    // Y vigila de verdad: sacándole al saneado la segunda pasada de la cola —la rotura que
    // motivó todo esto— deja de ser punto fijo en 18 de estos 2.000 textos, medido con esta
    // lista de fragmentos y esta semilla. (La primera versión de este corpus no la cazaba
    // en ninguno: le faltaban el fragmento `Users\juan.perez` suelto, que es el único
    // camino por el que la pasada de los tramos sueltos le deja una cola a la siguiente, y
    // el separador vacío.)
    //
    // Lo que NO caza es un cambio de criterio que siga siendo punto fijo: probados tres
    // —un tramo suelto que termine en carpeta dejando la marca, `finalDeRuta` metido en el
    // bucle de la cola, y las pasadas 3 y 4 invertidas—, los tres lo dejan verde. Los tres
    // los cazan los casos escritos a mano de este archivo: 5, 2 y 8 tests rojos
    // respectivamente, corridos de a uno contra el saneado real. Esto cubre la invariante,
    // no el criterio.
    const FRAGMENTOS = [
      String.raw`C:\Users\quiensea\OneDrive\Escritorio\Proyectos IA\tu-golf\out\01.png`,
      String.raw`C:\Users\juan.perez`,
      String.raw`C:\Users\juanj.DESKTOP-ABC\out\rrss`,
      String.raw`Users\quiensea\out`,
      // El tramo suelto que `finalDeRuta` convierte en marca —el penúltimo es la raíz de
      // los usuarios—, que es el único camino por el que esa pasada le deja una cola a la
      // siguiente. Sin este fragmento el corpus no caza ninguna rotura del punto fijo:
      // está acá por eso, no por variedad.
      String.raw`Users\juan.perez`,
      String.raw`Proyectos IA\tu-golf\out`,
      String.raw`IA\tu-golf\scripts\rrss\tanda.mjs:347`,
      String.raw`\\servidor\compartido\out\a.md`,
      String.raw`\out\rrss`,
      '/out/rrss',
      '`' + String.raw`C:\Users\quiensea\Proyectos IA\tu-golf\out\04.png` + '`',
      '/home/quiensea/out/02.png',
      '/tmp/claude/C--Users-quiensea/out',
      '.../tmp/claude/C--Users-quiensea/out/01.png',
      '/mnt/c/Users/quiensea/out',
      'file:///C:/Users/quiensea/out/03.png',
      'https://golfersplus.vercel.app/en-vivo',
      'https://ejemplo.com/tmp/foto.png',
      'out/fotos/01.png',
      String.raw`\n\n`,
      String.raw`\#golf`,
      String.raw`\*negrita\*`,
      String.raw`\w+\.md`,
      String.raw`9\18`,
      'y/o',
      'la lámina va cortada,',
      'el veredicto dice que',
      '¿y el caption?',
      'el CTA manda a',
      'esa es la toma.',
      '(ver ahí)',
      '"entre comillas"',
    ]
    // Mulberry32: cuatro líneas y reproducible en cualquier máquina. No hace falta más.
    let estado = 20261030
    const azar = () => {
      estado = (estado + 0x6d2b79f5) | 0
      let t = Math.imul(estado ^ (estado >>> 15), 1 | estado)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    // Los separadores también importan: la cola se decide por adyacencia a la marca, así
    // que el pegado sin espacio y el que viene después de una coma son textos distintos
    // para esta función, no variantes del mismo.
    const SEPARADORES = [' ', ' ', ' ', '', ', ', ': ']
    const unFragmento = () => FRAGMENTOS[Math.floor(azar() * FRAGMENTOS.length)]
    let tocados = 0
    for (let i = 0; i < 2000; i += 1) {
      const cuantos = 2 + Math.floor(azar() * 4)
      let texto = ''
      for (let p = 0; p < cuantos; p += 1) {
        if (p) texto += SEPARADORES[Math.floor(azar() * SEPARADORES.length)]
        texto += unFragmento()
      }
      const una = sinRutasDeDisco(texto)
      expect(sinRutasDeDisco(una), `no es punto fijo (texto ${i}): ${texto}`).toBe(una)
      if (una !== texto) tocados += 1
    }
    // Y la cardinalidad: sin esto el test pasaría igual con un corpus que no tiene ninguna
    // ruta —todo punto fijo trivialmente—, que es la forma en que este control se muere sin
    // avisar si alguien toca la lista de fragmentos. El piso es la mitad del corpus, y no
    // el número de hoy (1.530 de 2.000, porque buena parte de los fragmentos es prosa a
    // propósito):
    // lo que tiene que seguir siendo cierto es que la mayoría de los textos SE SANEAN, no
    // que se saneen exactamente tantos.
    expect(tocados).toBeGreaterThan(1000)
  })

  it('la puntuación de la frase vuelve aunque la ruta no llegue a un archivo', async () => {
    const { sinRutasDeDisco } = await import(MODULO_SANEADO)
    // Al separar el número de línea de la puntuación, las ramas que dejan la marca sola
    // se quedaron sin re-pegarla: la oración se pegaba a la siguiente, y con una
    // interrogación quedaba el signo de apertura colgado. El número de línea sí se va con
    // el archivo —si el archivo no se nombra, `:347` no señala nada—.
    const base = 'C:\\Users\\quiensea\\OneDrive\\Escritorio\\Proyectos IA\\tu-golf'
    expect(sinRutasDeDisco(`la lámina está cortada en ${base}\\out\\rrss\\anota-todos-ven.`)).toBe(
      'la lámina está cortada en [ruta local].',
    )
    expect(sinRutasDeDisco(`¿está en ${base}\\out?`)).toBe('¿está en [ruta local]?')
    expect(sinRutasDeDisco(`ver ${base}\\out:`)).toBe('ver [ruta local]:')
    // Y en la rama del nombre de usuario, que es la otra que deja la marca sola.
    expect(sinRutasDeDisco('el veredicto quedó en C:\\Users\\juan.perez.')).toBe(
      'el veredicto quedó en [ruta local].',
    )
  })

  it('una ruta con DOS espacios necesita dos vueltas de la pasada de la cola', async () => {
    const { sinRutasDeDisco } = await import(MODULO_SANEADO)
    // Esta es la que obliga al bucle: con un solo `.replace` la primera vuelta deja la
    // cola del segundo espacio pegada a la marca y se publica igual. Todas las rutas de
    // los otros casos tienen un espacio (`Proyectos IA`), así que resuelven en una vuelta
    // y no discriminan nada.
    const dos = 'C:\\Users\\quiensea\\OneDrive\\Proyectos IA\\tu golf'
    expect(sinRutasDeDisco(`ver ${dos}\\out\\01.png`)).toBe('ver 01.png')
    expect(sinRutasDeDisco(`ver ${dos}\\out`)).toBe('ver [ruta local]')
  })

  it('una cita que necesita muchas vueltas se sanea en vez de trabar la tanda', async () => {
    const { sinRutasDeDisco } = await import(MODULO_SANEADO)
    // El tope del bucle era un límite ajustado —diez— y la última pasada es la que
    // CONFIRMA que no quedó nada, así que el techo de lo que se podía sanear eran nueve
    // tramos con espacio. Con la ruta de abajo el saneado llegaba al resultado correcto y
    // levantaba igual, de forma determinista: la tanda quedaba trabada hasta que alguien
    // editara el texto del revisor. El tope es el freno para un bug en la aritmética de
    // la cola, no para una ruta rara, y por eso ahora está donde no lo alcanza una cita
    // escrita a mano.
    const tramos = Array.from({ length: 12 }, (_, i) => `carpeta ${i}`).join('\\')
    expect(sinRutasDeDisco(`ver C:\\Users\\quiensea\\${tramos}\\01.png`)).toBe('ver 01.png')
    // Y la rama que no llega a un archivo. El último tramo va sin espacio a propósito: si
    // lo tuviera quedaría su palabra final suelta (`[ruta local] 11`), que es el límite
    // que esta función declara —no se come palabras de la frase para adivinar carpetas—.
    expect(sinRutasDeDisco(`ver C:\\Users\\quiensea\\${tramos}\\out`)).toBe('ver [ruta local]')
  })

  it('el disco de Windows escrito en forma POSIX también cae', async () => {
    const { sinRutasDeDisco } = await import(MODULO_SANEADO)
    // `/c/Users/` y `/mnt/c/Users/` es como muestra las rutas un shell POSIX sobre
    // Windows, que es la herramienta con la que se mira el repo: un revisor las cita tal
    // cual. Salían intactas con el nombre de usuario, porque no hay letra de unidad con
    // dos puntos y antes de `/Users/` está pegada la letra del disco.
    expect(sinRutasDeDisco('en /mnt/c/Users/quiensea/out/01.png')).toBe('en 01.png')
    expect(sinRutasDeDisco('corrí `ls /c/Users/quiensea/out/a.md`')).toBe('corrí `ls a.md`')
    // Una URL con esa forma en el path sigue intacta: ahí el carácter pegado a la barra es
    // el del host.
    expect(sinRutasDeDisco('ver https://ejemplo.com/c/Users/quiensea/foto.png')).toBe(
      'ver https://ejemplo.com/c/Users/quiensea/foto.png',
    )
  })

  it('las extensiones que produce este pipeline conservan el nombre del archivo', async () => {
    const { sinRutasDeDisco } = await import(MODULO_SANEADO)
    // Fuera de la lista, la cita se pierde entera (`[ruta local]`): es el lado seguro,
    // pero perder el nombre del subtítulo o del audio del reel es perder justo el dato por
    // el que el revisor lo citó.
    const out = 'C:\\Users\\quiensea\\OneDrive\\Escritorio\\Proyectos IA\\tu-golf\\out'
    expect(sinRutasDeDisco(`los subtítulos en ${out}\\cap.srt`)).toBe('los subtítulos en cap.srt')
    expect(sinRutasDeDisco(`el audio ${out}\\voz.mp3`)).toBe('el audio voz.mp3')
    expect(sinRutasDeDisco(`la lámina ${out}\\01.avif`)).toBe('la lámina 01.avif')
  })

  it('dos rutas en la misma frase se sanean las dos', async () => {
    const { sinRutasDeDisco } = await import(MODULO_SANEADO)
    // Comparar dos tomas en una frase es normal, y la pasada de la cola corre en bucle: si
    // se quedara en el primer match, la segunda ruta se publicaría entera.
    const base = 'C:\\Users\\quiensea\\OneDrive\\Proyectos IA\\out'
    expect(sinRutasDeDisco(`${base} ${base}`)).toBe('[ruta local] [ruta local]')
    expect(sinRutasDeDisco(`${base}\\01.png ${base}\\02.png`)).toBe('01.png 02.png')
  })
})
/**
 * Las dos huellas: la que el expediente imprime para que el revisor la copie, y la
 * que el portón recalcula antes de mandar la tanda.
 *
 * Tienen que ser el mismo número y hoy lo son porque comparten `selloDeEntradas`.
 * Nada lo ataba: con `huellaDeLoRevisado` devolviendo una constante, toda la suite
 * seguía verde —y el sistema aprobando cualquier versión de cualquier tanda—. Si se
 * separan por el otro lado, el flujo queda pidiendo revisar lo que ya se revisó,
 * porque la huella nunca calza.
 */
describe('la huella del expediente es la que el portón exige', () => {
  const REEL = '2026-10-27-anota-todos-ven'
  const ENTRADAS = [
    { pieza: REEL, rol: 'central' },
    { pieza: CARRUSEL, rol: 'derivado' },
  ]

  /**
   * Deja en disco una tanda completa: el carrusel renderizado y el reel con su toma,
   * su MP4 y el manifiesto que `montar.mjs` sella.
   *
   * `video.json` va SIN duración a propósito: lo que estos casos miran es la huella,
   * y una duración que no calce con la de los frames haría que el expediente —con
   * razón— dijera que el MP4 es de otra versión en vez de pintar la tabla.
   */
  async function sembrarTanda({
    cambiosReel = {},
    ms = 1500,
  }: { cambiosReel?: Record<string, unknown>; ms?: number } = {}) {
    const { huellaVisual } = await import(MODULO_MARCA)
    const { selloDelVideo } = await import('../../../scripts/rrss/montar.mjs')
    const reel = sembrarPieza(REEL, cambiosReel)
    await sembrarRender(reel)
    await sembrarRender(sembrarPieza(CARRUSEL))
    const escena = reel.escena as string
    const dirEscena = path.join(dirSalida, escena)
    mkdirSync(path.join(dirEscena, 'frames'), { recursive: true })
    writeFileSync(path.join(dirEscena, 'frames', '0000.jpg'), 'jpg')
    const frames = [{ archivo: '0000.jpg', ms, nota: 'marcador-antes' }]
    writeFileSync(path.join(dirEscena, 'frames.json'), JSON.stringify({ slug: escena, frames }))
    writeFileSync(path.join(dirEscena, `${escena}.mp4`), 'mp4')
    // El manifiesto se arma con `selloDelVideo`, el mismo que usa `montar.mjs`, y no a
    // mano: lo que estos casos prueban es que lo que el montaje sella es lo que el
    // expediente y el empaquetado recalculan. Escrito a mano, el fixture puede quedar
    // calzando con los lectores mientras `montar.mjs` sella otra cosa —y ese fue el bug.
    writeFileSync(
      path.join(dirEscena, 'video.json'),
      JSON.stringify(selloDelVideo(escena, frames, { pieza: reel.slug, huella_visual: huellaVisual(reel) })),
    )
  }

  /** La huella tal cual sale impresa en el expediente, extraída del texto. */
  async function huellaDelExpediente() {
    const { expedienteDeTanda } = await import('../../../scripts/rrss/expediente-pieza.mjs')
    const texto: string = expedienteDeTanda({ idea: 'Uno anota, todos ven', piezas: ENTRADAS })
    const linea = texto.split(/\r?\n/).find((l) => /^\s*Huella:/.test(l))
    expect(linea, 'el expediente tiene que imprimir la huella para copiarla').toBeDefined()
    return (linea as string).replace(/^\s*Huella:\s*/, '').trim()
  }

  /** La huella que `armarYEnviar` va a exigirle al veredicto. */
  async function huellaDelPorton() {
    const { huellaDeLoRevisado } = await import(MODULO_MARCA)
    const { prepararEnvio, selloDeEntradas } = await import(MODULO_TANDA)
    return huellaDeLoRevisado(selloDeEntradas(ENTRADAS, prepararEnvio(ENTRADAS).piezas))
  }

  it('calzan sobre la tanda del lanzamiento', async () => {
    await sembrarTanda()
    const delExpediente = await huellaDelExpediente()
    expect(delExpediente).toMatch(/^[0-9a-f]{12}$/)
    expect(delExpediente).toBe(await huellaDelPorton())
  })

  it('se mueven las dos si se corrige el caption', async () => {
    // El camino real: Juanjo pide un cambio, se corrige el caption y se reusa el
    // archivo del PUBLICAR de ayer. Si la huella no se moviera, nadie revisó lo
    // que salió.
    await sembrarTanda()
    const antes = await huellaDelExpediente()
    await sembrarTanda({ cambiosReel: {
        caption:
          'Otro caption para el mismo reel.\n\nAnota tu próxima ronda en Golfers+. Link en la bio.',
      } })
    const despues = await huellaDelExpediente()
    expect(despues).not.toBe(antes)
    expect(despues).toBe(await huellaDelPorton())
  })

  it('se mueven las dos si se corrige una lámina', async () => {
    await sembrarTanda()
    const antes = await huellaDelExpediente()
    const laminas = (piezaReal(REEL).laminas as Array<Record<string, unknown>>).map((l, i) =>
      i === 0 ? { ...l, titular: 'Otro titular en el cierre.' } : l,
    )
    await sembrarTanda({ cambiosReel: { laminas } })
    const despues = await huellaDelExpediente()
    expect(despues).not.toBe(antes)
    expect(despues).toBe(await huellaDelPorton())
  })

  it('se mueven las dos si se vuelve a capturar con otros tiempos', async () => {
    // Es donde un reel cambia sin que cambie el JSON de la pieza: mismo caption,
    // mismas láminas, otro ritmo. Sin los fotogramas en la huella, el PUBLICAR de
    // la toma anterior seguiría valiendo para un video que ya no es ese.
    await sembrarTanda()
    const antes = await huellaDelExpediente()
    await sembrarTanda({ ms: 2600 })
    const despues = await huellaDelExpediente()
    expect(despues).not.toBe(antes)
    expect(despues).toBe(await huellaDelPorton())
  })

  it('con todo coherente, la tabla SÍ se pinta', async () => {
    // El contrapeso de los tres casos de abajo. Un control que falla cerrado tapa la
    // tabla, y el único síntoma de que lo hace mal es que el revisor no ve nada que
    // revisar: ningún test rojo, ningún error. Pasó: `montar.mjs` sella la huella de
    // `frames.json` y el expediente la calculaba sobre los frames CON el fotograma del
    // cierre empujado, así que no calzaban nunca y la tabla no se pintaba jamás.
    await sembrarTanda()
    const { expedienteDeTanda } = await import('../../../scripts/rrss/expediente-pieza.mjs')
    const texto: string = expedienteDeTanda({ idea: 'Uno anota, todos ven', piezas: ENTRADAS })
    expect(texto).toMatch(/momento a momento[\s\S]*\| Dura \|/)
    expect(texto).not.toMatch(/otra toma|no está montado|otra versión de la escena|todavía no sellaba/)
  })

  it('con la escena corregida y sin recapturar, nadie pinta la tabla ni manda la tanda', async () => {
    // Los tres artefactos se desincronizan solos: escena (código), captura
    // (frames.json) y MP4. El expediente armaba la tabla con la captura vieja y la
    // escena de ahora, y del MP4 solo miraba que existiera: el revisor juzgaba el
    // ritmo de un video que ya no existe y su PUBLICAR valía igual.
    await sembrarTanda()
    const escenas = (await import('../../../scripts/rrss/escenas.mjs')).ESCENAS as Record<
      string,
      { jugadores: Array<{ golpes: number[] }> }
    >
    const golpes = escenas['anota-todos-ven'].jugadores[0].golpes
    const original = golpes[0]
    golpes[0] = original + 1
    try {
      const { expedienteDeTanda } = await import('../../../scripts/rrss/expediente-pieza.mjs')
      const texto: string = expedienteDeTanda({ idea: 'Uno anota, todos ven', piezas: ENTRADAS })
      expect(texto).toMatch(/otra versión de la escena/)
      expect(texto).not.toMatch(/momento a momento[\s\S]*\| Dura \|/)
      // Y el portón tampoco la manda: el MP4 en disco es de la versión anterior.
      const { prepararEnvio } = await import(MODULO_TANDA)
      expect(() => prepararEnvio(ENTRADAS)).toThrow(/cambió después de montarse/i)
    } finally {
      golpes[0] = original
    }
  })
  it('el expediente mismo no sirve como veredicto', async () => {
    // El expediente imprime la línea del formato (`Veredicto: PUBLICAR`) y la huella de
    // ESTA misma tanda, y queda en la carpeta vecina a la del veredicto, con un nombre
    // parecido. Si el portón lo acepta, un tab-complete —o una sesión que retoma con la
    // ruta que el script imprimió— manda la tanda al teléfono de Juanjo con la nota
    // "revisión independiente: PUBLICAR" sin que nadie haya revisado nada. El control
    // falla ABIERTO, que es lo único que no se puede permitir en un portón.
    await sembrarTanda()
    const { expedienteDeTanda } = await import('../../../scripts/rrss/expediente-pieza.mjs')
    const texto: string = expedienteDeTanda({ idea: 'Uno anota, todos ven', piezas: ENTRADAS })
    const ruta = path.join(dirSalida, 'piezas-tanda.md')
    writeFileSync(ruta, texto)
    const { veredictoDeRevision } = await import(MODULO_TANDA)
    const huella = await huellaDelPorton()
    // Con el mensaje, y no un `toThrow()` pelado: el portón tiene dos capas que cazan
    // esto (el encabezado y la línea del formato que el expediente imprime como
    // ejemplo), y sin exigir cuál saltó, el día que el expediente gane una línea antes
    // del título la primera muere en silencio y el test sigue verde por la segunda.
    expect(() => veredictoDeRevision(ruta, huella)).toThrow(/es el EXPEDIENTE de la tanda/)
  })
})
