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
  rutaTanda: (slug: string) => string
}

let dirTemporal: string
let cola: Cola

const PIEZAS_OK: EntradaTanda[] = [
  { pieza: '2026-10-27-anota-todos-ven', rol: 'central', hora_sugerida: '2026-10-28T19:00:00-03:00' },
  { pieza: '2026-10-27-donde-se-van-los-golpes', rol: 'derivado' },
]

beforeEach(async () => {
  dirTemporal = mkdtempSync(path.join(tmpdir(), 'rrss-cola-'))
  vi.stubEnv('RRSS_DIR_TANDAS', dirTemporal)
  vi.resetModules()
  cola = (await import(MODULO_COLA)) as unknown as Cola
})

afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(dirTemporal, { recursive: true, force: true })
})

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
    // vitest corre desde la raíz del proyecto, que es la misma raíz que resuelve
    // publicar.mjs para buscar out/rrss/.
    const dirSalida = path.join(process.cwd(), 'out', 'rrss', pieza.slug)
    mkdirSync(dirSalida, { recursive: true })
    try {
      writeFileSync(
        path.join(dirSalida, 'publicacion.json'),
        JSON.stringify({
          slug: pieza.slug,
          laminas: [],
          huella_visual: huellaVisual({ ...pieza, laminas: [{ plantilla: 'cierre', titular: 'viejo' }] }),
        }),
      )
      expect(() => mediosDePieza(pieza)).toThrow(/cambió después de renderizarse/i)
      // Con la huella correcta el que falla es otro control (no hay láminas), no este.
      writeFileSync(
        path.join(dirSalida, 'publicacion.json'),
        JSON.stringify({ slug: pieza.slug, laminas: [], huella_visual: huellaVisual(pieza) }),
      )
      expect(() => mediosDePieza(pieza)).toThrow(/no tiene nada que subir/i)
    } finally {
      rmSync(dirSalida, { recursive: true, force: true })
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
    { video = true, manifiestoVideo = true, huellaVieja = false } = {},
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
    for (const t of real.listarTandas()) {
      expect(real.ESTADOS, `tanda ${t.slug}`).toContain(t.estado)
      expect(t.slug).toMatch(real.SLUG_TANDA)
      expect(t.piezas.length, `tanda ${t.slug} sin piezas`).toBeGreaterThan(0)
      expect(t.historial.at(-1)?.estado, `tanda ${t.slug}: historial y estado no calzan`).toBe(t.estado)
      for (const p of t.piezas) {
        const ruta = path.join(process.cwd(), 'scripts', 'rrss', 'piezas', `${p.pieza}.json`)
        expect(() => readFileSync(ruta, 'utf8'), `tanda ${t.slug}: la pieza ${p.pieza} no existe`).not.toThrow()
      }
    }
  })
})
