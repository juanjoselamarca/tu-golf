// El expediente es lo único que el revisor de RRSS va a ver de la pieza.
//
// Si el expediente miente, el revisor aprueba algo que no revisó, y el portón de
// Juanjo pasa a ser el primer par de ojos frescos otra vez — justo lo que este
// flujo existe para evitar. Dos cosas se pueden verificar sin criterio y acá se
// verifican:
//
// 1. Los momentos del reel. El revisor no puede ver un MP4: juzga el ritmo con la
//    tabla de duraciones. Si los momentos están mal agrupados, "el primer momento
//    dura 3,6 s" se convierte en "dura 0,05 s" y el problema que más importa —el
//    arranque muerto— se vuelve invisible en el expediente.
// 2. Los problemas mecánicos. Son fail-closed: si falta una lámina o un dato no
//    declara fuente, tiene que salir dicho. Un expediente que los omite en
//    silencio hace que el revisor opine sobre una pieza incompleta sin saberlo.
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, it, expect } from 'vitest'
import { veredictoDeRevision } from '../../../scripts/rrss/tanda.mjs'
// Módulo .mjs compartido con los scripts de RRSS.
import { momentosDelReel, problemasMecanicos } from '../../../scripts/rrss/expediente-pieza.mjs'

interface Frame {
  archivo: string
  ms: number
  nota: string
}

/** Los brutos del reel 1: dos pantallas quietas y recién después el gesto. */
function framesDelLanzamiento(): Frame[] {
  const frames: Frame[] = []
  const push = (nota: string, cuantos: number, ms: number) => {
    for (let i = 0; i < cuantos; i += 1) {
      frames.push({ archivo: `f${String(frames.length).padStart(3, '0')}.png`, ms, nota })
    }
  }
  push('marcador-antes', 20, 90) // 1800 ms
  push('scorer-quieto', 20, 90) // 1800 ms
  push('toque-1-dedo', 4, 90) // 360 ms
  push('score-anotado', 6, 90) // 540 ms
  return frames
}

describe('momentos del reel', () => {
  it('junta los frames seguidos que cuentan lo mismo y suma lo que duran', () => {
    const momentos = momentosDelReel(framesDelLanzamiento())
    expect(momentos.map((m) => [m.nota, m.ms])).toEqual([
      ['marcador-antes', 1800],
      ['scorer-quieto', 1800],
      ['toque-1-dedo', 360],
      ['score-anotado', 540],
    ])
  })

  it('deja ver el arranque muerto: el gancho recién aparece al tercer momento', () => {
    const momentos = momentosDelReel(framesDelLanzamiento())
    const antesDelGesto = momentos
      .slice(0, momentos.findIndex((m) => m.nota.startsWith('toque')))
      .reduce((a, m) => a + m.ms, 0)
    // 3,6 s de pantallas quietas antes del primer gesto. El número tiene que
    // llegarle al revisor tal cual: es el hallazgo más caro de este reel.
    expect(antesDelGesto).toBe(3600)
  })

  it('no conserva ni un milisegundo de más ni de menos que los brutos', () => {
    const frames = framesDelLanzamiento()
    const total = momentosDelReel(frames).reduce((a, m) => a + m.ms, 0)
    expect(total).toBe(frames.reduce((a, f) => a + f.ms, 0))
  })

  it('agrupa por racha, no por nota: una nota que vuelve es otro momento', () => {
    // El scorer se queda quieto, pasa algo, y vuelve a quedarse quieto. Son dos
    // pausas de 200 ms, no una de 400: agruparlas por nota global inventaría una
    // pausa larga que nunca ocurrió y escondería las dos reales.
    const momentos = momentosDelReel([
      { archivo: 'a.png', ms: 200, nota: 'quieto' },
      { archivo: 'b.png', ms: 100, nota: 'toque' },
      { archivo: 'c.png', ms: 200, nota: 'quieto' },
    ])
    expect(momentos.map((m) => [m.nota, m.ms])).toEqual([
      ['quieto', 200],
      ['toque', 100],
      ['quieto', 200],
    ])
  })

  it('el frame que ofrece es el del comienzo del momento, no el del final', () => {
    const [momento] = momentosDelReel([
      { archivo: 'primero.png', ms: 90, nota: 'x' },
      { archivo: 'ultimo.png', ms: 90, nota: 'x' },
    ])
    // El revisor abre una imagen por momento: tiene que ser la de cuando empieza.
    // La del final de la racha muestra el estado siguiente, no el que se juzga.
    expect(momento.desde).toBe('primero.png')
    expect(momento.hasta).toBe('ultimo.png')
  })

  it('no pierde el último frame cuando cierra una racha', () => {
    const momentos = momentosDelReel([
      { archivo: 'a.png', ms: 90, nota: 'x' },
      { archivo: 'b.png', ms: 90, nota: 'y' },
    ])
    expect(momentos).toHaveLength(2)
    expect(momentos[1]).toMatchObject({ nota: 'y', ms: 90 })
  })

  it('sin frames no inventa momentos', () => {
    expect(momentosDelReel([])).toEqual([])
  })
})

