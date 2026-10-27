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
 * Lo que no cuenta como "otra lista":
 *  - La canónica.
 *  - Los prompts del coach: son prosa para el modelo, con tres o cuatro ejemplos
 *    de lo que NO debe decir. No tienen que estar completos ni sincronizados, y
 *    meterles las 170 formas solo gastaría tokens en cada llamada. Lo que sale
 *    del coach igual se revisa con el detector (`intro.test.ts` y el smoke).
 *  - Este archivo: los casos de prueba del detector son, por definición, formas
 *    de voseo escritas a mano.
 */
const PERMITIDOS = [
  /[\\/]coach[\\/](v3[\\/])?prompts[\\/]/,
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
      if (encontradas.size >= 3) {
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
