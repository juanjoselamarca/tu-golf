// El detector de voseo es la fuente única que usan el canario del flujo de
// torneos, el test del copy del home, el smoke del coach y el validador de
// piezas de RRSS. Dos cosas se rompen solas acá y estos casos las fijan:
//  1. Si su clase de letras se rompe, el canario pasa a cazar identificadores en
//     camelCase ("AvisoSoloBruto" -> "soS") y nadie puede mergear.
//  2. Si alguien escribe una segunda lista inline, las dos divergen: pasó con
//     tres a la vez, y cada una dejaba pasar lo que las otras cazaban.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
// La lista canónica vive en un .mjs que comparten scripts y tests.
import {
  VOSEO,
  VOSEO_AMBIGUO,
  VOSEO_INEQUIVOCO,
  buscarVoseo,
  buscarVoseoDetallado,
  lineaDe,
  patronVoseo,
} from '../../../scripts/lib/voseo.mjs'

describe('detector de voseo', () => {
  it('caza el voseo real, con y sin mayúscula', () => {
    expect(buscarVoseo('Copiá el link, tenés dos minutos y elegí tu tee')).toEqual([
      'Copiá',
      'tenés',
      'elegí',
    ])
  })

  it('caza las formas que antes se colaban por estar solo en una de las listas', () => {
    // Estas cuatro las cazaba el test del home pero NO la lista canónica, y
    // "armá"/"invitá" no las cazaba ninguna de las tres.
    for (const forma of ['jugá', 'sumá', 'mostrá', 'contá', 'armá', 'invitá', 'sabés', 'decís']) {
      expect(buscarVoseo(`Entra y ${forma} lo que quieras`), forma).toContain(forma)
    }
  })

  it('caza las dos formas que la unificación había perdido', () => {
    // Comprobado contra las listas viejas (`git show 9e384ae9:src/content/home.test.ts`):
    // "vení" y "ganás" las cazaba el test del home y la canónica no las tenía.
    // Es el riesgo propio de unificar: la fuente única puede cazar MENOS.
    expect(buscarVoseo('Vení al torneo y ganás un dozen')).toEqual(['Vení', 'ganás'])
  })

  it('no confunde un nombre de pila con una forma de voseo', () => {
    // "Tomás" es corriente en Chile y el patrón ignora mayúsculas: por eso la
    // lista lleva el imperativo "tomá" pero NUNCA el presente "tomás". Mismo
    // motivo por el que están vetados "date" (el Date de JS) y "prepárate".
    expect(buscarVoseo('Tomás Rojas ganó el match en el 17')).toEqual([])
  })

  it('caza el imperativo detrás de un adverbio que admite imperativo', () => {
    // "siempre" y "hoy" NO son marcadores de primera persona: preceden a un
    // imperativo con toda naturalidad en copy de marketing.
    expect(buscarVoseo('Siempre elegí el tee que te acomoda')).toEqual(['elegí'])
    expect(buscarVoseo('Hoy inscribí a tu grupo')).toEqual(['inscribí'])
  })

  it('no caza palabras que contienen una forma de voseo', () => {
    // "AvisoSoloBruto" contiene "soS"; "casos" contiene "sos"; "describí" contiene "escribí".
    for (const texto of ['AvisoSoloBruto', 'casos', 'describí', 'presosa', 'versos']) {
      expect(buscarVoseo(texto), texto).toEqual([])
    }
  })

  it('deja pasar el imperativo chileno', () => {
    expect(buscarVoseo('Ingresa tu índice, elige el tee y anota la ronda')).toEqual([])
  })

  it('deja pasar el pretérito chileno de primera persona', () => {
    // Mismo grafema que el imperativo vos: acá NO es voseo y bloquear esto
    // dejaba el merge trancado por copy perfectamente chileno.
    for (const texto of [
      'Me inscribí en el torneo del sábado',
      'Ya elegí mi tee',
      'El tee que elegí quedó corto',
      'Te compartí la tarjeta por WhatsApp',
      'Nunca sentí tanta presión en el 18',
      'No subí el score todavía',
    ]) {
      expect(buscarVoseo(texto), texto).toEqual([])
    }
  })

  it('caza el imperativo vos de esas mismas formas cuando no hay marcador', () => {
    for (const texto of ['Inscribí a tu grupo', 'Elegí tu tee', 'Compartí la tarjeta']) {
      expect(buscarVoseo(texto).length, texto).toBe(1)
    }
  })

  it('"SOS" en mayúsculas es la señal de auxilio, no el verbo ser', () => {
    expect(buscarVoseo('Botón de SOS en la cancha')).toEqual([])
    expect(buscarVoseo('vos sos el organizador')).toEqual(['vos', 'sos'])
  })

  it('normaliza acentos descompuestos', () => {
    // "Copiá" se ve igual que "Copiá" pero son dos secuencias distintas.
    expect(buscarVoseo('Copiá el link')).toEqual(['Copiá'])
  })

  it('el patrón es nuevo en cada llamada (con /g el lastIndex es estado compartido)', () => {
    const a = patronVoseo('giu')
    a.exec('tenés tenés')
    expect(a.lastIndex).toBeGreaterThan(0)
    expect(patronVoseo('giu').lastIndex).toBe(0)
  })

  it('la lista no tiene duplicados ni entradas vacías', () => {
    expect(VOSEO.length).toBeGreaterThan(150) // no puede quedar en vacío ni adelgazar
    expect(new Set(VOSEO).size).toBe(VOSEO.length)
    expect(VOSEO.every((v: string) => v.trim() === v && v.length > 2)).toBe(true)
    // Una forma no puede estar en los dos grupos: decidiría distinto según cuál gane.
    const ambiguos = new Set(VOSEO_AMBIGUO)
    expect(VOSEO_INEQUIVOCO.filter((v: string) => ambiguos.has(v))).toEqual([])
  })
})

