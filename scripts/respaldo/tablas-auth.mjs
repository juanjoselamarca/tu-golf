/**
 * Qué se respalda y cómo se restaura. Fuente única para respaldo-diario.mjs y restaurar.mjs.
 *
 * - `SCHEMAS_RESPALDADOS`: los schemas que se respaldan ENTEROS, tabla por tabla. `respaldos` entra
 *   junto a `public` porque ahí viven las copias que toma una migración antes de anular datos (la
 *   primera, `yardaje_blanco_dorado_20261030`, es el ÚNICO lugar donde quedan esas yardas): si el
 *   respaldo diario no las levantara, el único respaldo de la copia de seguridad sería la propia base.
 *   Vive acá y no en cada script porque el dump los recorre y `restaurar.mjs` valida `--tabla` contra
 *   la misma lista: con una copia en cada lado, agregar un schema al dump dejaba sus tablas
 *   respaldadas pero no restaurables (fue justo el bug del PR #697). `auth` NO va en la lista: de ahí
 *   se respaldan tablas elegidas a dedo (`AUTH_TABLAS`), no el schema completo.
 *
 * - `sinColumnas`: secretos de un solo uso que no salen de Supabase (no sirven para reconstruir una cuenta).
 * - `alRestaurar`: valor con que vuelven esas columnas. GoTrue las lee como string de Go: un NULL rompe el
 *   login ("converting NULL to string is unsupported"), así que vuelven como '' (su valor en una cuenta sana).
 * - `auth.mfa_factors` NO se respalda: un factor TOTP sin su secreto deja al usuario fuera, y guardar el secreto
 *   no vale el riesgo. Si alguna vez hay factores, el usuario re-enrola.
 */
const TOKENS_USUARIO = ['confirmation_token', 'recovery_token', 'email_change_token_new', 'email_change_token_current', 'reauthentication_token', 'phone_change_token']

export const AUTH_TABLAS = {
  'auth.users': { sinColumnas: TOKENS_USUARIO, alRestaurar: Object.fromEntries(TOKENS_USUARIO.map(c => [c, "''"])) },
  'auth.identities': { sinColumnas: [], alRestaurar: {} },
}

export const NO_RESTAURABLES = ['auth.mfa_factors']

/** Schemas que se respaldan completos (ver el encabezado). `auth` no: de ahí van solo `AUTH_TABLAS`. */
export const SCHEMAS_RESPALDADOS = ['public', 'respaldos']

/** De qué schemas acepta una tabla `restaurar.mjs`: los que se respaldan enteros, más `auth`. */
export const SCHEMAS_RESTAURABLES = [...SCHEMAS_RESPALDADOS, 'auth']

/**
 * ¿`--tabla` nombra una tabla que se puede restaurar? Es el guard que corre ANTES de armar
 * cualquier SQL de escritura contra prod, así que vive acá, junto a la lista, y con test propio
 * (`tablas-auth.test.mjs`): el predicado ya se escribió mal una vez, con un regex armado por
 * interpolación donde la barra del `\.` se perdió dentro de un template literal y el punto quedó
 * de comodín — `authXusers` pasaba. Por eso NO se arma ningún patrón: se parte en dos, el schema
 * se compara por igualdad y solo el nombre de la tabla usa un regex literal, que no se interpola.
 * Exigir exactamente dos partes deja fuera `public.a.b` y cualquier cosa sin punto.
 */
export function esTablaRestaurable(tabla) {
  const partes = String(tabla ?? '').split('.')
  return partes.length === 2 && SCHEMAS_RESTAURABLES.includes(partes[0]) && /^[a-z_][a-z0-9_]*$/.test(partes[1])
}
