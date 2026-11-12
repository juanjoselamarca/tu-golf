# Corregir una ronda libre en curso — propuesta revisada

> 12-nov-2026 · Origen: inbox 8a0b2270 / PR #786 · Prioridad (Juanjo): después de #779 y del fix "HCP siempre a 18".
> Estado: **propuesta revisada, sin implementar.** Revisión: `refactor-arquitecto` (Fable), sobre el código real.

## 1. Qué pidió Juanjo

Un botón "Corregir" para arreglar fat fingers en una ronda libre ya creada, a mitad de ronda. "Algo simple sí o sí."
Alcance listado: formato, hándicap (si es neto), nombre, tee, 9 o 18 hoyos. Además aprobó 5 ideas: jugador que llega
tarde, retirar jugador, hoyo de inicio, quién anota y **aviso visible al grupo de cada corrección** (la más importante:
en grupos que apuestan, un cambio silencioso genera desconfianza).

**Regla de fondo:** lo anotado son golpes gross por hoyo. Se corrige todo lo que se recalcula sobre esos golpes;
nada que los cambie.

**Regla de producto vigente (12-nov):** el HCP visible es SIEMPRE el de 18 hoyos; la fórmula 9h solo por dentro.
Toda pantalla de este feature (confirmación antes/después, aviso al grupo) la cumple.

## 2. Propuesta original (antes de la revisión)

- Entrega 1: nombre, índice, tee, gross↔neto, formato individual↔individual, aviso al grupo, todo editable antes
  del primer golpe. Solo el creador.
- Entrega 2: 18↔9, hoyo de inicio, jugador tarde, retirar jugador, quién anota.
- Bloqueado con hoyos jugados: cambiar de/hacia bola compartida, cambiar cancha o recorrido.

## 3. Lo que encontró la revisión (hechos del código)

| # | Hallazgo | Evidencia | Consecuencia |
|---|---|---|---|
| 1 | El neto de ronda libre se **deriva al leer**, no se guarda | `courseHandicapsDeRonda`, `src/lib/data/ronda-libre.ts:119-165` | Corregir índice o tee recalcula todo solo. Es lo que hace barato el feature. |
| 2 | Scramble y foursome **congelan** `handicap_equipo` / `handicap_equipo_juego` al crear | creación de ronda | Corregir índice/tee en esos formatos exige recalcular el equipo: no va en la entrega 1. |
| 3 | El creador ya puede hacer PATCH de **cualquier columna** por RLS | policies `actualizar_ronda`, `gestionar_jugadores` | Hoy existe una "corrección" silenciosa, sin aviso ni registro. Hay que cerrarla. |
| 4 | No hay realtime: el grupo hace polling de `/live` cada 10 s vía CDN | `/live` | El aviso necesita una señal en `/live` (contador de revisión), no un canal nuevo. |
| 5 | No existe registro de cambios | — | El aviso necesita una tabla de log. |
| 6 | El historial WHS se escribe al **finalizar** | finalize | Corregir antes de finalizar no ensucia el historial. |
| 7 | `displayHcpMap` ya muestra el HCP de 18 en la vista en vivo | `ronda-libre.ts:272-299` | Excepción: loop de 9 en cancha multi-loop muestra `round(índice)`. El problema "HCP a 9" está en el asistente (`useHandicapDeCancha.ts:34`), no en el live. |

## 4. Simplificaciones

1. **Una sola RPC** `corregir_ronda_libre` (SECURITY DEFINER), con el patrón de `descartar_ronda_libre`: lock de la
   fila, es el creador, `en_curso`, no demo, no torneo, no Timba. Una puerta, no N endpoints.
2. **Se elimina "todo editable antes del primer golpe".** Para eso ya existen descartar y crear de nuevo; un segundo
   camino de edición duplica el concepto.
3. **Se elimina 9→18 con otro loop.** El caso no existe en la práctica (quien juega 9 no decide a mitad jugar otro
   loop dentro de la misma ronda); si pasa, es otra ronda.
