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
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, it, expect } from 'vitest'
import { veredictoDeRevision } from '../../../scripts/rrss/tanda.mjs'
// Módulo .mjs compartido con los scripts de RRSS.
import {
  desajusteDelReel,
  momentosDelReel,
  problemasMecanicos,
} from '../../../scripts/rrss/expediente-pieza.mjs'
import { huellaDeCaptura, huellaDeLoRevisado } from '../../../scripts/rrss/marca.mjs'

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

  it('dice cuantos cuadros son, para que una pausa no se lea como una sola pantalla', () => {
    // `frame(ms)` sin nota es el caso por defecto de capturar.mjs: dos seguidos se
    // funden en un momento de 4 s y la tabla ofrece UN frame. Sin el conteo, el
    // revisor juzga "una pantalla quieta 4 s" mirando una de las dos pantallas.
    const [momento] = momentosDelReel([
      { archivo: 'a.png', ms: 2000, nota: '' },
      { archivo: 'b.png', ms: 2000, nota: '' },
    ])
    expect(momento).toMatchObject({ ms: 4000, cuadros: 2, desde: 'a.png', hasta: 'b.png' })
  })

  it('un momento de un solo cuadro lo dice tambien', () => {
    expect(momentosDelReel([{ archivo: 'a.png', ms: 90, nota: 'x' }])[0].cuadros).toBe(1)
  })

  it('sin frames no inventa momentos', () => {
    expect(momentosDelReel([])).toEqual([])
  })
})

describe('problemas que el expediente tiene que delatar', () => {
  /**
   * Una pieza de verdad, sin la marca de fixture del repo.
   *
   * Se parte de una pieza real porque tiene que pasar los controles de marca
   * enteros: escribir una a mano aca seria mantener una segunda guia de marca, y la
   * que se desactualiza es la de aca.
   */
  function piezaSana(cambios: Record<string, unknown> = {}) {
    const { publicable: _fixtureDelRepo, ...base } = JSON.parse(
      readFileSync('scripts/rrss/piezas/2026-10-27-donde-se-van-los-golpes.json', 'utf8'),
    )
    return { ...base, ...cambios }
  }

  it('una pieza completa y bien hecha no genera ruido', () => {
    // Un archivo que existe de verdad, del repo: asi el control de existencia se
    // prueba contra el sistema de archivos y no contra un mock.
    expect(problemasMecanicos(piezaSana(), { 'la lamina 1': 'scripts/rrss/marca.mjs' })).toEqual([])
  })

  it('dice que archivo falta en vez de omitir la pieza', () => {
    const malo = problemasMecanicos(piezaSana(), {
      'la hoja de contactos': 'out/rrss/x/no-existe-jamas.png',
    })
    expect(malo).toHaveLength(1)
    expect(malo[0]).toContain('la hoja de contactos')
  })

  it('corre el validador de marca, que es lo que el revisor no puede correr', () => {
    // El revisor solo lee: no tiene Bash. Si el expediente no corriera
    // `validarPieza`, una pieza que nunca paso por validar.mjs llegaria con voseo o
    // con la palabra vetada y volveria con un PUBLICAR, porque lo unico que el
    // revisor mira es lo que el expediente le muestra.
    const conVoseo = piezaSana({ caption: 'Anotá tu score en Golfers+. Link en la bio.' })
    expect(problemasMecanicos(conVoseo, {}).join(' ')).toMatch(/voseo/)
    const conVetada = piezaSana({ caption: `${piezaSana().caption}

La experiencia premium del golf.` })
    expect(problemasMecanicos(conVetada, {}).join(' ')).toMatch(/premium/)
  })

  it('caza el caption que Instagram va a cortar', () => {
    expect(problemasMecanicos(piezaSana({ caption: 'a'.repeat(2201) }), {}).join(' ')).toContain('2200')
  })

  it('caza la pieza sin caption', () => {
    expect(problemasMecanicos(piezaSana({ caption: '' }), {}).join(' ')).toMatch(/caption: falta/)
    expect(problemasMecanicos(piezaSana({ caption: '   \n ' }), {}).join(' ')).toMatch(/caption: falta/)
  })

  it('no deja pasar una pieza marcada como no publicable', () => {
    // Una pieza fixture pasa todos los controles de marca (para eso esta). Si el
    // expediente no lo dijera, el revisor gastaria su juicio en algo que no se va a
    // publicar y, peor, aprobaria el fixture.
    const malo = problemasMecanicos(piezaSana({ publicable: false, proposito: 'fixture del motor' }), {})
    expect(malo.join(' ')).toMatch(/publicable/)
  })
})

