// ─── ¿Está abierto Skins en la ronda libre? ──────────────────────────────────
//
// Interruptor de producto, hermano de `TIMBA_LIBRE_ABIERTA` (`./timba-libre-abierta.ts`). Con `true`, Skins se
// puede elegir en el asistente de Nueva Ronda, pero solo quien tiene permiso (`puedeCrearJuegoPersonalizado`, la
// misma regla de la Timba; hoy, admins y probadores): al resto la fila le muestra "Próximamente".
// Con `false`, NADIE lo elige (tampoco un admin); la "i" sigue abriendo la explicación.
//
// Arrancó en `false` (PR 1 de 3 de la UI de Skins, 25-nov-2026) y se prende en el PR 3 (tabla en vivo y liquidación):
// con el scorer de la X (PR 2) y la tabla, una ronda de skins se anota, se ve y se liquida como skins, y su cierre no va
// al historial (`tarjetaVaAlHistorial`). Sigue limitado a quien tiene el permiso de la Timba.
//
// Lo que NO cambia con esto: la API (`POST /api/ronda-libre/create`) acepta `skins` solo a quien
// `puedeCrearJuegoPersonalizado` deja, y la base lo repite con `usuario_puede_crear_timba()`.
// Sin 'server-only': lo leen componentes de cliente.
export const SKINS_LIBRE_ABIERTO: boolean = true
