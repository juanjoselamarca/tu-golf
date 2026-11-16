/**
 * Códigos SQLSTATE de Postgres que el código interpreta (vía PostgREST `error.code`).
 * Fuente única: antes cada archivo repetía el literal ('23505' en import-round,
 * ronda-libre-finalizar, historial-torneo, publishDraft, startTournament…); los nuevos usos
 * importan de acá y los viejos migran cuando se toquen ("el que toca, ordena").
 */

/** unique_violation: la fila ya existe (insert duplicado / reintento idempotente). */
export const PG_UNIQUE_VIOLATION = '23505';
