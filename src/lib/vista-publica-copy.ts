// Copy de la vista pública "solo bruto" (decisión de producto, 08-oct-2026): un
// espectador sin sesión ve la clasificación BRUTA de un torneo neto. Fuente única
// del texto: el aviso del board, la cabecera y el label del formato lo leen de acá.

/** "<Formato real> · Clasificación bruta" en la cabecera; título del aviso. */
export const COPY_CLASIFICACION_BRUTA = 'Clasificación bruta'

/** Link del aviso, a login (vuelve al torneo). */
export const COPY_SOLO_BRUTO_CTA = 'Inicia sesión para ver el neto'

/** El visor CON sesión no pudo traer el neto (se reintenta solo): en lugar del CTA de login. */
export const COPY_SOLO_BRUTO_ERROR = 'No pudimos cargar el neto. Reintentando…'
