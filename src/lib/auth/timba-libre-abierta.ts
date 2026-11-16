// ─── ¿Está abierta la Timba libre en la app? ─────────────────────────────────
//
// Fuente única del interruptor de producto. Con `false`, NADIE (tampoco un admin) puede elegir Timba libre en
// el asistente de Nueva Ronda: la fila muestra "Próximamente" a todos y la "i" sigue abriendo el banner. Motivo:
// la pestaña Juego (los puntos en vivo, PR C2) todavía no existe; sin ella, una Timba creada no muestra sus puntos.
//
// Lo que NO cambia con esto: la API de crear (`POST /api/ronda-libre/create`) sigue aceptando `personalizado` a
// los admins (`puedeCrearJuegoPersonalizado`, en `./juego-personalizado.ts`, desde el PR B).
//
// El PR C2 la da vuelta a `true` cuando la pestaña Juego exista; todo el flujo (elegir el juego, parejas, crear)
// ya está construido y testeado con `true` (los tests la fuerzan con `vi.mock` de este módulo).
// Sin 'server-only': la leen componentes de cliente.
export const TIMBA_LIBRE_ABIERTA: boolean = false