/**
 * El gate del revisor: lo que convierte "hay que revisar" en algo que no se puede
 * saltear. Sin esto, el PASO 4 seria una instruccion en un markdown, y una
 * instruccion en markdown se cumple cuando hay tiempo. Un domingo apurado antes de
 * un torneo es justo cuando no hay.
 */
describe('el porton no recibe una tanda sin revisar', () => {
  let dir: string
  const HUELLA = 'abc123def456'

  afterEach(() => {
    if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  })

  function veredictoEn(contenido: string) {
    dir = mkdtempSync(path.join(tmpdir(), 'rrss-rev-'))
    const ruta = path.join(dir, 'veredicto.md')
    writeFileSync(ruta, contenido)
    return ruta
  }

  it('sin revision no se manda nada, y el error dice los pasos que faltan', () => {
    expect(() => veredictoDeRevision(undefined, HUELLA)).toThrow(/expediente-pieza\.mjs/)
    expect(() => veredictoDeRevision(undefined, HUELLA)).toThrow(/revisor-rrss/)
    expect(() => veredictoDeRevision('', HUELLA)).toThrow(/Falta la revision|Falta la revisi\u00f3n/)
  })

  it('un archivo que no existe no cuenta como revision', () => {
    expect(() => veredictoDeRevision('out/rrss/no-existe-jamas.md', HUELLA)).toThrow(/No existe el veredicto/)
  })

  it('un texto que opina pero no decide no es una aprobacion', () => {
    // Fail-closed: el silencio no es un si.
    const ruta = veredictoEn('La pieza esta bastante bien, me gusta el ritmo.')
    expect(() => veredictoDeRevision(ruta, HUELLA)).toThrow(/no trae la l\u00ednea del veredicto/)
  })

  it('la palabra suelta en un hallazgo no es un veredicto', () => {
    // Este era el agujero: el gate se quedaba con la ULTIMA linea que mencionara
    // PUBLICAR o CORREGIR, y el revisor escribe el veredicto arriba y los hallazgos
    // abajo. Un CORREGIR cuyo ultimo hallazgo dijera "asi no se puede publicar"
    // llegaba al telefono de Juanjo como tanda lista. Un gate que busca una palabra
    // suelta en texto libre falla ABIERTO, que es la unica direccion prohibida.
    const ruta = veredictoEn(
      [
        '- **Veredicto:** CORREGIR',
        '- P0: el caption promete un torneo que el video no muestra.',
        '- P1: la lamina 2 dice 18 hoyos y el leaderboard muestra 9; asi no se puede publicar.',
        '',
        `Huella: ${HUELLA}`,
      ].join('\n'),
    )
    expect(() => veredictoDeRevision(ruta, HUELLA)).toThrow(/dijo CORREGIR/)
  })

  it('dos veredictos en el mismo archivo no se resuelven solos', () => {
    // Pasa de verdad: el agente corrige su respuesta y deja las dos lineas. Elegir
    // una (la primera, la ultima) es inventar una regla que nadie escribio.
    const ruta = veredictoEn(`Veredicto: CORREGIR\n\nLo pense mejor.\n\nVeredicto: PUBLICAR\nHuella: ${HUELLA}\n`)
    expect(() => veredictoDeRevision(ruta, HUELLA)).toThrow(/2 l\u00edneas "Veredicto:"/)
  })

  it('un CORREGIR no llega al telefono de Juanjo', () => {
    const ruta = veredictoEn('Veredicto: CORREGIR\n\nP0: el caption promete algo que el video no muestra.')
    expect(() => veredictoDeRevision(ruta, HUELLA)).toThrow(/dijo CORREGIR/)
  })

  it('deja pasar un PUBLICAR con la huella de lo que se va a mandar', () => {
    const ruta = veredictoEn(`Hallazgos: ninguno que impida publicar.\n\nVeredicto: PUBLICAR\nHuella: ${HUELLA}\n`)
    expect(veredictoDeRevision(ruta, HUELLA)).toMatchObject({ veredicto: 'PUBLICAR', huella: HUELLA })
  })

  it('lee el veredicto como lo escribe un agente: markdown, minusculas, backticks', () => {
    const ruta = veredictoEn(`- **Veredicto:** publicar\n- **Huella:** \`${HUELLA}\`\n`)
    expect(veredictoDeRevision(ruta, HUELLA).veredicto).toBe('PUBLICAR')
  })

  it('un PUBLICAR sin huella no sirve para ninguna version', () => {
    const ruta = veredictoEn('Veredicto: PUBLICAR\n')
    expect(() => veredictoDeRevision(ruta, HUELLA)).toThrow(/falta la l\u00ednea/)
  })

  it('un PUBLICAR de otra version de la tanda no pasa', () => {
    // El camino que se cuela no necesita mala fe: Juanjo pide un cambio, se corrige
    // el caption y se reusa el archivo del PUBLICAR de ayer. Nadie miente y nadie
    // reviso lo que salio.
    const ruta = veredictoEn('Veredicto: PUBLICAR\nHuella: 0000deadbeef\n')
    expect(() => veredictoDeRevision(ruta, HUELLA)).toThrow(/es de otra versi\u00f3n/)
  })

  it('un titulo markdown SI cuenta como veredicto', () => {
    // El agujero que quedaba: el prefijo toleraba vi\u00f1eta y negrita pero no `##`. Un
    // agente que titula su respuesta `## Veredicto: CORREGIR` no tenia veredicto para
    // el porton, y el unico que el porton veia era el `Veredicto: PUBLICAR` del
    // ejemplo, mas abajo, cuando el agente reproducia el formato pedido.
    const ruta = veredictoEn(`## Veredicto: CORREGIR\n\nP0: el caption promete un torneo.\n`)
    expect(() => veredictoDeRevision(ruta, HUELLA)).toThrow(/dijo CORREGIR/)
  })

  it('el CORREGIR titulado mas el ejemplo copiado abajo no sale como PUBLICAR', () => {
    // Este es el camino completo, tal cual lo escribe un agente: titula el veredicto
    // y mas abajo reproduce el formato que el expediente le pidio. Lo que NO puede
    // pasar es que de eso salga un PUBLICAR al telefono de Juanjo.
    const ruta = veredictoEn(
      [
        '## Veredicto: CORREGIR',
        '',
        'P0: la lamina 2 dice 18 hoyos y el leaderboard muestra 9.',
        '',
        'El formato que me pediste era:',
        '',
        'Veredicto: PUBLICAR',
        `Huella: ${HUELLA}`,
      ].join('\n'),
    )
    expect(() => veredictoDeRevision(ruta, HUELLA)).toThrow(/2 l\u00edneas "Veredicto:"/)
  })

  it('la numeracion y la cita tambien cuentan', () => {
    for (const linea of ['1. Veredicto: CORREGIR', '2) Veredicto: CORREGIR', '> Veredicto: CORREGIR']) {
      const ruta = veredictoEn(`${linea}\n\nP1: el dato no declara fuente.\n`)
      expect(() => veredictoDeRevision(ruta, HUELLA), linea).toThrow(/dijo CORREGIR/)
    }
  })

  it('las dos palabras en la misma linea no son una decision', () => {
    // `Veredicto: PUBLICAR|CORREGIR` estaba impreso como EJEMPLO del formato en el
    // comando y en el agente, y matcheaba como PUBLICAR por el \\b antes del `|`:
    // copiar la linea de ejemplo tal cual alcanzaba para mandar la tanda.
    for (const linea of ['Veredicto: PUBLICAR|CORREGIR', 'Veredicto: PUBLICAR / CORREGIR']) {
      const ruta = veredictoEn(`${linea}\nHuella: ${HUELLA}\n`)
      expect(() => veredictoDeRevision(ruta, HUELLA), linea).toThrow(/los dos veredictos en la misma/)
    }
  })

  it('la plantilla sin rellenar no es un veredicto', () => {
    const ruta = veredictoEn(`Veredicto: <PUBLICAR o CORREGIR>\nHuella: ${HUELLA}\n`)
    expect(() => veredictoDeRevision(ruta, HUELLA)).toThrow(/no trae la l\u00ednea del veredicto/)
  })

  it('un PUBLICAR con otra linea que habla del veredicto se devuelve, no se interpreta', () => {
    // Estricto para aceptar, laxo para dudar: si hay una segunda linea que menciona un
    // veredicto y no esta en el formato exigido, puede ser el veredicto de verdad
    // escrito de otra forma, y desde el porton no hay manera de saber que no lo es.
    const ruta = veredictoEn(
      [
        'Veredicto: PUBLICAR',
        `Huella: ${HUELLA}`,
        '',
        'Mi veredicto de fondo es que habria que corregir el arranque, pero no bloquea.',
      ].join('\n'),
    )
    expect(() => veredictoDeRevision(ruta, HUELLA)).toThrow(/fuera del formato exigido/)
  })

  it('un hallazgo que usa las palabras sin hablar del veredicto no estorba', () => {
    // El otro lado del filo: si cualquier mencion lo rompiera, el revisor no podria
    // describir lo que encontro y el formato se volveria imposible de cumplir.
    const ruta = veredictoEn(
      [
        'Veredicto: PUBLICAR',
        `Huella: ${HUELLA}`,
        '',
        '- P2: el caption dice "publicar" dos veces; se podria corregir, no bloquea.',
      ].join('\n'),
    )
    expect(veredictoDeRevision(ruta, HUELLA).veredicto).toBe('PUBLICAR')
  })

  it('una respuesta que CITA el encabezado del expediente vale igual', () => {
    // El porton reconoce el expediente por su titulo. Buscandolo en el texto entero, un
    // revisor que lo mencionara al decir donde vio algo se quedaba sin forma de
    // responder: el mensaje del formato le prohibe, con razon, que alguien le edite la
    // respuesta. Se mira la primera linea.
    const ruta = veredictoEn(
      [
        'Veredicto: PUBLICAR',
        `Huella: ${HUELLA}`,
        '',
        '- P2: el titulo del expediente ("# Revisi\u00f3n de la tanda 2026-W44") no habla de la idea.',
      ].join('\n'),
    )
    expect(veredictoDeRevision(ruta, HUELLA).veredicto).toBe('PUBLICAR')
  })

  it('una respuesta que ARRANCA con el encabezado del expediente no vale', () => {
    // Lo que el control existe para cazar: el expediente pasado como --revision. Empieza
    // por su titulo, asi que sigue rebotando.
    const ruta = veredictoEn(
      ['# Revisi\u00f3n de la tanda 2026-W44', '', 'Veredicto: PUBLICAR', `Huella: ${HUELLA}`].join('\n'),
    )
    expect(() => veredictoDeRevision(ruta, HUELLA)).toThrow(/es el EXPEDIENTE de la tanda/)
  })

  it('lo que se archiva no lleva el disco de quien revis\u00f3', () => {
    // La tanda se commitea y el repo es PUBLICO. De una cita asi lo que importa es el
    // nombre del archivo; la carpeta de arriba es el usuario de quien reviso y como tiene
    // ordenado el disco.
    const ruta = veredictoEn(
      [
        'Veredicto: PUBLICAR',
        `Huella: ${HUELLA}`,
        '',
        '- P2: la l\u00e1mina C:\\\\Users\\\\quiensea\\\\AppData\\\\Local\\\\Temp\\\\out\\\\01.png va cortada.',
      ].join('\n'),
    )
    const archivado = veredictoDeRevision(ruta, HUELLA)
    expect(archivado.texto).not.toMatch(/quiensea/)
    expect(archivado.texto).toContain('01.png')
    // Y el criterio queda entero: se reemplaza el tramo de la ruta, no la linea.
    expect(archivado.texto).toContain('va cortada')
    expect(archivado.texto_saneado).toBe(true)
  })

  it('un veredicto sin rutas se archiva tal cual, y lo dice', () => {
    // El flag no es decoracion: leyendo la tanda, `false` es "esto es textual lo que
    // escribio el revisor". Si no se dijera, no habria forma de saberlo.
    const ruta = veredictoEn(`Veredicto: PUBLICAR\nHuella: ${HUELLA}\n\n- P2: el caption es largo.\n`)
    const archivado = veredictoDeRevision(ruta, HUELLA)
    expect(archivado.texto).toBe(readFileSync(ruta, 'utf8'))
    expect(archivado.texto_saneado).toBe(false)
  })

  it('dos huellas distintas tampoco pasan, aunque una calce', () => {
    // Pegar el expediente viejo y el nuevo en el mismo archivo no vale: lo que se
    // reviso es una version, no un rango.
    const ruta = veredictoEn(`Veredicto: PUBLICAR\nHuella: 0000deadbeef\nHuella: ${HUELLA}\n`)
    expect(() => veredictoDeRevision(ruta, HUELLA)).toThrow(/es de otra versi\u00f3n/)
  })
})


