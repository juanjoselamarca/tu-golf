// Fuente única del detector de voseo argentino en el copy de Golfers+.
// Regla: español de Chile, siempre "tú" ("ingresa", nunca "ingresá").
// La usan el canario del flujo de torneos, el test del copy de la home,
// el smoke del coach y el validador de piezas de RRSS. No crear otra lista:
// hubo tres a la vez y cada una dejaba pasar lo que las otras cazaban.

/**
 * Las formas de voseo escritas a mano, una por una: imperativo vos (-á/-é),
 * presente indicativo vos (-ás/-és/-ís), pronominales (sumate, fijate) y los
 * pronombres vos/sos. Las familias que se derivan o que decide la capa
 * estructural van más abajo; el export único es `VOSEO_INEQUIVOCO`.
 */
const FORMAS_ENUMERADAS = [
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
  // Ni esta terminación ni -és se pueden decidir por estructura: en -é está el
  // pretérito de primera persona de los verbos -ar ("jugué", "miré", "pensé") y
  // en -és los gentilicios y sustantivos ("inglés", "interés", "después"). Se
  // enumeran, y el barrido del 27-oct dejó claro que hay que mirarlas de nuevo
  // cada vez: 'devolvé' estaba vivo en un prompt del examen del coach.
  'tené', 'hacé', 'poné', 'volvé', 'corré', 'aprendé', 'respondé', 'leé', 'vendé', 'perdé',
  'devolvé', 'mantené', 'obtené', 'mové', 'traé',
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
  'aprendés', 'respondés', 'leés', 'vendés', 'entendés', 'creés', 'mantenés', 'obtenés',
  'merecés', 'debés', 'devolvés', 'movés', 'traés',
  // presente indicativo vos, verbos -ir  →  -ís
  'decís', 'elegís', 'sentís', 'seguís', 'salís', 'venís', 'vivís', 'subís', 'compartís',
  'descubrís', 'escribís', 'abrís', 'inscribís', 'definís', 'recibís', 'permitís', 'añadís', 'omitís',
  // imperativo pronominal vos
  // NO agregar 'date' ("date cuenta"): choca con el Date de JS y con cualquier
  // identificador `date`, y metió 113 falsos positivos en el canario de torneos.
  // 'prepárate' tampoco: con tilde es el imperativo de TÚ, correcto en Chile.
  'fijate', 'sumate', 'quedate', 'acordate', 'anotate', 'inscribite', 'registrate', 'acercate',
  'preparate', 'apurate',
]

/**
 * Imperativo vos + clítico pegado: su propia familia porque el español de Chile
 * EXIGE tilde en esas formas ("relájate", "apágalo", "suéltala"), así que la
 * versión sin tilde solo existe en voseo. Faltaban todas, y por eso el corpus
 * del coach ("comprometete con el target", "relajate caminando", "apagalo entre
 * tiros") pasó 12 formas por delante de cuatro controles distintos hasta llegar
 * a producción (27-oct-2026).
 *
 * Se enumeran en vez de deducirse: la regla estructural "palabra sin tilde
 * terminada en clítico" marca medio diccionario ('adelante', 'cliente',
 * 'pelota'). Solo el plural se deriva, más abajo.
 *
 * VETADAS a propósito, aunque sean voseo legítimo:
 *   'animate' → inglés en clases de Tailwind ('animate-spin', 'animate-pulse',
 *               '.card-animate'); el guión no es letra, así que el patrón SÍ
 *               matchea ahí. Vive hasta en organizador/, que este canario escanea.
 *   'tomate'  → es un tomate. Mismo motivo por el que 'Tomás' quedó fuera.
 */
const CLITICOS = [
  'comprometete', 'concentrate', 'enfocate', 'ocupate', 'preocupate', 'despreocupate',
  'acostumbrate', 'cuidate', 'decidite', 'dejate', 'olvidate', 'imaginate', 'levantate',
  'metete', 'movete', 'sentate', 'callate', 'relajate', 'programate', 'hablate', 'permitite',
  'asegurate', 'aseguráte', 'decite', 'conocelo', 'conocela', 'contale', 'contanos', 'mostrale',
  'preguntale', 'decile', 'decilo', 'hacelo', 'hacela', 'dejalo', 'dejala', 'mirala', 'miralo',
  'usalo', 'usala', 'probalo', 'probala', 'anotalo', 'anotala', 'revisalo', 'sacalo', 'sacala',
  'tiralo', 'tirala', 'soltalo', 'soltala', 'apagalo', 'apagala', 'regulalo', 'regulala',
  'regulála', 'pegale', 'ponele', 'parate',
]

/**
 * El plural se deriva: 'miralo' → 'miralos', 'contale' → 'contales'. Enumerar
 * solo el singular los dejaba pasar enteros, y escribir las dos versiones a
 * mano garantiza que algún día se desincronicen.
 */