describe('problemas que el expediente tiene que delatar', () => {
  const piezaSana = {
    slug: 'x',
    caption: 'Anota. Todos ven lo mismo.',
    laminas: [{ plantilla: 'cierre', titular: 'Anota' }],
  }

  it('una pieza completa y bien hecha no genera ruido', () => {
    // Un archivo que existe: el propio test. Así el control de existencia se
    // prueba contra el sistema de archivos de verdad, no contra un mock.
    expect(problemasMecanicos(piezaSana, { 'la lámina 1': import.meta.filename })).toEqual([])
  })

  it('dice qué archivo falta en vez de omitir la pieza', () => {
    const malo = problemasMecanicos(piezaSana, {
      'la hoja de contactos': 'out/rrss/x/no-existe-jamas.png',
    })
    expect(malo).toHaveLength(1)
    expect(malo[0]).toContain('la hoja de contactos')
  })

  it('caza el caption que Instagram va a cortar', () => {
    const malo = problemasMecanicos({ ...piezaSana, caption: 'a'.repeat(2201) }, {})
    expect(malo.join(' ')).toContain('2200')
  })

  it('caza la pieza sin caption, y no la confunde con un caption en blanco', () => {
    expect(problemasMecanicos({ ...piezaSana, caption: '' }, {}).join(' ')).toContain('no tiene caption')
    expect(problemasMecanicos({ ...piezaSana, caption: '   \n ' }, {}).join(' ')).toContain('no tiene caption')
  })

  it('caza el dato sin fuente, que es la regla dura que más caro sale', () => {
    // "Todo número tiene fuente y fecha". Un dato publicado sin de dónde salió es
    // lo único que nos quita credibilidad de forma permanente en el golf chileno.
    const malo = problemasMecanicos(
      { ...piezaSana, laminas: [{ plantilla: 'dato', dato: '4 jugadores, 1 tarjeta' }] },
      {},
    )
    expect(malo.join(' ')).toContain('fuente')
    const conFuente = problemasMecanicos(
      { ...piezaSana, laminas: [{ plantilla: 'dato', dato: '4 jugadores', fuente: 'App, 27-oct-2026' }] },
      {},
    )
    expect(conFuente).toEqual([])
  })

  it('mira el dato en los dos campos donde puede venir', () => {
    // Las plantillas usan `dato` o `cifra` según cuál sea. Mirar solo una deja la
    // mitad de las láminas sin control, y son justo las que muestran números.
    const malo = problemasMecanicos(
      { ...piezaSana, laminas: [{ plantilla: 'cifra', cifra: '18 hoyos' }] },
      {},
    )
    expect(malo.join(' ')).toContain('fuente')
  })
})

/**
 * El gate del revisor: lo que convierte "hay que revisar" en algo que no se puede
 * saltear. Sin esto, el PASO 4 sería una instrucción en un markdown, y una
 * instrucción en markdown se cumple cuando hay tiempo. Un domingo apurado antes de
 * un torneo es justo cuando no hay.
 */
describe('el portón no recibe una tanda sin revisar', () => {
  let dir: string

  afterEach(() => {
    if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  })

  function veredictoEn(contenido: string) {
    dir = mkdtempSync(path.join(tmpdir(), 'rrss-rev-'))
    const ruta = path.join(dir, 'veredicto.md')
    writeFileSync(ruta, contenido)
    return ruta
  }

  it('sin revisión no se manda nada, y el error dice los tres pasos que faltan', () => {
    expect(() => veredictoDeRevision(undefined)).toThrow(/expediente-pieza\.mjs/)
    expect(() => veredictoDeRevision(undefined)).toThrow(/revisor-rrss/)
    expect(() => veredictoDeRevision('')).toThrow(/Falta la revisión/)
  })

  it('un archivo que no existe no cuenta como revisión', () => {
    expect(() => veredictoDeRevision('out/rrss/no-existe-jamas.md')).toThrow(/No existe el veredicto/)
  })

  it('un veredicto sin la palabra no se interpreta como aprobación', () => {
    // Un texto que opina pero no decide deja la pieza en el limbo. Fail-closed:
    // el silencio no es un sí.
    const ruta = veredictoEn('La pieza está bastante bien, me gusta el ritmo.')
    expect(() => veredictoDeRevision(ruta)).toThrow(/no dice ni PUBLICAR ni CORREGIR/)
  })

  it('un CORREGIR no llega al teléfono de Juanjo', () => {
    const ruta = veredictoEn('P0: el caption promete algo que el video no muestra.\n\nCORREGIR')
    expect(() => veredictoDeRevision(ruta)).toThrow(/dijo CORREGIR/)
  })

  it('deja pasar un PUBLICAR limpio', () => {
    const ruta = veredictoEn('Hallazgos: ninguno que impida publicar.\n\nPUBLICAR')
    expect(veredictoDeRevision(ruta)).toMatchObject({ veredicto: 'PUBLICAR' })
  })

  it('manda lo que dice el final, no lo que se mencionó en los hallazgos', () => {
    // El revisor nombra las dos palabras todo el tiempo al explicarse ("no hay
    // nada que corregir"). Si cualquier mención bloqueara, el gate sería ruido y
    // alguien lo apagaría; si cualquier mención aprobara, un CORREGIR real se
    // colaría. Manda la última línea que decide, que es donde va el veredicto.
    const ruta = veredictoEn(
      'P2: el titular podría corregir el tono, pero no lo amerita.\nNada que CORREGIR en los datos.\n\nVeredicto: PUBLICAR\n',
    )
    expect(veredictoDeRevision(ruta).veredicto).toBe('PUBLICAR')
  })

  it('ante una línea ambigua se queda con CORREGIR', () => {
    // Equivocarse hacia "no publicar" cuesta un día; hacia "publicar", la cuenta.
    const ruta = veredictoEn('No sé si PUBLICAR o CORREGIR, decide tú.')
    expect(() => veredictoDeRevision(ruta)).toThrow(/dijo CORREGIR/)
  })

  it('no exige que el revisor grite: minúsculas valen igual', () => {
    const ruta = veredictoEn('Veredicto: publicar')
    expect(veredictoDeRevision(ruta).veredicto).toBe('PUBLICAR')
  })
})