/**
 * Qu\u00e9 sella la huella que el revisor copia en su veredicto.
 *
 * Es lo \u00fanico que ata un PUBLICAR a una version de la tanda. Un campo que no entra
 * en el sello es un cambio que puede pasar despues de la revision sin que nada avise,
 * y la direccion del error es siempre la misma: se publica lo que nadie reviso.
 */
describe('lo que la huella del revisor sella', () => {
  const PIEZA = { slug: 'p1', caption: 'Uno anota.', laminas: [{ plantilla: 'cierre', titular: 'A' }] }
  const ITEM = {
    rol: 'central',
    pieza: PIEZA,
    frames: [{ archivo: '0000.jpg', ms: 1500, nota: 'marcador-antes' }],
    escena: 'aaaaaaaaaaaaaaaa',
  }

  it('es estable: la misma tanda da la misma huella', () => {
    // Si no lo fuera, el veredicto no calzaria nunca y el flujo quedaria pidiendo
    // revisar lo que ya se reviso hasta que alguien saque el porton del medio.
    expect(huellaDeLoRevisado([ITEM])).toBe(huellaDeLoRevisado([ITEM]))
  })

  it('cambia si cambia la escena, con la pieza y la captura iguales', () => {
    // La escena es el guion de la toma: se corrige un golpe o el gesto, y hasta que
    // alguien recapture el JSON de la pieza y `frames.json` siguen identicos. Sin
    // este campo, el PUBLICAR de la toma anterior valia para la escena nueva.
    expect(huellaDeLoRevisado([{ ...ITEM, escena: 'bbbbbbbbbbbbbbbb' }])).not.toBe(huellaDeLoRevisado([ITEM]))
  })

  it('cambia si cambia la toma', () => {
    const otraToma = [{ archivo: '0000.jpg', ms: 2600, nota: 'marcador-antes' }]
    expect(huellaDeLoRevisado([{ ...ITEM, frames: otraToma }])).not.toBe(huellaDeLoRevisado([ITEM]))
  })

  it('cambia si cambia la lamina de cierre del reel', () => {
    // El cierre sale de OTRA pieza, que puede no estar en la tanda: se corrige ese
    // titular, se renderiza y se monta, y ni el JSON de la pieza del reel ni
    // `frames.json` ni la escena se mueven. Sin este campo el PUBLICAR de ayer valia
    // para un reel que termina distinto.
    const conCierre = { ...ITEM, cierre: { pieza: 'p-cierre', visual: 'aaaaaaaaaaaaaaaa' } }
    const otroTitular = { ...conCierre, cierre: { pieza: 'p-cierre', visual: 'bbbbbbbbbbbbbbbb' } }
    const otraPieza = { ...conCierre, cierre: { pieza: 'p-otra', visual: 'aaaaaaaaaaaaaaaa' } }
    expect(huellaDeLoRevisado([otroTitular])).not.toBe(huellaDeLoRevisado([conCierre]))
    expect(huellaDeLoRevisado([otraPieza])).not.toBe(huellaDeLoRevisado([conCierre]))
  })

  it('cambia si cambia el rol de una pieza', () => {
    // El rol decide donde se sube y a que hora: la misma pieza como central o como
    // derivado no es la misma decision.
    expect(huellaDeLoRevisado([{ ...ITEM, rol: 'derivado' }])).not.toBe(huellaDeLoRevisado([ITEM]))
  })

  it('cambia si cambia el caption o una lamina', () => {
    const otroCaption = { ...ITEM, pieza: { ...PIEZA, caption: 'Otra cosa.' } }
    const otraLamina = { ...ITEM, pieza: { ...PIEZA, laminas: [{ plantilla: 'cierre', titular: 'B' }] } }
    expect(huellaDeLoRevisado([otroCaption])).not.toBe(huellaDeLoRevisado([ITEM]))
    expect(huellaDeLoRevisado([otraLamina])).not.toBe(huellaDeLoRevisado([ITEM]))
  })
})

