import { rangoDeHoyos } from '@/golf/ronda-libre/resultado-de-la-timba'

/** "A", "A y B", "A, B y C": la enumeración de los avisos de Finalizar. */
function enumerar(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
}

/**
 * Aviso cuando Finalizar no llega al servidor — el mismo en los dos scorers. Los
 * golpes ya están en el teléfono; la ronda no se cierra a medias y se reintenta.
 */
export const AVISO_FINALIZAR_SIN_SERVIDOR = {
  title: 'No se pudo finalizar todavía',
  message: 'Sin conexión con el servidor. Tus golpes están guardados en este teléfono; vuelve a tocar Finalizar en un momento.',
} as const

/** Timba libre: quedan puntos especiales sin enviar. No se cierra: cerrada, la RPC ya no los acepta. */
export const AVISO_MARCAS_SIN_ENVIAR = {
  title: 'Hay puntos especiales sin enviar',
  message: 'Sin ellos el juego no queda completo. Los golpes ya están guardados; vuelve a tocar Finalizar en un momento.',
} as const

/**
 * La ronda ya no existe (quien la creó la descartó): el mismo aviso en los dos scorers,
 * al guardar un golpe o al finalizar. Las copias locales se borran y el jugador sale.
 */
export const AVISO_RONDA_NO_EXISTE = {
  title: 'Esta ronda ya no existe',
  message: 'Quien la creó la descartó.',
} as const

/**
 * P0001 al guardar la tarjeta del marcador con la ronda en curso: a él lo sacaron de la ronda (borrado del torneo
 * o retiro), pero sigue a cargo del scorer de grupo (creó la ronda o la administra). Al recargar su fila ya no
 * está, su tarjeta no se guarda y el cierre sale.
 */
export const AVISO_GRUPO_CAMBIO = {
  title: 'Este grupo cambió',
  message: 'Recarga la ronda y vuelve a tocar Finalizar.',
} as const

/**
 * P0001 al guardar la tarjeta con la ronda todavía en pie y sin nada que hacer desde este teléfono: lo sacaron
 * de la ronda (borrado del torneo o retiro). Reintentar falla siempre: no se invita a finalizar ni a reintentar,
 * y nada local se borra.
 */
export const AVISO_YA_NO_ESTAS_EN_LA_RONDA = {
  title: 'Ya no estás en esta ronda',
  message: 'Habla con quien organiza. Tus golpes siguen en este teléfono.',
} as const

/**
 * Lo mismo desde la ronda terminada («Guardar en mi historial»): ahí la tarjeta viene del servidor, no de este
 * teléfono, y su fila ya no está en esta tarjeta: se borró (sin golpes; borrar con golpes está bloqueado) o se
 * movió a otro grupo. No se puede prometer que los golpes siguen acá; quien organiza sabe dónde quedó.
 */
export const AVISO_YA_NO_ESTAS_EN_LA_RONDA_TERMINADA = {
  title: 'Ya no estás en esta ronda',
  message: 'Habla con quien organiza para recuperar tu tarjeta.',
} as const

/**
 * Finalizar encontró la ronda ya cerrada (por otro dispositivo, el organizador o el ganador del match): el
 * mismo aviso en los dos scorers, al leerla cerrada o cuando el envío de Finalizar responde que ya cerró.
 */
export const AVISO_RONDA_YA_FINALIZADA = {
  title: 'Esta ronda ya fue finalizada',
} as const

/**
 * El servidor rechazó en firme la tarjeta (golpe fuera de rango, parámetro inválido): reintentar
 * no cambia nada. Aprobado por Juanjo (09-nov-2026).
 */
export const AVISO_TARJETA_RECHAZADA = {
  title: 'No pudimos guardar tu tarjeta',
  message: 'Revisa los golpes anotados; tus scores siguen en tu teléfono.',
} as const