// ---------------------------------------------------------------------------

const RAIZ = join(__dirname, '..', '..', '..')
const CANONICA = join('scripts', 'lib', 'voseo.mjs')
const EXTENSIONES = /\.(tsx?|jsx?|mjs|cjs)$/

function archivos(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = join(dir, entrada.name)
    if (entrada.name === 'node_modules' || entrada.name.startsWith('.')) return []
    if (statSync(ruta).isDirectory()) return archivos(ruta)
    return EXTENSIONES.test(entrada.name) ? [ruta] : []
  })
}

/**
 * Lo que no cuenta como "otra lista". Cada excepción es un archivo nombrado, no
 * una carpeta: un permiso por carpeta deja entrar al detector número seis sin
 * que nadie se entere.
 *  - La canónica.
 *  - Los archivos de prompt del coach: son prosa para el modelo, con tres o
 *    cuatro ejemplos de lo que NO debe decir. No tienen que estar completos ni
 *    sincronizados, y meterles las 170 formas solo gastaría tokens en cada
 *    llamada. Lo que sale del coach igual se revisa con el detector
 *    (`intro.test.ts` y el smoke).
 *  - `number-guard.ts`: no es un detector de voseo. Es la lista de palabras que
 *    anuncian un número en la RESPUESTA DEL MODELO, y lista los dos registros a
 *    propósito ("terminás"/"terminas") porque matchea lo que el modelo escribe,
 *    no nuestro copy. Si se le sacaran las formas voseadas, el guard de números
 *    dejaría pasar un score inventado.
 *  - Este archivo: los casos de prueba del detector son, por definición, formas
 *    de voseo escritas a mano.
 */
const PERMITIDOS = [
  /[\\/]coach[\\/]prompts[\\/]identidad\.ts$/,
  /[\\/]coach[\\/]v3[\\/]prompts[\\/]sections[\\/](conocer|engagement)\.ts$/,
  /[\\/]coach[\\/]number-guard\.ts$/,
  /[\\/]unit[\\/]voseo\.test\.ts$/,
]