/**
 * La tabla de momentos es lo unico con lo que se puede juzgar el ritmo de un reel, y
 * se arma con `frames.json` (la captura) y la escena de AHORA (el codigo). El MP4 es
 * un tercer artefacto: antes solo se miraba que el archivo existiera, asi que el
 * revisor podia aprobar el ritmo de un video que ya no existe.
 */
describe('la tabla del reel no describe un MP4 que no es ese', () => {
  const VID = { huella_escena: 'escena-de-ahora', huella_captura: 'toma-de-ahora' }
  const SANO = { huellaEsperada: 'escena-de-ahora', vid: VID, hayMp4: true, huellaCaptura: 'toma-de-ahora' }

  it('calla cuando lo que hay en disco es coherente', () => {
    expect(desajusteDelReel(SANO)).toBeNull()
  })

  it('avisa si la escena se corrigio despues de montar', () => {
    expect(desajusteDelReel({ ...SANO, huellaEsperada: 'escena-corregida' })).toMatch(/otra versi\u00f3n de la escena/)
  })

  it('avisa si falta el MP4 o su manifiesto', () => {
    expect(desajusteDelReel({ ...SANO, hayMp4: false })).toMatch(/no est\u00e1 montado/)
    expect(desajusteDelReel({ ...SANO, vid: null })).toMatch(/no est\u00e1 montado/)
  })

  it('avisa si la captura se repitio despues de montar', () => {
    // El caso real: se recaptura y se olvida montar. La escena no cambio —su huella
    // calza— y las laminas tampoco; lo unico distinto son los fotogramas en disco.
    // Comparar segundos no lo cazaba: `rafaga` acota cada ventana por `ms`, asi que dos
    // tomas de la misma escena caian dentro del margen de 0,2 s que el control se daba.
    expect(desajusteDelReel({ ...SANO, huellaCaptura: 'otra-toma' })).toMatch(
      /otra toma[\s\S]*se recaptur\u00f3 despu\u00e9s de montar/,
    )
  })

  it('avisa si el MP4 se monto sin sellar la toma, en vez de dejarlo pasar', () => {
    // Un video.json de antes de que el sello existiera. "No se puede verificar" no es
    // "esta bien": de ese MP4 nadie sabe de que toma salio.
    expect(desajusteDelReel({ ...SANO, vid: { huella_escena: VID.huella_escena } })).toMatch(
      /todav\u00eda no sellaba/,
    )
  })
})

