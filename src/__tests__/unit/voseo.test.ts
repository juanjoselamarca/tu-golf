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
  esVoseoAgudo,
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

describe('la palabra anterior se busca en la MISMA oración', () => {
  // El contexto de una forma ambigua es la palabra de antes, pero solo si está
  // en la misma frase. Cruzar un punto daba por chileno un voseo de verdad.
  it.each([
    ['El tee corto no. Elegí el que te acomoda', ['Elegí']],
    ['Mañana jugamos\n\nElegí tu grupo', ['Elegí']],
    ['Si no te acomoda: elegí otro tee', ['elegí']],
    // Y lo que la función existe para proteger sigue callado.
    ['no elegí ese palo porque pegaba corto', []],
    ['Te compartí la tarjeta por WhatsApp', []],
    ['Cuando elegí el driver me fue mal', []],
    // Salto de línea SIMPLE: es lo que Prettier mete en medio de una frase de
    // JSX, así que no corta la oración.
    ['<div>\n  Te\n  compartí la tarjeta\n</div>', []],
  ])('%s', (texto, esperado) => {
    expect(buscarVoseo(texto)).toEqual(esperado)
  })
})

// ---------------------------------------------------------------------------

const RAIZ = join(__dirname, '..', '..', '..')
const CANONICA = join('scripts', 'lib', 'voseo.mjs')
// El .json entra porque el corpus del coach es copy que el modelo cita.
const EXTENSIONES = /\.(tsx?|jsx?|mjs|cjs|json)$/

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
 *  - `canary-sin-voseo.test.ts`: su tabla MENCIONES no es un detector, es la
 *    lista de qué voseo CITADO a propósito se permite y en qué archivo (los
 *    prompts que lo prohíben nombrando las formas, los keywords del
 *    number-guard, los mensajes del jugador simulado del examen). No puede
 *    divergir en silencio, que es de lo que protege este guardia: el canario
 *    exige que cada forma declarada siga apareciendo, y una excepción que dejó
 *    de hacer falta lo pone rojo.
 *  - Este archivo: los casos de prueba del detector son, por definición, formas
 *    de voseo escritas a mano.
 */