/**
 * Finalizar del scorer de grupo con tarjetas que el servidor rechazó en firme (golpe u hoyo inválido): la
 * ronda NO se cierra y los golpes siguen en el teléfono. Nombra a cada jugador
 * (o equipo) para que el marcador revise. Copy de Juanjo (10-nov-2026): "No pudimos guardar la tarjeta de
 * {nombre}. Revisa sus golpes y vuelve a finalizar." / "…las tarjetas de {A} y {B}…".
 * Sólo para rechazos: si lo que faltó fue señal, el aviso es `AVISO_FINALIZAR_SIN_SERVIDOR` (no sube ninguna).
 */
export function avisoTarjetasNoGuardadas(nombres: readonly string[]): { title: string; message: string } {
  const lista = enumerar(nombres)
  const tarjetas = nombres.length > 1 ? `las tarjetas de ${lista}` : `la tarjeta de ${lista}`
  return { title: `No pudimos guardar ${tarjetas}.`, message: 'Revisa sus golpes y vuelve a finalizar.' }
}

/**
 * Match play NETO sin sesión con un jugador cuyo índice está en su perfil (#511):
 * sin ese índice el match (y qué hoyos quedaron sin jugar) saldría como gross. No
 * se cierra a su nombre; los golpes siguen anotados.
 */
export const AVISO_FINALIZAR_MATCH_SIN_SESION = {
  title: 'Inicia sesión para finalizar',
  message: 'Si no tienes cuenta, el jugador con cuenta lo finaliza desde su teléfono. Tus golpes siguen anotados.',
} as const

/**
 * La pregunta de la hoja de confirmación de "Finalizar ronda", la misma en los dos
 * scorers: avisa cuántos hoyos se marcarán como par. `hoyosPorMarcar` sale de
 * `hoyosPorMarcarAlFinalizar`; en 0 ya no falta nada.
 */
export function textoConfirmarFinalizar(hoyosPorMarcar: number): string {
  if (hoyosPorMarcar === 0) return '¿Finalizar ronda?'
  return `¿Marcar ${hoyosPorMarcar} hoyo${hoyosPorMarcar > 1 ? 's' : ''} como par y finalizar?`
}

/**
 * Timba libre: las líneas bajo la pregunta de Finalizar cuando quedan hoyos sin anotar (fuera del que está en
 * pantalla). Al cerrar cuentan como "no jugó" (regla de Juanjo, 26-oct), pero no es lo mismo para todos
 * (decisión de Juanjo, 17-nov): un hoyo que nadie jugó no reparte puntos; uno que algunos anotaron lo pierde
 * quien no anotó. `hoyosSinJugar` sale de `hoyosQueQuedanSinJugarEnLaTimba` y `hoyosQueNadieJugo` de
 * `hoyosQueNadieJugoEnLaTimba` (subconjunto, en orden de juego). Sin hoyos, sin líneas.
 */
export function detalleHoyosSinAnotarTimba(hoyosSinJugar: readonly number[], hoyosQueNadieJugo: readonly number[]): string[] {
  const nadie = hoyosSinJugar.filter(h => hoyosQueNadieJugo.includes(h))
  const algunos = hoyosSinJugar.filter(h => !hoyosQueNadieJugo.includes(h))
  const lineas: string[] = []
  if (nadie.length === 1) lineas.push(`Hoyo ${nadie[0]} sin jugar: no reparte puntos.`)
  if (nadie.length > 1) lineas.push(`Hoyos ${rangoDeHoyos(nadie)} sin jugar: no reparten puntos.`)
  if (algunos.length === 1) lineas.push(`Quien no anotó el hoyo ${algunos[0]} lo pierde.`)
  if (algunos.length > 1) lineas.push(`Quien no anotó los hoyos ${rangoDeHoyos(algunos)} los pierde.`)
  return lineas
}

/**
 * Timba libre: la hoja de Finalizar completa. No pregunta por "marcar como par" (casi todo lo vacío queda como
 * no jugado): pregunta por la Timba, avisa los no jugados y, solo si aplica, quién queda con par en el hoyo en
 * pantalla (el que alguien ya anotó, `hoyoEnPantallaQueSeRellenaEnLaTimba`). Copy decidido (16-nov-2026).
 */