/**
 * La huella de la toma es lo que reemplazo a la comparacion de duraciones, asi que el
 * que no tenga margen es la propiedad entera: con margen, dos tomas de la misma escena
 * se confunden y el MP4 rancio pasa.
 */
describe('la huella de una toma no tiene margen', () => {
  const TOMA = [
    { archivo: '0000.jpg', ms: 900, nota: 'marcador-antes' },
    { archivo: '0001.jpg', ms: 1100, nota: 'marcador-despues' },
  ]

  it('cambia aunque la toma dure exactamente lo mismo', () => {
    // 900 + 1100 = 1000 + 1000: el mismo total, otro ritmo. Es justo el caso que la
    // comparacion de segundos no distinguia.
    const otroRitmo = [
      { ...TOMA[0], ms: 1000 },
      { ...TOMA[1], ms: 1000 },
    ]
    expect(huellaDeCaptura(otroRitmo)).not.toBe(huellaDeCaptura(TOMA))
  })

  it('cambia si cambia un solo milisegundo', () => {
    const casiIgual = [{ ...TOMA[0], ms: TOMA[0].ms + 1 }, TOMA[1]]
    expect(huellaDeCaptura(casiIgual)).not.toBe(huellaDeCaptura(TOMA))
  })

  it('no se mueve si la toma es la misma', () => {
    expect(huellaDeCaptura(TOMA.map((f) => ({ ...f })))).toBe(huellaDeCaptura(TOMA))
  })

  it('una escena sin capturar no comparte huella con una captura vacia', () => {
    // `framesDeEscena` devuelve `null` cuando no hay manifiesto y `[]` cuando hay uno
    // sin cuadros; los dos son "no hay nada que revisar", y el control de arriba los
    // trata por separado antes de llegar a la huella.
    expect(huellaDeCaptura([])).toBe(huellaDeCaptura(null))
  })
})