const PERMITIDOS = [
  /[\\/]coach[\\/]prompts[\\/]identidad\.ts$/,
  /[\\/]coach[\\/]v3[\\/]prompts[\\/]sections[\\/](conocer|engagement)\.ts$/,
  /[\\/]coach[\\/]number-guard\.ts$/,
  /[\\/]__tests__[\\/]canary-sin-voseo\.test\.ts$/,
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

describe('imperativo pronominal con el clítico pegado', () => {
  // La familia que más se colaba. En Chile el clítico pegado obliga a la tilde
  // ("comprométete"), así que la forma sin tilde es voseo aunque no termine en
  // -á/-ás: ninguna regla estructural la alcanza y hay que enumerarla. El
  // corpus del coach tenía 12 de estas, todas invisibles para el detector.
  it.each([
    'comprometete',
    'enfocate',
    'relajate',
    'hablate',
    'programate',
    'apagalo',
    'soltala',
    'permitite',
    'decite',
    'acordate',
    'metete',
    'fijate',
  ])('%s', (forma) => {
    expect(buscarVoseo(`Antes del tiro, ${forma} y respira`), forma).toContain(forma)
  })

  it('caza los plurales, que se derivan de los singulares y no se escriben dos veces', () => {
    // "mirá el green" y "miralos a los dos" son el mismo imperativo vos; la
    // lista tenía solo el singular, así que el plural pasaba. Se derivan en el
    // detector (lo/la/le + s) para que agregar uno nuevo cubra los dos.
    for (const forma of ['miralos', 'contales', 'deciles', 'soltalas', 'apagalos']) {
      expect(buscarVoseo(`Antes del tiro, ${forma} y respira`), forma).toContain(forma)
    }
  })

  it('no caza el chileno con tilde ni las tres formas vetadas por medición', () => {
    // Los vetos no son teóricos: "animate" vive en las clases de Tailwind
    // (`animate-spin`), "parate" dentro de "comma-separated" y "tomate" es la
    // verdura. Si alguien los agrega a la lista, estos casos se ponen rojos.
    for (const texto of [
      'Comprométete con el target y ejecuta',
      'Enfócate en tu rutina',
      'className="animate-spin"',
      'una lista comma-separated de tees',
      'ensalada de tomate',
    ]) {
      expect(buscarVoseo(texto), texto).toEqual([])
    }
  })
})

describe('el clítico -me/-nos, la familia de la conversación', () => {
  // La que faltaba entera, y es la más probable en un coach que conversa:
  // "contame cómo te fue", "decime qué palo usaste". No termina en -á/-ás/-ís,
  // así que la capa estructural no la ve.
  it.each([
    'contame',
    'decime',
    'mostrame',
    'traeme',
    'poneme',
    'creeme',
    'mandame',
    'pasame',
    'ayudame',
    'explicame',
    'avisame',
  ])('%s', (forma) => {
    expect(buscarVoseo(`Antes del tiro, ${forma} y respira`), forma).toContain(forma)
  })

  it('el plural de primera persona se deriva del singular', () => {
    for (const forma of ['contanos', 'decinos', 'mostranos', 'avisanos', 'explicanos']) {
      expect(buscarVoseo(`Si pasa algo, ${forma} al toque`), forma).toContain(forma)
    }
  })

  it("'tiranos' queda fuera de la derivación: es el plural de tirano", () => {
    // El único choque de la derivación mecánica con el diccionario. Un texto de
    // mentalidad habla de "tiranos" sin una gota de voseo.
    expect(buscarVoseo('Los pensamientos tiranos no deciden el tiro')).toEqual([])
    // Y el singular sigue cazado, porque ahí no hay ambigüedad.
    expect(buscarVoseo('Ahora tirame el dato del viento')).toContain('tirame')
  })

  it('deja pasar el chileno con tilde y el monosílabo sin ella', () => {
    for (const texto of [
      'Cuéntame cómo te fue en el último torneo',
      'Dime qué palo usaste',
      'Muéstrame la tarjeta',
      'Dame un segundo antes del tiro',
      'Ayúdame a elegir el tee',
    ]) {
      expect(buscarVoseo(texto), texto).toEqual([])
    }
  })

  it("'cuentame' no entra: es la tilde que falta, no voseo", () => {
    // El voseo de ese verbo es 'contame'. Marcar 'cuentame' como voseo sería
    // mentir sobre el diagnóstico, y el canario existe para decir la verdad de
    // qué está mal escrito.
    expect(buscarVoseo('Cuentame cómo te fue')).toEqual([])
  })
})

describe('capa estructural: las agudas en -á/-ás que ninguna lista nombra', () => {
  // Esta capa existe porque enumerar no escala: cada barrido aparecía con 15
  // formas nuevas ("insertá", "conversá", "entrenás"…) y agregarlas dejaba la
  // lista igual de incompleta para la 16ª.
  it.each([
    'insertá',
    'conversá',
    'reintentá',
    'entrenás',
    'puntuá',
    'reformulá',
    'promediás',
    'editás',
  ])('caza %s sin tenerla enumerada', (forma) => {
    expect(esVoseoAgudo(forma), forma).toBe(true)
    expect(buscarVoseo(`Después ${forma} el dato`), forma).toContain(forma)
  })

  it('deja pasar el futuro y el condicional, que se forman sobre el infinitivo', () => {
    // La señal es la raíz: "jugará" → "jugar". Los irregulares se exigen por
    // NOMBRE (ver el caso de abajo), no por su terminación.
    for (const forma of [
      'jugará',
      'jugarás',
      'podrá',
      'podrás',
      'habrá',
      'querrá',
      'saldrá',
      'vendrás',
      'mantendrá',
      'repondrás',
      'valdrá',
      'cabrá',
      'celebrará',
      'cobrarás',
    ]) {
      expect(esVoseoAgudo(forma), forma).toBe(false)
    }
    expect(buscarVoseo('Mañana jugará desde el tee blanco y habrá viento')).toEqual([])
  })

  it('los irregulares del futuro son un set cerrado, no cualquier -dr/-rr/-br', () => {
    // Medido el 27-oct-2026: aceptar cualquier raíz en -dr/-rr/-br como futuro
    // dejaba fuera una familia entera de imperativos vos, y tres de estas
    // formas estaban en el corpus que ya vivía en producción. El set de
    // irregulares reales (podrá, tendrá, pondrá, saldrá, vendrá, valdrá,
    // querrá, habrá, sabrá, cabrá + prefijos) se escribe completo porque está
    // cerrado: el español no suma verbos irregulares.
    for (const forma of ['celebrá', 'cobrá', 'agarrá', 'ahorrá', 'quebrá', 'cuadrá']) {
      expect(esVoseoAgudo(forma), forma).toBe(true)
      expect(buscarVoseo(`Antes del tiro, ${forma} el resultado`), forma).toContain(forma)
    }
  })

  it('-ís también se decide por estructura: ningún tiempo de tú termina así', () => {
    // El futuro y el pretérito solo existen en -á/-ás, así que en -ís no hay
    // ambigüedad que proteger. Lo trajo un caso real: "Cuando te unís, tAIger+
    // hace lo mismo" estaba en la demo pública del coach y ninguna lista lo
    // nombraba. Lo léxico en -ís es cerrado en la práctica.
    for (const forma of ['preferís', 'repetís', 'medís', 'dormís', 'unís', 'omitís']) {
      expect(esVoseoAgudo(forma), forma).toBe(true)
    }
    for (const forma of ['país', 'París', 'anís', 'esquís', 'jabalís', 'maní']) {
      expect(esVoseoAgudo(forma), forma).toBe(false)
    }
    expect(buscarVoseo('En el país, con anís de París')).toEqual([])
    expect(buscarVoseo('Cuando te unís, el coach hace lo mismo')).toEqual(['unís'])
  })

  it('deja pasar las agudas léxicas y los nombres propios', () => {
    for (const forma of ['está', 'estás', 'acá', 'además', 'quizás', 'ojalá', 'Tomás', 'Panamá']) {
      expect(esVoseoAgudo(forma), forma).toBe(false)
    }
    expect(buscarVoseo('Acá está tu índice, además de tus estadísticas')).toEqual([])
  })

  it('no se extiende a -és, donde mandan los gentilicios y el subjuntivo', () => {
    // Acá la capa estructural para: "inglés", "interés" y el subjuntivo de tú
    // ("cuando estés") terminan igual que "tenés". El precio es que las formas
    // vos en -és se enumeran una por una, y el caso de abajo lo cobra.
    expect(buscarVoseo('un torneo inglés, cuando estés listo, después del interés')).toEqual([])
  })

  it('las raíces que terminan en r quedan a cargo de la lista, no de la regla', () => {
    // "esperá" se ve exactamente igual que "jugará" (quitar -á deja una raíz en
    // -ar), así que la regla NO puede decidir y devuelve false a propósito. Esa
    // familia va enumerada por raíz, y el detector completo sí la caza: cinco de
    // estas estaban en el corpus que llegó a producción.
    for (const forma of [
      'esperá',
      'respirá',
      'acelerá',
      'considerá',
      'generá',
      'recuperá',
      // Las que agregó la segunda vuelta de revisión: la lista es clase abierta
      // y se completa cuando alguien la mira de nuevo, no cuando se adivina.
      'liderá',
      'cooperá',
      'desesperá',
      'perseverá',
      'expirá',
      'transpirá',
      'conspirá',
    ]) {
      expect(esVoseoAgudo(forma), `${forma}: la regla no puede decidir`).toBe(false)
      expect(buscarVoseo(`Ahora ${forma} el dato`), forma).toContain(forma)
    }
    // Y el futuro de esos mismos verbos sigue pasando.
    expect(buscarVoseo('Mañana esperará en el tee y considerará el viento')).toEqual([])
    expect(buscarVoseo('El que liderará el grupo cooperará con el marcador')).toEqual([])
  })

  it('las formas vos en -é/-és enumeradas después de la revisión', () => {
    // La familia -é/-és es lista con agujeros por diseño. Estas se colaban
    // todas, y "devolvé" estaba en el prompt del juez del examen del coach
    // mientras el canario se veía verde.
    for (const forma of [
      'devolvé',
      'mantené',
      'obtené',
      'mové',
      'traé',
      'mantenés',
      'obtenés',
      'merecés',
      'debés',
      'devolvés',
    ]) {
      expect(buscarVoseo(`Si cumple, ${forma} la lista vacía`), forma).toContain(forma)
    }
  })
})

describe('los escapes del código fuente no esconden el voseo', () => {
  it('un "\\n" pegado al verbo ya no lo vuelve otra palabra', () => {
    // Caso real en la descripción de un tool del coach: '… al razonar.\nusá
    // rondas_18'. Para el límite de palabra eso era "nusá", que no está en
    // ninguna lista, y el voseo viajaba igual al modelo porque en el string ya
    // resuelto el salto de línea existe.
    expect(buscarVoseo('No inventes.\\nusá rondas_18 para el promedio')).toEqual(['usá'])
  })
})

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
    // Las barras van en los dos lados: sin ellas, un detector inline
    // /tenés|podés|querés/u solo contaba la forma del MEDIO (la primera no
    // tiene un "|" delante, la última no lo tiene detrás) y con una sola forma
    // pasaba por debajo del umbral.
    const comoLista = new RegExp(`['"|(/](${formas.join('|')})(?=['"|)/])`, 'giu')

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