export function hojaFinalizarTimba(input: {
  hoyosSinJugar: readonly number[]
  hoyosQueNadieJugo: readonly number[]
  parEnPantalla: { hoyo: number; nombres: readonly string[] } | null
}): { titulo: string; detalle: string | undefined } {
  const { hoyosSinJugar, hoyosQueNadieJugo, parEnPantalla } = input
  const lineas = detalleHoyosSinAnotarTimba(hoyosSinJugar, hoyosQueNadieJugo)
  if (parEnPantalla && parEnPantalla.nombres.length > 0) {
    const verbo = parEnPantalla.nombres.length > 1 ? 'quedan' : 'queda'
    lineas.push(`En el hoyo ${parEnPantalla.hoyo}, ${enumerar(parEnPantalla.nombres)} ${verbo} con par.`)
  }
  return { titulo: '¿Finalizar la Timba?', detalle: lineas.length > 0 ? lineas.join(' ') : undefined }
}

/** Aviso al pie de la tarjeta completa de quien cierra la ronda. */
export const TEXTO_TARJETA_COMPLETA = 'Tarjeta completa · Finalizar ronda'

/** Un celular por equipo: el aviso al pie de la tarjeta completa invita a terminar el equipo (nadie «finaliza»). */
export const TEXTO_TARJETA_COMPLETA_EQUIPO = 'Tarjeta completa · Terminar mi equipo'

/**
 * Hoja de «Terminar mi equipo» (un celular por equipo; decisión de Juanjo 27-nov): cada celular cierra su tarjeta y la
 * ronda se cierra sola cuando termina el último equipo.
 */
export function hojaTerminarEquipo(hoyosPorMarcar: number): { titulo: string; detalle: string; textoConfirmar: string } {
  // Los hoyos vacíos del equipo reclamado se completan con par al terminar (como al finalizar): la hoja lo dice.
  const par = hoyosPorMarcar === 0 ? ''
    : hoyosPorMarcar === 1 ? 'El hoyo sin anotar queda con par. '
    : `Los ${hoyosPorMarcar} hoyos sin anotar quedan con par. `
  return {
    titulo: '¿Terminar tu equipo?',
    detalle: `${par}Tu tarjeta queda cerrada y pasas al leaderboard. La ronda se cierra sola cuando termine el último equipo.`,
    textoConfirmar: 'Terminar mi equipo',
  }
}

/** «Terminar mi equipo» no llegó al servidor: los golpes siguen en el teléfono y reintentar es seguro. */
export const AVISO_TERMINAR_SIN_SERVIDOR = {
  title: 'No se pudo terminar todavía',
  message: 'Sin conexión con el servidor. Tus golpes están guardados en este teléfono; vuelve a tocar Terminar mi equipo en un momento.',
} as const

/**
 * El servidor rechazó un golpe porque el equipo ya terminó su tarjeta (pasa si «Terminar mi equipo» se aplicó pero la
 * respuesta no llegó y la tarjeta se siguió editando). El golpe queda guardado en el teléfono y «Corregir mi tarjeta»
 * (vista en vivo) reabre el equipo y lo devuelve.
 */
export const AVISO_EQUIPO_YA_TERMINADO = {
  title: 'Tu equipo ya está terminado.',
  message: 'Toca «Corregir mi tarjeta» para cambiar un golpe.',
} as const

/**
 * Un equipo que anota este celular tiene un hoyo sin golpes: «Terminar» no lo rellena con par (solo el equipo que este
 * celular reclamó recibe par automático). Lo anota a mano y vuelve a terminar. También cubre al creador que tomó el
 * equipo de un celular que se apagó (Liberar o «Anotarlo yo»): el aviso dice qué hoyo falta.
 */
export function avisoEquipoIncompletoAlTerminar(nombreEquipo: string, hoyo: number | null): string {
  if (hoyo == null) return `A ${nombreEquipo} le faltan hoyos. Anótalos y vuelve a tocar Terminar mi equipo.`
  return `${nombreEquipo} no tiene golpes en el hoyo ${hoyo}. Anótalo y vuelve a tocar Terminar mi equipo.`
}
