// Fuente única del detector de voseo argentino en el copy de Golfers+.
// Regla: español de Chile, siempre "tú" ("ingresa", nunca "ingresá").
// La usan el canario del flujo de torneos, el test del copy de la home,
// el smoke del coach y el validador de piezas de RRSS. No crear otra lista:
// hubo tres a la vez y cada una dejaba pasar lo que las otras cazaban.

/**
 * Formas que SOLO existen en voseo. Un match acá es siempre un error.
 * Imperativo vos (-á/-é), presente indicativo vos (-ás/-és/-ís), pronominales
 * (sumate, fijate) y los pronombres vos/sos.
 */
export const VOSEO_INEQUIVOCO = [
  // pronombres y ser
  'vos', 'sos',
  // imperativo vos de verbos -ar  →  -á
  'copiá', 'ejecutá', 'ingresá', 'tocá', 'revisá', 'agregá', 'creá', 'usá', 'probá', 'mirá',
  'asigná', 'verificá', 'guardá', 'cargá', 'intentá', 'esperá', 'confirmá', 'seleccioná',
  'presioná', 'cerrá', 'avisá', 'configurá', 'completá', 'anotá', 'recargá', 'editá', 'borrá',
  'eliminá', 'registrá', 'cambiá', 'empezá', 'iniciá', 'contactá', 'descargá', 'buscá', 'jugá',
  'armá', 'sumá', 'marcá', 'andá', 'dejá', 'contá', 'mostrá', 'conectá', 'bajá', 'mejorá',
  'ajustá', 'apretá', 'lanzá', 'llevá', 'encontrá', 'invitá', 'acercá', 'prepará', 'calculá',
  'sacá', 'pegá', 'apuntá', 'organizá', 'publicá', 'sincronizá', 'actualizá', 'filtrá', 'ordená',
  'ganá', 'hablá', 'pensá', 'mandá', 'tirá', 'llamá', 'pagá', 'firmá', 'escuchá', 'tomá',
  // imperativo vos de verbos -er  →  -é
  'tené', 'hacé', 'poné', 'volvé', 'corré', 'aprendé', 'respondé', 'leé', 'vendé', 'perdé',
  // imperativo vos de verbos -ir  →  -í, cuando el pretérito de primera persona
  // es irregular y por lo tanto NO colisiona ("vení" vs "vine", "decí" vs "dije").
  // Los que sí colisionan ("elegí", "subí") viven en VOSEO_AMBIGUO.
  'vení', 'decí',
  // presente indicativo vos, verbos -ar  →  -ás
  'jugás', 'marcás', 'sumás', 'registrás', 'importás', 'mejorás', 'bajás', 'necesitás', 'buscás',
  'encontrás', 'llevás', 'dejás', 'usás', 'mirás', 'andás', 'llegás', 'ajustás', 'apretás',
  'lanzás', 'anotás', 'creás', 'empezás', 'armás', 'invitás', 'calculás', 'organizás', 'agregás',
  'ganás', 'hablás', 'pensás', 'mandás', 'tirás', 'llamás', 'pagás',
  // NO agregar 'tomás': "Tomás" es un nombre de pila corriente en Chile y el
  // patrón es insensible a mayúsculas, así que marcaría a cada Tomás del copy.
  // Mismo motivo por el que 'date' y 'prepárate' están vetados más abajo.
  // presente indicativo vos, verbos -er  →  -és
  'tenés', 'querés', 'podés', 'sabés', 'hacés', 'ponés', 'perdés', 'conocés', 'volvés', 'corrés',
  'aprendés', 'respondés', 'leés', 'vendés', 'entendés', 'creés',
  // presente indicativo vos, verbos -ir  →  -ís
  'decís', 'elegís', 'sentís', 'seguís', 'salís', 'venís', 'vivís', 'subís', 'compartís',
  'descubrís', 'escribís', 'abrís', 'inscribís', 'definís', 'recibís', 'permitís', 'añadís',
  // imperativo pronominal vos
  // NO agregar 'date' ("date cuenta"): choca con el Date de JS y con cualquier
  // identificador `date`, y metió 113 falsos positivos en el canario de torneos.
  // 'prepárate' tampoco: con tilde es el imperativo de TÚ, correcto en Chile.
  'fijate', 'sumate', 'quedate', 'acordate', 'anotate', 'inscribite', 'registrate', 'acercate',
  'preparate', 'apurate',
]

/**
 * Imperativo vos de verbos -er/-ir, que se escribe **igual** que el pretérito
 * de primera persona del español estándar: "Elegí tu tee" (voseo) vs "Ya elegí
 * mi tee" (correcto en Chile). Solo cuentan como voseo cuando NO hay delante un
 * marcador de primera persona. Sin esta distinción el canario bloqueaba el
 * merge por copy perfectamente chileno.
 */
// Muletillas rioplatenses que no son formas verbales pero delatan igual.
export const MULETILLAS = ['dale que']

export const VOSEO_AMBIGUO = [
  'elegí', 'escribí', 'compartí', 'definí', 'abrí', 'inscribí', 'salí', 'viví', 'descubrí',
  'sentí', 'seguí', 'subí', 'recibí', 'decidí', 'añadí', 'repetí', 'medí', 'conseguí', 'pedí',
  'permití', 'corregí', 'imprimí', 'serví', 'partí',
]