const CLITICOS_PLURALES = CLITICOS.filter((f) => /(lo|la|le)$/u.test(f)).map((f) => `${f}s`)

/**
 * Raíces de verbos -ar que terminan en -ar/-er/-ir. Son las únicas formas de
 * voseo en -á/-ás que la capa estructural de abajo NO puede decidir: "esperá"
 * tiene exactamente la misma forma que "jugará" (raíz + á) y sin diccionario no
 * hay señal que las separe. Van enumeradas, y se escriben una vez: el
 * imperativo y el presente se derivan de la raíz.
 *
 * Esta lista es el precio REAL de la regla estructural, medido: el comentario
 * viejo decía "son pocos y los cubre la lista enumerada" y era falso
 * —'respirá', 'acelerá', 'considerá', 'generá', 'recuperá' estaban en el corpus
 * que llegó a producción y ninguna estaba enumerada—. Las raíces en -dr/-rr/-br
 * SÍ se deciden solas, porque los irregulares del futuro son un set cerrado.
 */
const RAICES_INDISTINGUIBLES = [
  // -ar: par(ar), separ(ar), prepar(ar)…
  'par', 'separ', 'prepar', 'compar', 'repar', 'dispar', 'declar', 'aclar', 'ampar',
  // -er: esper(ar), consider(ar), gener(ar)…
  'esper', 'consider', 'gener', 'aceler', 'desaceler', 'super', 'oper', 'alter', 'reiter',
  'toler', 'moder', 'enter', 'liber', 'exager', 'recuper', 'prosper', 'numer', 'esmer',
  // -ir: respir(ar), mir(ar), tir(ar)…
  'respir', 'inspir', 'retir', 'mir', 'tir', 'gir', 'admir', 'suspir', 'estir', 'aspir',
]
const VOSEO_DE_RAIZ_EN_R = RAICES_INDISTINGUIBLES.flatMap((r) => [`${r}á`, `${r}ás`])

/**
 * Formas que SOLO existen en voseo. Un match acá es siempre un error.
 *
 * El `Set` no es decoración: las familias derivadas pisan a propósito algunas
 * formas que ya estaban escritas a mano ('mirá', 'tirá', 'esperá'), y
 * deduplicar acá evita tener que cazar cuál es cuál cada vez que la lista crece.
 */
