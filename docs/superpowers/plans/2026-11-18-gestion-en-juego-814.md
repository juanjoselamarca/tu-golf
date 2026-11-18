# Plan #814 — gestión flexible de jugadores con el torneo en juego

Diseño: `refactor-arquitecto` (Fable), 18-nov-2026, verificado contra `main`. Decisiones de producto: Juanjo, 18-nov
(también en el comentario del issue #814).

## Decisiones de Juanjo (18-nov)

- **D1. Borrar con golpes:** el jugador pasa a WD y queda al pie con sus golpes. Sin golpes se elimina del todo.
- **D2. Mover con golpes (individual / mejor bola):** se mueve llevándose sus golpes, con una confirmación del tipo
  "lleva N hoyos; el grupo destino va en el M". En mejor bola, si cualquiera de los dos equipos tiene golpes, no
  se puede cambiar de equipo.
- **D3. Bola compartida (scramble / foursome):** se permite **siempre**, recalculando el hándicap del equipo aunque ya
  haya golpes. Juanjo lo eligió sabiendo que cambia el neto de los hoyos ya jugados. Invariantes que se mantienen igual:
  el equipo nunca queda fuera de `jugadoresPorEquipo`, nunca queda sin un hándicap calculable, y un equipo con golpes
  nunca se queda sin miembros.
- **D4. Agregar:** el organizador elige el grupo. Si el grupo ya tiene golpes, se le pide confirmar. Los hoyos que no
  jugó quedan vacíos; nunca se inventan golpes.
- **D5. Grupo nuevo en juego:** sí, con su tarjeta. En formatos por equipos, el grupo tiene que estar completo antes de
  poder anotar.
- **D6. Match play:** se puede mover o agregar solo si ningún grupo implicado tiene golpes.

## 1. Hallazgos que condicionan el diseño

- **En formato por equipos, grupo = equipo.** `materializeGroupScorecard` crea un solo `ronda_equipos` por grupo
  (`src/lib/data/tournaments/startTournament.ts:505-547`). "Mover un miembro" es lo mismo que cambiarlo de equipo.
- **Los golpes viven en dos lugares.** En individual y mejor bola están en `ronda_libre_jugadores.scores`; en bola
  compartida, en `ronda_equipos.scores`. Por eso "tiene golpes" depende del formato.
- **El scorer bloquea una sola fila** (`FOR UPDATE OF rlj` o `OF re`,
  `supabase/migrations/20261020190000_orden_guardados_ronda_libre.sql:57`) y valida `rl.codigo = p_codigo`. Un
  dispositivo con la tarjeta vieja recibe `RONDA_NOT_FOUND`, así que falla de forma segura.
- **Match play:** el formato de la tarjeta depende de que el grupo tenga exactamente 2 jugadores
  (`src/golf/ronda-libre/formato-tarjeta-de-grupo.ts:9`). Agregar o mover a alguien cambia ese formato.
- **Timba:** sus tablas guardan `(ronda_id, jugador_id)` (`20261027180000_timba_libre_datos.sql:92,109`). Si el jugador
  tiene filas de timba, la RPC hace `RAISE` (falla cerrada).
- **El alta en juego ya funciona hoy, pero el jugador queda sin grupo** (`NOTA_GRUPOS_FIJOS.altaSinGrupo`,
  `useGroups.ts:299`).
- **Solo se materializa la ronda 1.** Los torneos de varias rondas quedan fuera del alcance.

## 2. Arquitectura

Hay una sola primitiva: **colocar a un inscrito en un grupo destino, o en ninguno**.

- Agregar = `enrollPlayer` (ya existe) + colocar.
- Mover = colocar en otro grupo.
- Borrar = colocar en ninguno + `DELETE players`. Con golpes no se borra: pasa a WD (D1).

Sigue el patrón de #812: la app lee y planifica con funciones puras (las mismas del inicio), y una RPC solo escribe,
con control optimista y locks. La ejecuta solo `service_role`; la ruta valida la sesión y el `organizer_id`.

**Mover = `UPDATE ronda_libre_jugadores.ronda_id`.** La fila conserva su id, así que se mantienen el
`jugador_ronda_id`, los golpes, `ronda_libre_scores_orden` y el pie WD/DQ.

### RPC `colocar_inscrito_en_grupo`

Parámetros: `p_tournament_id`, `p_player_id`, `p_grupo_destino` (null = sin grupo), `p_esperado jsonb`,
`p_fila jsonb`, `p_equipos jsonb`, `p_formato_tarjetas jsonb`, `p_politica jsonb` y `p_borrar_inscrito boolean`.

Los locks se toman en un orden fijo, compatible con `editar_handicap_inscrito` (players → rlj → re):

1. `pg_advisory_xact_lock(hashtextextended('grupos:'||p_tournament_id, 0))`.
2. `tournaments ... FOR SHARE`, exigiendo `status = 'in_progress'` y `rondas_libres.estado = 'en_curso'` en las tarjetas
   involucradas.
3. `players` afectados, `ORDER BY id FOR NO KEY UPDATE`.
4. `ronda_libre_jugadores` de ambas tarjetas, `ORDER BY id FOR UPDATE`. Esto serializa contra el scorer.
5. `ronda_equipos` de ambas tarjetas, `ORDER BY id FOR UPDATE`.

Ya con todo bloqueado, la RPC:

- vuelve a verificar `p_esperado`; si no calza, devuelve `conflicto` y la app replanifica (máximo 3 veces);
- evalúa "tiene golpes" en SQL, **solo bajo lock** (espejo del predicado de TypeScript, comentados entre sí), y aplica
  `p_politica` (D1, D2, D6). Si se viola, devuelve `{ok:false, motivo}`;
- escribe todo en la transacción y verifica `ROW_COUNT` en cada escritura. Nunca deja una tarjeta huérfana. Si queda un
  `ronda_equipos` sin miembros y con golpes, hace `RAISE`.

Antes de escribir el `UPDATE ronda_id` hay que enumerar todos los FK que apuntan a `ronda_libre_jugadores`.

## 3. PRs

1. **PR1 — Predicados puros (zona crítica, sin cambio de comportamiento).** Crear
   `src/golf/torneo/gestion-en-juego.ts` con:
   - `tarjetaTieneGolpes` (quedó como `tarjetaTieneAnotaciones`: cuenta también el CONCEDE), reutilizando `hoyosAnotados` de `src/golf/ronda-libre/progreso-de-ronda.ts:33`. El
     `hoyoAnotado` privado de `src/golf/leaderboard/fuera-del-ranking.ts` debe pasar a usar esa misma fuente.
   - `motivoParaNoColocar`.
   - `motivoTamanoDeEquipo`, extraído de `motivoParaNoIniciar` (`motivo-para-no-iniciar.ts:92-106`) para que el inicio y
     la gestión usen el mismo.

   Tests: una tabla formato × operación × golpes, con D1-D6.
2. **PR2 — Migración + RPC + prueba SQL.** Incluye el rollback y `scripts/ci/pruebas-sql/colocar-inscrito-en-grupo.sql`,
   con estos casos:
   - mover con golpes conserva los golpes y el enlace;
   - un conflicto optimista no escribe;
   - torneo cerrado;
   - equipo creado y equipo borrado;
   - borrar sin golpes, y borrar con golpes que se rechaza;
   - `anon`/`authenticated` sin EXECUTE;
   - los triggers `grupos_fijos_*` siguen intactos.

   También hay que actualizar el comentario "falla ABIERTA" de `20261117120000_grupos_fijos_torneo_iniciado.sql`.
3. **PR3 — Capa de datos + rutas.**
   - `src/lib/data/tournaments/colocarInscrito.ts`.
   - `PUT /api/torneos/[slug]/players/[playerId]/grupo`.
   - `DELETE /api/torneos/[slug]/players/[playerId]`.
   - `POST /api/torneos/[slug]/players` con un `groupId` opcional. Responde 207 si la inscripción salió bien pero la
     colocación falló.
4. **PR4 — Grupo nuevo o vacío en juego (D5).** `POST /api/torneos/[slug]/grupos`, que usa
   `materializeGroupScorecard`, y `DELETE /api/torneos/[slug]/grupos/[groupId]`, permitido solo si el grupo no tiene
   jugadores ni golpes.
5. **PR5 — UI (pantalla de cancha: `revisor-fable` con checklist visual).**
   **Principio de Juanjo (18-nov):** flexible por dentro, casi imperceptible a la vista. No hay que llenar la pantalla
   del organizador con botones ni avisos. Divulgación progresiva:
   - La fila del jugador y el encabezado del grupo se ven igual que hoy. No se agregan íconos ni botones por fila.
   - Al tocar al jugador se abre una sola hoja de acciones con lo que corresponda a ese jugador en ese momento:
     "Cambiar de grupo", "Retirar" o "Eliminar" (sin golpes). Las acciones que no aplican se omiten, no se muestran
     deshabilitadas. El motivo se da solo si el organizador lo intenta.
   - Hay un único punto de entrada para agregar, el que ya existe, con el selector de grupo dentro del mismo formulario.
     El "grupo nuevo" es una opción más de ese selector, no un botón aparte.
   - Las confirmaciones aparecen solo cuando la acción toca golpes ("lleva 6 hoyos…"). Sin golpes, la acción es
     directa y se puede deshacer con un toast.
   - Las variantes se generan con `design-shotgun`, y Juanjo elige con botones si no hay una ganadora clara.
   - `useGestionEnJuego`.
   - `MoverJugadorSheet`.
   - `useGroups`, `usePlayers`, `desinscribir.ts` (D1) e `InscribirPlayerForm` (D4).
   - `PlayersTable` y `GroupsSection`.

## 4. Riesgos

- **El scorer anota un golpe entre el plan y la RPC.** Por eso la regla de golpes se evalúa solo en la RPC, bajo lock.
- **Carrera con el cierre del torneo.** La RPC exige `in_progress` y las tarjetas `en_curso`.
- **Modo raw (individual con cuenta).** `filaDeHandicapDeTorneo` devuelve `{}`, igual que `planDeEdicion` en
  `editarHandicapInscrito.ts:107`.
- **Jugador WD/DQ.** Se puede mover y sigue al pie, pero no cuenta para el tamaño de equipo.
- **`players_identity_check`.** La RPC no inserta en `players`: el alta sigue pasando por `enrollPlayer`.

## 5. Criterio de terminado

- Ninguna ruta nueva hace escrituras multi-tabla fuera de la RPC.
- Las funciones del inicio se reutilizan, sin copias.
- "Tiene golpes" tiene una sola fuente en TypeScript, más su espejo en SQL.
- La prueba SQL cubre concurrencia, permisos y cada `motivo`.
- Los triggers `grupos_fijos_*` quedan intactos.
- No hay `console.*` ni `supabase.from()` en `src/app/` fuera de `api/`.
- No se toca ningún archivo protegido.

## Decisiones de Juanjo (18-nov, segunda tanda)
- **D7. Equipo bajo el mínimo y sin golpes:** se permite. El equipo queda marcado como incompleto y no puede anotar hasta completarse (misma regla que D5).
- **D8. Match play: borrar a un jugador sin golpes cuando el rival ya anotó:** pasa a WD, no se elimina. El match ya empezó (misma lógica que D6).
- **D9. Mejor bola: agregar a un equipo que ya tiene golpes, con cupo libre:** se permite con confirmación (R23.4). Juega desde que llega.
- **D10. Match play: un tercer jugador en un grupo:** se bloquea siempre, aunque no haya golpes. Un grupo de match play admite como máximo 2 jugadores.

## Pendientes que deja el PR1 para el PR2/PR3

- **Hándicap de equipo: ¿con quiénes se calcula?** `motivoParaNoColocar` valida que sea calculable con los que
  COMPITEN (`miembros`, sin WD/DQ), pero `editarHandicapInscrito` lo recalcula con todos los miembros materializados
  del equipo (WD incluidos). La RPC tiene que usar un solo conteo y esta función alinearse con él.
- **Inscrito sin grupo con golpes (#828):** sin grupo anota en su tarjeta individual del torneo (`tournament_rounds`
  vía `asegurar_tarjeta_vigente`), no en `ronda_libre_jugadores`. Para D1, `InscritoAColocar.tieneGolpes` tiene que
  incluir esa tarjeta. Al colocarlo en un grupo, falta decidir qué pasa con esos golpes (hoy no viajan a la tarjeta
  del grupo): el PR3 lo tiene que resolver o bloquear.
- **Mejor bola, retirar en vez de borrar:** borrar a un integrante sin golpes de una pareja con golpes se rechaza
  (`equipo-con-golpes-incompleto`, sin "Retirar"); el flujo WD actual sí lo deja retirar (R23.4, el compañero sigue
  solo). Revisar que las dos reglas digan lo mismo en el PR5.
