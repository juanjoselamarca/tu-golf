// ─── ¿Está abierto Skins en la ronda libre? ──────────────────────────────────
//
// Interruptor de producto, hermano de `TIMBA_LIBRE_ABIERTA` (`./timba-libre-abierta.ts`). Con `true`, Skins se
// puede elegir en el asistente de Nueva Ronda, pero solo quien tiene permiso (`puedeCrearJuegoPersonalizado`, la
// misma regla de la Timba; hoy, admins y probadores): al resto la fila le muestra "Próximamente".
// Con `false`, NADIE lo elige (tampoco un admin); la "i" sigue abriendo la explicación.
//
// Arranca en `false` (PR 1 de 3 de la UI de Skins, 25-nov-2026): crear la ronda ya funciona, pero el scorer con la
// tecla X y la liquidación llegan en los PR 2 y 3. Una ronda de skins abierta hoy se anotaría como stroke play y su
// cierre intentaría ir al historial (el CHECK de historical_rounds la rechaza). El PR del scorer lo pasa a `true`.
//
// Lo que NO cambia con esto: la API (`POST /api/ronda-libre/create`) acepta `skins` solo a quien
// `puedeCrearJuegoPersonalizado` deja, y la base lo repite con `usuario_puede_crear_timba()`.
// Sin 'server-only': lo leen componentes de cliente.
export const SKINS_LIBRE_ABIERTO: boolean = false