// Un comentario que menciona ejemplos ("Copiá", "ejecutá") no es una lista: una
// lista vive en código. Se sacan las líneas que son enteramente comentario, sin
// tocar las de código con un `//` al final (ahí un URL se comería la línea).
function sinComentarios(contenido: string): string {
  return contenido
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\/?\*)/.test(l))
    .join('\n')
}

describe('revisar un archivo entero, no línea por línea', () => {
  // Quien revisa un archivo tiene que pasarlo COMPLETO: la decisión sobre una
  // forma ambigua depende de la palabra anterior, y el salto de línea que
  // Prettier mete en medio de un JSX la deja fuera de la línea.
  const JSX = ['<p>', '  Te', '  compartí la tarjeta por WhatsApp', '</p>'].join('\n')

  it('el clítico de la línea anterior sigue valiendo', () => {
    expect(buscarVoseo(JSX)).toEqual([])
  })

  it('línea por línea, ese mismo copy chileno daba rojo', () => {
    // Esto es lo que hacía el canario y lo que trancaba merges.
    const porLinea = JSX.split('\n').flatMap((l) => buscarVoseo(l))
    expect(porLinea).toEqual(['compartí'])
  })

  it('ubica cada hallazgo en su línea', () => {
    const texto = ['const a = 1', 'Copiá el link', '', 'y tenés dos minutos'].join('\n')
    expect(
      buscarVoseoDetallado(texto).map((h) => `${lineaDe(texto, h.indice)}:${h.forma}`),
    ).toEqual(['2:Copiá', '4:tenés'])
  })
})

describe('la lista de voseo es la única', () => {
  it('ningún archivo de src/ ni scripts/ define su propia lista', () => {
    // Las formas salen de la canónica, no de literales: si se escriben acá, este
    // archivo se delata a sí mismo como "otra lista".
    const formas = [...VOSEO_INEQUIVOCO, ...VOSEO_AMBIGUO] as string[]
    // Lista = la forma aparece como token suelto ('jugá', "jugá") o como
    // alternativa de un regex ((jugá| , |jugá| , |jugá) ). En prosa no matchea,
    // así que un texto de ejemplo dentro de un test no cuenta.
    // El delimitador de la derecha va en lookahead a propósito: si se consume,
    // el `|` que cierra una alternativa no puede abrir la siguiente y los
    // elementos del medio (`|sumá|`) se escapan.
    const comoLista = new RegExp(`['"|(](${formas.join('|')})(?=['"|)])`, 'giu')

    const revisados = [join(RAIZ, 'src'), join(RAIZ, 'scripts')].flatMap(archivos)
    expect(revisados.length).toBeGreaterThan(100) // el escaneo no puede pasar en vacío

    const culpables: string[] = []
    for (const ruta of revisados) {
      const relativa = ruta.slice(RAIZ.length + 1)
      if (relativa === CANONICA || PERMITIDOS.some((p) => p.test(relativa))) continue
      const contenido = sinComentarios(readFileSync(ruta, 'utf8'))
      const encontradas = new Set(
        [...contenido.matchAll(comoLista)].map((m) => m[1].toLowerCase()),
      )
      // Dos alcanzan. Con el umbral en tres, un detector inline de dos formas
      // (`/\b(tenés|podés)\b/`, que es exactamente la pinta del que había en
      // aviso-indice.test.ts) pasaba de largo.
      if (encontradas.size >= 2) {
        culpables.push(`${relativa} → ${[...encontradas].join(', ')}`)
      }
    }

    expect(
      culpables,
      `Hay otra lista de voseo fuera de ${CANONICA}. Importa desde ahi ` +
        `(buscarVoseo/patronVoseo) en vez de repetir las formas:\n${culpables.join('\n')}`,
    ).toEqual([])
  })
})
