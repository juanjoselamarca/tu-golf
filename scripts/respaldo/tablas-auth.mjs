/**
 * Qué se respalda de `auth` y cómo se restaura. Fuente única para respaldo-diario.mjs y restaurar.mjs.
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