4. **Hoyo de inicio (en 18 hoyos) sale casi gratis** y sube a la entrega 1.
5. **Quién anota es casi gratis** (un campo de permisos).
6. **Se reusan fuentes canónicas:** `JUGADOR_FUERA_STATUSES` para retirado/tarde, `isSharedBallFormat()` para los
   bloqueos de formato, `validarNuevaRonda` y `evaluarRondaLibre` para revalidar.

## 5. Mejoras

1. **Log + `rondas_libres.revision`:** cada corrección inserta una fila en el log y sube `revision`. `/live` lleva
   `revision`; si cambia, el cliente recarga y muestra el aviso. Sin infraestructura nueva.
2. **Cerrar el PATCH directo del creador** a las columnas corregibles: toda corrección pasa por la RPC (y queda en el
   log). Si no, el aviso es opcional y la confianza no vale nada.
3. **Revalidar como al crear:** `validarNuevaRonda` + `checkModoAccess` + `evaluarRondaLibre`. Sin `checkModoAccess`,
   pasar de gross a neto sería un bypass del paywall.
4. **Confirmación antes/después del resultado, no solo del dato.** No "índice 8,5 → 18,5" sino "Juan: HCP 9 → 20 ·
   neto actual 79 → 68 · pasa del 3º al 1º". El que corrige ve el efecto antes de confirmar.
5. **Aviso en dos niveles (privacidad):** con sesión y en la ronda, el detalle con números; en el `/live` público, un
   mensaje genérico ("El organizador corrigió la ronda en el hoyo 7"). Decisión pendiente de Juanjo (§8).
6. **Historial permanente** de correcciones visible en la tarjeta final: en un grupo que apuesta, el registro es la
   prueba.
7. **Selector de tee con los nombres exactos** de la cancha (no prefijos): evita el latente "Rojo"/"Rojo Damas".

## 6. Riesgos de golf

| Riesgo | Tratamiento |
|---|---|
| Match play: corregir HCP puede **reabrir** un match ya cerrado (4&3) o cerrar uno abierto | Recalcular estado y mostrarlo en la confirmación antes/después. |
| Regla 3.2c (hándicap mal aplicado en match play) | La revisión la citó de memoria: **verificar contra el texto oficial** antes de diseñar el comportamiento. |
| `CONCEDE = -1` (hoyo concedido) | Bloquea pasar de match a stroke: un -1 no es un score de stroke play. |
| 18→9 | Solo si los hoyos jugados caben limpios en una mitad; el CH pasa a fórmula 9h por dentro, el HCP visible sigue a 18. |
| Retirado / tarde bloquean el finalize | Reusar `JUGADOR_FUERA_STATUSES`; tests de finalize con ambos casos. |

## 7. Alcance revisado

**E1 — lo que más se usa, en formatos individuales y best ball**
- Índice, tee, nombre, gross↔neto, hoyo de inicio (rondas de 18).
- RPC `corregir_ronda_libre` + log + `revision` en `/live`.
- Confirmación antes/después del resultado; aviso al grupo; historial en la tarjeta.
- Cerrar el PATCH directo.
- Fuera: torneos y Timba.

**E1b — formatos y equipos**
- Formato individual↔individual (stroke/stableford/match) con la guarda del `-1`.
- Índice/tee en scramble y foursome, recalculando el hándicap de equipo.

**E2 — estructura de la ronda**
- 18→9 restringido, retirar jugador, quién anota.
- Jugador que llega tarde, al final (es el que más toca scoring y leaderboard).

**Bloqueado con hoyos jugados:** de/hacia bola compartida, cancha y recorrido.

**Proceso:** zona crítica (hcp/net/scoring, RLS, migración) → plan → `revisor-fable` → tests de golf contra WHS.

## 8. Decisiones abiertas para Juanjo

1. ¿El aviso con números (índice/HCP antes y después) lo ven solo quienes tienen sesión y están en la ronda, y el
   `/live` público ve un mensaje genérico? (Recomendado: sí, por privacidad del hándicap.)
