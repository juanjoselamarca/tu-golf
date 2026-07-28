/**
 * Cooldown del sync de índice — FUENTE ÚNICA (regla "un concepto, una fuente").
 *
 * El índice WHS se recalcula ~diario, así que sincronizar más seguido no aporta
 * dato nuevo y solo carga fedegolf.cl (esto corre en CADA carga de página de todo
 * usuario vinculado). El botón "Actualizar" manual comparte el mismo cooldown.
 *
 * Vivía hardcodeado en el route (24h) mientras la UI de /perfil le decía al usuario
 * "prueba de nuevo en 4 horas" — el usuario volvía a las 4h y seguía sin poder.
 * Ahora el número y su texto salen de acá, así no se pueden volver a desincronizar.
 */
// `: number` a propósito: sin la anotación TS infiere el literal 24 y marca la
// pluralización de abajo como comparación imposible. Si mañana el cooldown baja a
// 1 hora, el texto sigue correcto sin tocar nada más.
export const SYNC_INDICE_COOLDOWN_HORAS: number = 24

export const SYNC_INDICE_COOLDOWN_MS = SYNC_INDICE_COOLDOWN_HORAS * 60 * 60 * 1000

/** Texto para el usuario, derivado del número real. Ej: "24 horas". */
export const SYNC_INDICE_COOLDOWN_LABEL =
  SYNC_INDICE_COOLDOWN_HORAS === 1 ? '1 hora' : `${SYNC_INDICE_COOLDOWN_HORAS} horas`
