// Fuente única del detector de voseo argentino en el copy de Golfers+.
// Regla: español de Chile, siempre "tú" ("ingresa", nunca "ingresá").
// La usan el canario del flujo de torneos y el validador de piezas de RRSS.

export const VOSEO = [
  'copiá', 'ejecutá', 'ingresá', 'elegí', 'tocá', 'hacé', 'poné', 'escribí', 'revisá', 'agregá', 'creá',
  'usá', 'podés', 'tenés', 'querés', 'sos', 'probá', 'mirá', 'asigná', 'verificá', 'guardá', 'cargá',
  'intentá', 'esperá', 'compartí', 'confirmá', 'seleccioná', 'presioná', 'abrí', 'cerrá', 'volvé',
  'fijate', 'avisá', 'configurá', 'completá', 'definí', 'anotá', 'recargá', 'editá', 'borrá', 'eliminá',
  'registrá', 'inscribí', 'cambiá', 'empezá', 'iniciá', 'contactá', 'descargá', 'buscá',
]

// Los límites entienden letras con tilde (el \b de JS no las considera letras).
// La clase va en una cadena aparte a propósito: dentro de un template literal
// `\p` pierde la barra y el set quedaría en los cuatro caracteres p{L}, con lo
// que "AviSoSolo" contaría como voseo.
const LETRA = '\\p{L}'
const FUENTE = `(^|[^${LETRA}])(${VOSEO.join('|')})(?![${LETRA}])`

/** Patrón nuevo en cada llamada: con la bandera /g el lastIndex es estado compartido. */
export function patronVoseo(banderas = 'iu') {
  return new RegExp(FUENTE, banderas)
}

/** Devuelve las palabras con voseo encontradas en un texto (vacío = está bien). */
export function buscarVoseo(texto) {
  return [...String(texto).matchAll(patronVoseo('giu'))].map((m) => m[2])
}
