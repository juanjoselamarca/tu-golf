// ─── ¿Está abierta la Timba libre en la app? ─────────────────────────────────
//
// Fuente única del interruptor de producto. Con `true` (desde el PR C2, que trajo la pestaña Juego con los puntos
// en vivo), Timba libre se puede elegir en el asistente de Nueva Ronda, pero solo quien tiene permiso
// (`usePuedeCrearTimba` pregunta a la ruta; hoy, admins y probadores de la Timba): al resto la fila le sigue mostrando "Próximamente".
// Con `false`, NADIE (tampoco un admin) la puede elegir; la "i" sigue abriendo el banner.
//
// Lo que NO cambia con esto: la API de crear (`POST /api/ronda-libre/create`) acepta `personalizado` solo a quien
// `puedeCrearJuegoPersonalizado` (en `./juego-personalizado.ts`, desde el PR B) deja.
//
// Los tests fuerzan los dos valores con `vi.mock` de este módulo (`usePuedeCrearTimba.test.ts`).
// Sin 'server-only': la leen componentes de cliente.
export const TIMBA_LIBRE_ABIERTA: boolean = true