export const VOSEO_INEQUIVOCO = [
  ...new Set([...FORMAS_ENUMERADAS, ...CLITICOS, ...CLITICOS_PLURALES, ...VOSEO_DE_RAIZ_EN_R]),
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

// ---------------------------------------------------------------------------
// Capa estructural: toda palabra aguda terminada en -á / -ás
// ---------------------------------------------------------------------------
// Las listas de arriba son una red con agujeros, y se comprobó con números: un
// barrido del repo el 27-oct-2026 encontró 15 formas que ninguna lista cazaba
// ("insertá", "conversá", "reintentá", "entrenás", "puntuá", "reformulá",
// "promediás", "editás"…), varias en copy del coach ya en producción. Agregar
// esas 15 habría dejado la lista igual de incompleta para la 16ª.
//
// En español, una palabra terminada en -á o -ás tónica casi solo puede ser:
//   (1) imperativo vos de un verbo -ar  → "jugá", "insertá"   ← VOSEO
//   (2) presente indicativo vos         → "jugás", "entrenás" ← VOSEO
//   (3) futuro o condicional            → "jugará", "podrás"  ← correcto
//   (4) un puñado de palabras léxicas   → "está", "además"    ← correcto
// Y (3) se reconoce sin diccionario: el futuro se forma sobre el INFINITIVO,
// así que al quitarle la terminación queda una raíz en -ar/-er/-ir ("jugará" →
// "jugar"), o en -dr/-rr/-br en los irregulares ("podrá", "querrá", "habrá").
//
// El precio de esa regla, medido y no estimado: las raíces en -ar/-er/-ir son
// clase abierta, así que ahí la regla no puede decidir —"esperá" se ve
// exactamente igual que "jugará"— y esas formas quedan a cargo de
// RAICES_INDISTINGUIBLES, arriba. El comentario anterior decía "son pocos" y
// era falso: 'respirá', 'acelerá', 'considerá', 'generá' y 'recuperá' estaban
// en el corpus que llegó a producción y ninguna estaba enumerada.
//
// Las raíces en -dr/-rr/-br SÍ se deciden solas, porque los irregulares del
// futuro son un set CERRADO (podrá, tendrá, pondrá, saldrá, vendrá, valdrá,
// querrá, habrá, sabrá, cabrá, y sus derivados con prefijo: mantendrá,
// repondrá). Exigirlos por nombre en vez de aceptar cualquier "-brá" devuelve
// 'celebrá', 'cobrá', 'agarrá', 'ahorrá', 'quebrá' y 'cuadrá' al detector.
//
// -és tampoco se puede: ahí los gentilicios y sustantivos son legión ("inglés",
// "interés", "después") y el subjuntivo de tú termina igual ("cuando estés").
// -ís SÍ se incluye: ningún tiempo del español de tú termina en -ís tónica, así
// que 'preferís', 'repetís', 'medís' y 'dormís' se cazan sin enumerarlas. Lo
// legítimo en -ís es léxico y cerrado en la práctica: "país", "París", "anís" y
// los plurales de los sustantivos agudos en -í, que son préstamos ("esquís",
// "jabalís"). Si alguna vez aparece uno nuevo, el costo es un canario rojo
// sobre copy correcto — visible y de una línea—, no voseo colado a producción.
const RAIZ_DE_FUTURO = /(ar|er|ir)$/
const RAIZ_DE_FUTURO_IRREGULAR = /(podr|tendr|pondr|saldr|vendr|valdr|querr|habr|sabr|cabr)$/

/** Palabras agudas en -á/-ás/-ís que son español correcto, no voseo. */
export const AGUDAS_LEGITIMAS = [
  'está', 'estás', 'acá', 'allá', 'quizá', 'quizás', 'ojalá', 'sofá', 'papá', 'mamá', 'maná',
  'además', 'demás', 'atrás', 'detrás', 'jamás', 'compás',
  // Lo legítimo en -ís: dos sustantivos, un nombre propio y los plurales de los
  // agudos en -í (préstamos).
  'país', 'anís', 'parís', 'tunís',
  'esquís', 'jabalís', 'colibrís', 'bisturís', 'maniquís', 'rubís',
  // Nombres propios: el patrón es insensible a mayúsculas y la app muestra
  // países (banderas) y nombres de jugadores.
  'tomás', 'nicolás', 'panamá', 'canadá', 'bogotá',
]

/** ¿Esta palabra aguda en -á/-ás/-ís es voseo? Ver el bloque de arriba. */
export function esVoseoAgudo(palabra) {
  const p = String(palabra).normalize('NFC').toLowerCase()
  if (!/[\p{L}]{2,}(ás|á|ís)$/u.test(p)) return false
  if (AGUDAS_LEGITIMAS.includes(p)) return false
  // El futuro y el condicional solo existen en -á/-ás: una palabra en -ís que
  // no esté en la lista legítima es voseo, sin más vueltas.
  if (p.endsWith('ís')) return true
  const raiz = p.replace(/(ás|á)$/, '')
  return !RAIZ_DE_FUTURO.test(raiz) && !RAIZ_DE_FUTURO_IRREGULAR.test(raiz)
}

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

/** Patrón de cualquier palabra aguda en -á/-ás/-ís; quién es voseo lo dice `esVoseoAgudo`. */
export function patronAguda(banderas = 'giu') {
  return new RegExp(`(^|[^${LETRA}])(${LETRA}{2,}(?:ás|á|ís))(?![${LETRA}])`, banderas)
}

/**
 * Convierte los escapes `\n`, `\r` y `\t` del CÓDIGO FUENTE en espacios, sin
 * mover ningún índice (dos caracteres por dos espacios).
 *
 * Es un agujero real, no teórico: `'… al razonar.\nusá rondas_18'` en la
 * descripción de un tool del coach dejaba la "n" del escape pegada al verbo, y
 * para el límite de palabra eso era "nusá" — una palabra que no está en ninguna
 * lista. El voseo viajaba igual al modelo, porque en el string ya resuelto el
 * salto de línea existe.
 */
function neutralizarEscapes(texto) {
  return texto.replace(/\\[nrt]/g, '  ')
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
  const t = neutralizarEscapes(String(texto).normalize('NFC'))
  const hallazgos = []
  const vistos = new Set()
  const anotar = (forma, indice) => {
    if (vistos.has(indice)) return
    vistos.add(indice)
    hallazgos.push({ forma, indice })
  }

  for (const m of t.matchAll(patronVoseo('giu'))) {
    const indice = m.index + m[1].length
    if (!esFalsoPositivo(m[2], m[2])) anotar(m[2], indice)
  }

  for (const m of t.matchAll(patronVoseoAmbiguo('giu'))) {
    const indice = m.index + m[1].length
    if (!MARCADORES_PRIMERA_PERSONA.includes(palabraPrevia(t, indice))) anotar(m[2], indice)
  }

  // Capa estructural, después de las listas: las agudas en -á/-ás que ninguna
  // lista nombra. Un índice ya anotado no se duplica.
  for (const m of t.matchAll(patronAguda())) {
    const indice = m.index + m[1].length
    if (esVoseoAgudo(m[2])) anotar(m[2], indice)
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
