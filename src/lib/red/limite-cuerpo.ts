// FUENTE ÚNICA del tamaño máximo de un cuerpo que el cliente sube a una API route.
//
// Vercel corta en 4,5 MB cualquier request a una función y responde 413
// FUNCTION_PAYLOAD_TOO_LARGE en TEXTO PLANO, antes de que corra nuestro código: el
// servidor no puede devolver un mensaje propio. El cliente tiene que no pasarse.
// Se deja medio MB de margen para los bordes y headers del multipart.

/** Bytes máximos de archivos que el cliente manda en UN request. */
export const LIMITE_CUERPO_SUBIDA_BYTES = 4 * 1024 * 1024
