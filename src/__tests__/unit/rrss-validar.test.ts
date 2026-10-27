// Los controles de marca de una pieza de Instagram son lo único que corre ANTES de
// que alguien la mire. Si no cazan nada, la revisión humana recibe basura.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
// Módulo .mjs compartido con los scripts de render.
import { validarPieza } from '../../../scripts/rrss/validar.mjs'
import { CLAVES, direccion } from '../../../scripts/rrss/plantillas/index.mjs'
import {
  FORMATOS_LISTOS,
  MEDIDA,
  SLUG_PIEZA,
  carasDeSpec,
  familiasConPesos,
} from '../../../scripts/rrss/marca.mjs'

const RUTA_PIEZA = 'scripts/rrss/piezas/2026-10-27-donde-se-van-los-golpes.json'
const pieza = () => JSON.parse(readFileSync(RUTA_PIEZA, 'utf8'))

describe('controles de marca de una pieza de RRSS', () => {
  it('la pieza que está en el repo pasa todos los controles', () => {
    const p = pieza()
    expect(p.laminas.length).toBe(6) // sin esto el test pasaría con una pieza vacía
    expect(validarPieza(p)).toEqual([])
  })

  it('caza una portada más larga que siete palabras', () => {
    const p = pieza()
    p.laminas[0].titular = 'Esta portada tiene claramente muchas más palabras de las que la guía permite'
    expect(validarPieza(p).join(' ')).toMatch(/lámina 1: \d+ palabras de titular/)
  })

  it('caza una lámina de más de veinte palabras', () => {
    const p = pieza()
    p.laminas[1].cuerpo = 'uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciséis diecisiete dieciocho diecinueve veinte veintiuno'
    expect(validarPieza(p).join(' ')).toMatch(/lámina 2: \d+ palabras de titular; el tope es 20/)
  })

  it('caza un emoji en una lámina', () => {
    const p = pieza()
    p.laminas[0].titular = 'Tus golpes 🔥'
    expect(validarPieza(p).join(' ')).toMatch(/lleva emoji/)
  })

  it('caza un número sin pie de fuente', () => {
    const p = pieza()
    delete p.laminas[1].fuente
    expect(validarPieza(p).join(' ')).toMatch(/muestra un número y no lleva pie de fuente/)
  })

  it('caza dos protagonistas en dorado en la misma lámina', () => {
    const p = pieza()
    // La plantilla "numero" ya pinta su número de dorado: una palabra más son dos.
    p.laminas[1].cuerpo = 'El *par 5* es el que más cuesta.'
    expect(validarPieza(p).join(' ')).toMatch(/2 elementos en dorado/)
  })

  it('caza una tabla con dos filas destacadas', () => {
    const p = pieza()
    p.laminas[0].tabla.filas[0].destacada = true
    expect(validarPieza(p).join(' ')).toMatch(/2 elementos en dorado/)
  })

  it('caza voseo argentino en una lámina y en el caption', () => {
    const p = pieza()
    p.laminas[5].cta = 'Anotá tu ronda.'
    p.caption = p.caption.replace('Anota tu próxima ronda', 'Anotá tu próxima ronda')
    const r = validarPieza(p).join(' ')
    expect(r).toMatch(/lámina 6: voseo/)
    expect(r).toMatch(/caption: voseo/)
  })

  it('caza un caption sin el llamado a la acción del público', () => {
    const p = pieza()
    p.caption = 'Un gancho cualquiera sin llamado a la acción.'
    expect(validarPieza(p).join(' ')).toMatch(/falta el llamado a la acción/)
  })

  it('caza un gancho de caption más largo de lo que Instagram muestra', () => {
    const p = pieza()
    p.caption = 'x'.repeat(126) + '\n\n' + p.caption
    expect(validarPieza(p).join(' ')).toMatch(/el gancho tiene 126 caracteres/)
  })

  it('caza hashtags de más y hashtags mal escritos', () => {
    const p = pieza()
    p.hashtags = ['#a', '#b', '#c', '#d', '#e', '#f']
    expect(validarPieza(p).join(' ')).toMatch(/hashtags: 6/)
    p.hashtags = ['#golf chile', '#a', '#b']
    expect(validarPieza(p).join(' ')).toMatch(/no es #unasolapalabra/)
  })

  it('caza un carrusel con menos láminas de las que pide la guía', () => {
    const p = pieza()
    p.laminas = p.laminas.slice(0, 3)
    expect(validarPieza(p).join(' ')).toMatch(/láminas: 3; el carrusel va entre 5 y 8/)
  })

  it('caza una lámina sin un campo que su plantilla necesita', () => {
    // Sin este control, `escapar(undefined)` imprimía "undefined" DENTRO del PNG.
    for (const [i, campo] of [[1, 'codigo'], [1, 'numero'], [0, 'tabla'], [5, 'cta']] as const) {
      const p = pieza()
      delete p.laminas[i][campo]
      expect(validarPieza(p).join(' '), campo).toMatch(new RegExp(`necesita.*${campo}`))
    }
  })

  it('caza un campo presente pero vacío', () => {
    const p = pieza()
    p.laminas[1].pregunta = '   '
    expect(validarPieza(p).join(' ')).toMatch(/necesita pregunta/)
  })

  it('caza una plantilla que la dirección no tiene', () => {
    const p = pieza()
    p.laminas[2].plantilla = 'grafico'
    expect(validarPieza(p).join(' ')).toMatch(/no tiene la plantilla "grafico"/)
  })

  it('caza una dirección visual que no existe', () => {
    const p = pieza()
    p.direccion = 'garmin'
    expect(validarPieza(p).join(' ')).toMatch(/"garmin" no existe/)
  })

  it('en 9:16 rechaza las plantillas que no tienen layout vertical', () => {
    // El story ya está listo, pero solo para la plantilla que tiene reglas
    // 9:16. Antes era un camino que parecía aceptado: la tabla pasaba la
    // validación y salía con todo apretado arriba y medio marco vacío.
    const p = pieza()
    p.formato = 'story'
    const malo = validarPieza(p).join(' ')
    expect(malo).toMatch(/la plantilla "tabla" no tiene layout en story/)
    expect(malo).not.toMatch(/"story" no está listo/)
  })

  it('la lámina de cierre del reel pasa todos los controles en 9:16', () => {
    const p = JSON.parse(readFileSync('scripts/rrss/piezas/2026-10-27-anota-todos-ven.json', 'utf8'))
    expect(p.formato).toBe('story') // sin esto el test pasaría con un carrusel
    expect(p.laminas.length).toBe(1)
    expect(validarPieza(p)).toEqual([])
  })

  it('toda dirección declara qué plantillas tiene resueltas en cada formato', () => {
    // Mismo agujero que cerró `requisitos`: una dirección que no lo declara
    // perdería el control entero. Acá se exige de frente, dirección por
    // dirección, en vez de confiar en que la validación lo note.
    expect(CLAVES.length).toBeGreaterThan(0)
    for (const clave of CLAVES) {
      const dir = direccion(clave)
      // El módulo tipa las claves como literales; acá se recorren los formatos
      // en runtime, así que se lee como un mapa cualquiera.
      const porFormato = dir.plantillasPorFormato as Record<string, string[] | undefined> | undefined
      for (const formato of FORMATOS_LISTOS) {
        const soportadas = porFormato?.[formato] ?? []
        expect(Array.isArray(porFormato?.[formato]), `${clave} no declara ${formato}`).toBe(true)
        expect(soportadas.length, `${clave} / ${formato} sin plantillas`).toBeGreaterThan(0)
        // Una plantilla declarada que no existe dejaría pasar una pieza que
        // revienta recién en el render.
        for (const p of soportadas) expect(Object.keys(dir.laminas)).toContain(p)
      }
    }
  })

  it('caza datos de ejemplo que no se declaran en la lámina ni en el pie', () => {
    const p = pieza()
    p.laminas[0].ejemplo = true
    expect(validarPieza(p).join(' ')).toMatch(/usa datos de ejemplo/)
    p.laminas[0].fuente = 'Datos de ejemplo, no de un torneo real.'
    expect(validarPieza(p).join(' ')).not.toMatch(/usa datos de ejemplo/)
  })

  it('la pieza del repo es un fixture del motor y lo dice', () => {
    // El plan v2 descarta este formato: si alguien lo publica tal cual, la cuenta
    // arranca con la pieza que la estrategia rechaza.
    expect(pieza().proposito).toMatch(/NO se publica/)
  })

  it('caza una tabla a medio escribir en vez de reventar', () => {
    // `validarPieza` promete no lanzar. Antes, una tabla sin `filas` hacía
    // TypeError dentro de textoVisible y el operador veía un stack trace.
    for (const [tabla, esperado] of [
      [{ columnas: ['HCP'] }, /no tiene filas/],
      [{ filas: [{ celdas: ['1'] }] }, /no tiene columnas/],
      [{ columnas: ['HCP'], filas: [{}] }, /no tienen celdas/],
      [{ columnas: ['HCP', 'PAR 4'], filas: [{ celdas: ['15'] }] }, /1 celdas para 2 columnas/],
      // Truthy pero no lista: `?? []` no lo tapa y reventaba en el conteo de
      // elementos en dorado, DESPUÉS de que problemasDeTabla anotara el
      // problema (anota, no corta).
      [{ columnas: ['HCP'], filas: { 1: { celdas: ['15'] } } }, /no tiene filas/],
      [{ columnas: ['HCP'], filas: 'pendiente' }, /no tiene filas/],
      [{ columnas: 'HCP', filas: [{ celdas: ['15'] }] }, /no tiene columnas/],
      // Una celda que no es texto se imprime "[object Object]" dentro del PNG.
      [{ columnas: ['HCP'], filas: [{ celdas: [{ v: 15 }] }] }, /no son texto ni número/],
    ] as const) {
      const p = pieza()
      p.laminas[0].tabla = tabla
      expect(() => validarPieza(p)).not.toThrow()
      expect(validarPieza(p).join(' '), JSON.stringify(tabla)).toMatch(esperado)
    }
  })

  it('caza un detalle que no es una lista', () => {
    // Endurecer textoVisible con Array.isArray sacó el TypeError del validador
    // y lo dejó en el render: un `"detalle": "una línea"` aprobaba con CERO
    // problemas y moría en el .map de la plantilla, con Chromium ya abierto.
    const p = pieza()
    const i = p.laminas.findIndex((l: { detalle?: unknown }) => l.detalle !== undefined)
    expect(i).toBeGreaterThanOrEqual(0) // si ninguna usa detalle, el test no prueba nada
    p.laminas[i].detalle = 'una línea suelta'
    expect(validarPieza(p).join(' ')).toMatch(/detalle tiene que ser una lista/)
  })

  it('caza hashtags que no son una lista en vez de reventar', () => {
    // Pasaba el control de cantidad (contaba 12 caracteres como 12 hashtags) y
    // moría en `.some`, con el mismo contrato roto que la tabla.
    const p = pieza()
    p.hashtags = '#golf #chile'
    expect(() => validarPieza(p)).not.toThrow()
    expect(validarPieza(p).join(' ')).toMatch(/hashtags: tiene que ser una lista/)
  })

  it('caza un slug que se saldría de out/rrss/ al borrar', () => {
    // El patrón del slug es lo único que hace seguro el rm de render.mjs.
    for (const slug of ['../../..', '2026-10-27-a/b', '2026-10-27-A', 'donde-se-van-los-golpes'])
      expect(SLUG_PIEZA.test(slug), slug).toBe(false)
    expect(SLUG_PIEZA.test('2026-10-27-donde-se-van-los-golpes')).toBe(true)
  })
})

// Controles que no miran una pieza sino el motor: si fallan, los de arriba
// empiezan a aprobar en vacío sin que nadie lo note.
describe('el motor no deja controles sin dueño', () => {
  it('cada dirección declara los campos de cada una de sus plantillas', () => {
    expect(CLAVES.length).toBeGreaterThan(0)
    for (const clave of CLAVES) {
      const dir = direccion(clave)
      const plantillas = Object.keys(dir.laminas)
      expect(plantillas.length, clave).toBeGreaterThan(0)
      const requisitos = dir.requisitos as Record<string, string[] | undefined> | undefined
      for (const p of plantillas) {
        expect(Array.isArray(requisitos?.[p]), `${clave} → ${p}: sin requisitos`).toBe(true)
      }
    }
  })

  it('todo formato aceptado tiene medidas', () => {
    // Sin esto, agregar un formato a FORMATOS_LISTOS sin medirlo dejaba el
    // control de cantidad de láminas pasando en vacío.
    const medidas = MEDIDA as Record<string, unknown>
    for (const f of FORMATOS_LISTOS) expect(medidas[f], f).toBeDefined()
  })

  it('cada familia de cada dirección se le pide a Google con sus caras', () => {
    const catalogo = familiasConPesos()
    for (const clave of CLAVES) {
      for (const familia of direccion(clave).familias) {
        const f = catalogo.find((x) => x.familia === familia)
        if (!f) throw new Error(`${clave} usa "${familia}" y nadie se la pide a Google`)
        expect(f.caras.length, familia).toBeGreaterThan(0)
      }
    }
  })

  it('un spec sin pesos legibles explota en vez de caer al 400', () => {
    // El fallback silencioso al 400 era peor que el error: el control de
    // fuentes "verificaba" un peso que nadie pidió y dejaba de mirar los
    // reales. 'wght@300..800' es la forma que Google muestra para una variable,
    // o sea la que alguien va a copiar y pegar del sitio.
    for (const malo of [
      'Figtree:wght@300..800',
      'Figtree:wght@',
      'Figtree:wght@x',
      'Figtree:ital,wght@0,abc',
    ])
      expect(() => carasDeSpec(malo), malo).toThrow(/no sale ningún peso legible/)
    // Y lo que sí es válido sigue pasando, incluida una familia sin ejes.
    expect(carasDeSpec('Anton').caras).toEqual([{ peso: 400, italica: false }])
  })

  it('parsea el eje ital de un spec de Google', () => {
    const por = (f: string) => {
      const x = familiasConPesos().find((y) => y.familia === f)
      if (!x) throw new Error(`"${f}" no está en FAMILIAS_GOOGLE`)
      return x
    }
    // Solo itálica: pedirla en normal dejaba la cara sin cargar y el render
    // fallaba en falso contra una fuente perfectamente disponible.
    expect(por('Spectral').caras).toEqual([{ peso: 300, italica: true }])
    expect(por('Barlow Condensed').caras).toEqual([
      { peso: 600, italica: false },
      { peso: 800, italica: false },
      { peso: 800, italica: true },
    ])
    // Fuente variable con eje opsz: el peso igual se lee de la columna wght.
    expect(por('Source Serif 4').caras).toEqual([{ peso: 400, italica: false }])
    expect(por('Anton').caras).toEqual([{ peso: 400, italica: false }])
  })
})
