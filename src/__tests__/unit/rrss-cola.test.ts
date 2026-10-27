// La cola de RRSS tiene una sola garantía dura: nada llega a publicarse sin que
// Juanjo lo haya aprobado. Todo lo demás del sistema (render, captions, horas) se
// puede corregir después de publicar; eso no.
//
// Por eso lo que se prueba acá no es "los estados existen" sino que NO exista un
// camino de `borrador` a `publicada` sin pasar por `aprobada`, y que el
// empaquetador —que se puede correr suelto desde la terminal— se niegue por su
// cuenta en vez de confiar en que alguien validó antes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const MODULO_COLA = '../../../scripts/rrss/cola.mjs'
const MODULO_APROBACION = '../../../scripts/rrss/aprobacion.mjs'
const MODULO_MARCA = '../../../scripts/rrss/marca.mjs'
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
  historial: Array<{ estado: string; cuando: string; nota: string }>
  aprobada_por?: string
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
    const texto = resumenDeTanda(tanda, {
      '2026-10-27-anota-todos-ven': { formato: 'reel', caption: 'Anota. Todos ven lo mismo.', hashtags: ['#golfchile'] },
    })
    // Sin el caption en la vista previa hay que abrir archivos para aprobar, y una
    // aprobación que cuesta trabajo se posterga.
    expect(texto).toContain('Anota. Todos ven lo mismo.')
    expect(texto).toContain('#golfchile')
    expect(texto).toContain('La idea de la semana')
    expect(texto).toContain('2026-10-28T19:00:00-03:00')
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

    await expect(
      armarYEnviar({
        idea: 'A',
        entradas: [{ pieza: CARRUSEL, rol: 'central' }],
        slug: '2026-W44',
        env: { NODE_ENV: 'test' },
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
    })
    expect(tanda.estado).toBe('en_revision')
    expect(tanda.aprobada_por).toBeUndefined()
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

describe('solo el chat de Juanjo manda', () => {
  it('ignora un toque que viene de otro chat', async () => {
    const { esDeJuanjo } = await import(MODULO_TELEGRAM)
    const creds = { token: 't', chatId: '123' }
    // Los callback_data son adivinables y el bot le responde a cualquiera que le
    // escriba: sin este filtro, un desconocido aprueba una publicación.
    expect(esDeJuanjo({ deChat: '123' }, creds)).toBe(true)
    expect(esDeJuanjo({ deChat: '999' }, creds)).toBe(false)
    expect(esDeJuanjo({ deChat: '' }, creds)).toBe(false)
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
   * Deja en disco lo que montar.mjs y render.mjs dejarían, y limpia después.
   *
   * Escribe en una carpeta temporal (`RRSS_DIR_SALIDA`), nunca en `out/rrss/`:
   * esta prueba borra lo que crea, y la pieza y la escena que usa son las de
   * verdad, así que sin el override el `finally` se llevaría puesto el reel que
   * estuviera montado.
   */
  async function conDiscoDeUnReel(
    fn: (p: Record<string, unknown>) => void | Promise<void>,
    { video = true, manifiestoVideo = true, huellaVieja = false, cierreViejo = false } = {},
  ) {
    const { huellaVisual } = await import(MODULO_MARCA)
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
    try {
      writeFileSync(path.join(dirPieza, '01.png'), 'png-de-la-lamina-de-cierre')
      writeFileSync(
        path.join(dirPieza, 'publicacion.json'),
        JSON.stringify({ slug: PIEZA_REEL.slug, laminas: [laminaRel], huella_visual: huellaVisual(PIEZA_REEL) }),
      )
      if (video) writeFileSync(path.join(dirEscena, `${PIEZA_REEL.escena}.mp4`), 'mp4-del-reel')
      if (manifiestoVideo)
        writeFileSync(
          path.join(dirEscena, 'video.json'),
          JSON.stringify({
            escena: PIEZA_REEL.escena,
            huella_escena: huellaVieja ? '0000000000000000' : huellaEscena(PIEZA_REEL.escena),
            cierre: {
              pieza: PIEZA_REEL.slug,
              huella_visual: cierreViejo
                ? huellaVisual({ ...PIEZA_REEL, laminas: [{ plantilla: 'cierre', titular: 'otro titular' }] })
                : huellaVisual(PIEZA_REEL),
            },
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

  it('se niega si el manifiesto del video no dice nada de la lámina de cierre', async () => {
    // Un video.json de antes de que existiera el sello. "Ausente" no puede pasar
    // por "igual": es justo el caso que no se puede verificar.
    const { mediosDePieza, videoDePieza } = await import('../../../scripts/rrss/publicar.mjs')
    await conDiscoDeUnReel(async (pieza) => {
      const { huellaEscena } = await import('../../../scripts/rrss/escenas.mjs')
      writeFileSync(
        path.join(process.env.RRSS_DIR_SALIDA as string, PIEZA_REEL.escena, 'video.json'),
        JSON.stringify({ escena: PIEZA_REEL.escena, huella_escena: huellaEscena(PIEZA_REEL.escena) }),
      )
      expect(() => videoDePieza(pieza)).toThrow(/lámina de cierre[\s\S]*ausente/i)
      expect(() => mediosDePieza(pieza)).toThrow(/lámina de cierre/i)
    })
  })

  it('rechaza un nombre de escena que se saldría de out/rrss', async () => {
    const { videoDePieza } = await import('../../../scripts/rrss/publicar.mjs')
    for (const escena of ['../../etc', 'anota/../..', 'Anota-Todos-Ven']) {
      expect(() => videoDePieza({ slug: '2026-10-27-x', escena }), escena).toThrow(/inseguro/i)
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
})
