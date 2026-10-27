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
  // imperativo vos de verbos -er  →  -é
  'tené', 'hacé', 'poné', 'volvé', 'corré', 'aprendé', 'respondé', 'leé', 'vendé', 'perdé',
  // presente indicativo vos, verbos -ar  →  -ás
  'jugás', 'marcás', 'sumás', 'registrás', 'importás', 'mejorás', 'bajás', 'necesitás', 'buscás',
  'encontrás', 'llevás', 'dejás', 'usás', 'mirás', 'andás', 'llegás', 'ajustás', 'apretás',
  'lanzás', 'anotás', 'creás', 'empezás', 'armás', 'invitás', 'calculás', 'organizás', 'agregás',
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
// adverbios de tiempo o negación ("ya elegí", "nunca sentí"). NO van acá las
// conjunciones "y"/"pero": "entra y elegí tu tee" sigue siendo voseo.
const MARCADORES_PRIMERA_PERSONA = [
  'me', 'ya', 'yo', 'nunca', 'jamás', 'siempre', 'casi', 'cuando', 'que', 'cual', 'quien',
  'no', 'ayer', 'anoche', 'hoy', 'recién', 'apenas', 'lo', 'la', 'los', 'las', 'le', 'les',
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

function palabraPrevia(texto, indice) {
  const antes = texto.slice(0, indice)
  const m = antes.match(/([\p{L}]+)[^\p{L}]*$/u)
  return m ? m[1].toLowerCase() : ''
}

/**
 * Devuelve las formas de voseo encontradas (vacío = el texto está bien).
 * Normaliza a NFC para que un acento descompuesto (a + U+0301) también matchee.
 */
export function buscarVoseo(texto) {
  const t = String(texto).normalize('NFC')
  const hallazgos = []

  for (const m of t.matchAll(patronVoseo('giu'))) {
    if (!esFalsoPositivo(m[2], m[2])) hallazgos.push(m[2])
  }

  for (const m of t.matchAll(patronVoseoAmbiguo('giu'))) {
    const indice = m.index + m[1].length
    if (!MARCADORES_PRIMERA_PERSONA.includes(palabraPrevia(t, indice))) hallazgos.push(m[2])
  }

  return hallazgos
}
