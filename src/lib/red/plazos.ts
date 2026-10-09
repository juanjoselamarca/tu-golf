// FUENTE ÚNICA de los plazos de red del cliente (cuánto se espera a una consulta,
// fetch + cuerpo, antes de darla por perdida). Sin dependencias: lo importan tanto
// hooks ('use client') como capas de datos y componentes.

/**
 * Una consulta del polling en vivo (ronda libre y torneo). Una consulta colgada
 * (base o red lenta) no puede bloquear el polling, que espera la que está en curso.
 */
export const TIMEOUT_EN_VIVO_MS = 8_000

/** Chequeo de salud del banner de estado (`/api/health`). */
export const PLAZO_SALUD_MS = 10_000

/**
 * Inscripción a un torneo (join-info, inscribirse, guest-join): señal móvil pobre en
 * cancha; más holgado que el polling porque es una acción puntual del jugador.
 */
export const PLAZO_INSCRIPCION_MS = 12_000