/** Compatibilidad: la lista completa, para quien solo quiera enumerarlas. */
export const VOSEO = [...VOSEO_INEQUIVOCO, ...MULETILLAS, ...VOSEO_AMBIGUO]

// Palabras que, delante de un ambiguo, lo vuelven pretérito de primera persona:
// clíticos de objeto ("te compartí el link"), relativos ("el tee que elegí") y
// adverbios que no admiten imperativo detrás ("ya elegí", "nunca sentí",
// "apenas subí"). NO van acá las conjunciones "y"/"pero": "entra y elegí tu
// tee" sigue siendo voseo.
//
// Tampoco van 'siempre' ni 'hoy', aunque parezcan del mismo tipo: los dos
// preceden a un imperativo con toda naturalidad en copy de marketing ("Hoy
// inscribe a tu grupo", "Siempre elige el tee que te acomoda"), así que su
// versión voseada se nos colaba. Ante la duda, falso positivo: uno bloquea un
// merge y lo ve un humano al toque; un falso negativo publica voseo argentino.
const MARCADORES_PRIMERA_PERSONA = [
  'me', 'ya', 'yo', 'nunca', 'jamás', 'casi', 'cuando', 'que', 'cual', 'quien',
  'no', 'ayer', 'anoche', 'recién', 'apenas', 'lo', 'la', 'los', 'las', 'le', 'les',
  'se', 'nos', 'te',
]

// Los límites entienden letras con tilde (el \b de JS no las considera letras).
// La clase va en una cadena aparte a propósito: dentro de un template literal
// `\p` pierde la barra y el set quedaría en los cuatro caracteres p{L}, con lo
// que "AviSoSolo" contaría como voseo.
const LETRA = '\\p{L}'

function fuente(formas) {
  return `(^|[^${LETRA}])(${formas.join('|')})(?![${LETRA}])`
}

/**
 * Patrón de las formas inequívocas. Nuevo en cada llamada: con la bandera /g el
 * lastIndex es estado compartido entre llamadas.
 */
export function patronVoseo(banderas = 'iu') {
  return new RegExp(fuente([...VOSEO_INEQUIVOCO, ...MULETILLAS]), banderas)
}

/** Patrón de las formas ambiguas, sin resolver el contexto. */
export function patronVoseoAmbiguo(banderas = 'iu') {
  return new RegExp(fuente(VOSEO_AMBIGUO), banderas)
}

// "SOS" en mayúsculas es la señal de auxilio, no el verbo ser.
function esFalsoPositivo(palabra, crudo) {
  return palabra.toLowerCase() === 'sos' && crudo === 'SOS'
}

/**
 * La palabra anterior a una forma ambigua, SI está en la misma oración.
 *
 * El corte importa: "El tee corto no. Elegí el que te acomoda" tiene "no"
 * delante, pero del otro lado de un punto, así que no es el "no" de "no elegí".
 * Sin cortar, esa frase (voseo de verdad) se daba por chilena. Se corta en
 * puntuación fuerte y en línea en blanco, no en el salto de línea simple:
 * Prettier mete saltos simples EN MEDIO de una frase de JSX, y cortar ahí
 * devolvería el falso positivo que esta función existe para evitar.
 */
function palabraPrevia(texto, indice) {
  const antes = texto.slice(0, indice)
  const corte = Math.max(
    ...[...antes.matchAll(/[.!?;:{}()<>]|\r?\n\s*\r?\n/g)].map((m) => m.index + m[0].length),
    0,
  )
  const m = antes.slice(corte).match(/([\p{L}]+)[^\p{L}]*$/u)
  return m ? m[1].toLowerCase() : ''
}

/**
 * Igual que `buscarVoseo`, pero devuelve `{ forma, indice }` con la posición en
 * el texto. Existe porque la decisión sobre una forma ambigua depende de la
 * palabra ANTERIOR: quien revisa un archivo tiene que pasarlo entero y derivar
 * la línea del índice. Si parte el archivo en líneas y consulta línea por
 * línea, el salto de línea que Prettier mete entre el clítico y el verbo
 * ("…\n  Te\n  compartí la tarjeta") borra el contexto y el control se vuelve
 * rojo con copy chileno correcto.
 *
 * Normaliza a NFC para que un acento descompuesto (a + U+0301) también matchee;
 * los índices son los del texto normalizado.
 */
export function buscarVoseoDetallado(texto) {
  const t = String(texto).normalize('NFC')
  const hallazgos = []

  for (const m of t.matchAll(patronVoseo('giu'))) {
    const indice = m.index + m[1].length
    if (!esFalsoPositivo(m[2], m[2])) hallazgos.push({ forma: m[2], indice })
  }

  for (const m of t.matchAll(patronVoseoAmbiguo('giu'))) {
    const indice = m.index + m[1].length
    if (!MARCADORES_PRIMERA_PERSONA.includes(palabraPrevia(t, indice)))
      hallazgos.push({ forma: m[2], indice })
  }

  return hallazgos.sort((a, b) => a.indice - b.indice)
}

/** Las formas de voseo encontradas (vacío = el texto está bien). */
export function buscarVoseo(texto) {
  return buscarVoseoDetallado(texto).map((h) => h.forma)
}

/** Número de línea (1-based) de un índice dentro del texto. */
export function lineaDe(texto, indice) {
  return String(texto).normalize('NFC').slice(0, indice).split('\n').length
}
