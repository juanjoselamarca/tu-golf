# Plan — Scramble y "quién anota" en el asistente de nueva ronda (09-nov-2026)

## Por qué

Cristián Ross (R4794T, 07-nov) eligió Scramble en `/ronda-libre/nueva` y no pudo crear su ronda:
elegir un formato de equipo forzaba "llevo el score del grupo" sin avisar, abría tres rivales en
blanco, "Revisar" quedaba bloqueado con "Scramble necesita al menos 4 jugadores" y volver a Stroke
Play no lo revertía. Terminó con una ronda `admin_mode` de un solo jugador en el scorer de grupo
que nunca finalizó. Investigación: memoria `project_cristian_ross_investigacion.md`.

## Decisiones de producto (Juanjo, 09-nov)

1. **1 o 2 equipos.** Un equipo juega contra el par; con rival hay ganador. Scramble de dos personas vale.
2. **Sin paso "¿quién anota?".** Se deriva del formato: equipo / match play / stableford → uno anota
   por el grupo; stroke play solo → nada que preguntar; stroke play con compañía → "Cada uno en su
   celular" / "Yo anoto por todos" dentro del paso Jugadores.
3. **Equipos armados solos.** La app reparte los nombres en equipos y los muestra; "+ Agregar
   compañero", "+ Agregar equipo rival", leyenda "Tu equipo juega contra el par. Con un rival hay ganador."
4. **Scorer** (PR aparte): confirmación de Finalizar fija (sin reseteo a los 5 s) y, con la tarjeta
   completa, abrir en el último hoyo con el aviso "Tarjeta completa · Finalizar ronda".

## PR A — formulario y equipos (esta rama: `fix/scramble-flujo-claude`)

- `src/golf/ronda-libre/plantilla-de-jugadores.ts`: fuente única de cupos (`EQUIPOS_MINIMOS = 1`,
  `EQUIPOS_PARA_COMPETIR = 2`, `jugadoresPorEquipo`, `puedeSumarCompanero`, `puedeSumarEquipo`,
  `exigeLlevarElScoreDelGrupo`). Scramble/best ball: equipos de 2 a 4; foursome: de 2.
- `validar-nueva-ronda.ts`: acepta un equipo solo; el mensaje de "falta un compañero" dice cuántos
  hacen falta en vez de "al menos 4 jugadores".
- `hooks/equipos-del-formulario.ts`: `repartirEnEquipos` (1 equipo hasta que alcanza para dos, o
  cuando no caben en uno) y `equiposSirvenPara` (conserva los equipos al cambiar de formato si sirven).
- `hooks/useFormularioDeRonda.ts`: `preguntaQuienAnota`, `anotaPorTodos`, `rivalesEnJuego` (los
  rivales escritos no viajan a la API en "cada uno en su celular"), `agregarEquipoRival`,
  `quitarEquipo`, `renombrarEquipo`, `moverAlEquipo`; `acomodarAlFormato` deshace el modo de grupo
  al volver a un formato individual.
- UI: pasos Cancha → Formato → Jugadores → Confirmar (`PasoFormato`, `RondasRecientes`,
  `TarjetaDelCreador`, `SelectorQuienAnota`, `EquiposDeLaRonda`; se van `PasoModo` y
  `AsignacionDeEquipos`). `PasoConfirmar` agrupa por equipo y muestra la fila "Anota".
- `problemaDelFormulario`: una tarjeta sin nombre dentro de un equipo pide el nombre bajo "Revisar"
  (el validador sólo ve a la gente con nombre y decía "asigna a un equipo").
- `WinnerCelebration`: con un solo equipo la ronda finalizada dice "Contra el par", no "Equipo ganador".
- Tests: 32 del hook, 18 de equipos/plantilla, validador, 3 del cuadro ganador; e2e
  `scorer-nueva-wizard.spec.ts` con la regresión de Cristián (Scramble → Equipo 1 → Revisar habilitado →
  volver a Stroke Play).

## PR B — scorer de grupo

- `useFinalizeGrupo.ts` / `useFinalizeRonda.ts`: hoja de confirmación fija (Cancelar / Finalizar).
- `useRondaScoreData.ts`: con la tarjeta completa abrir en el último hoyo + aviso permanente.
- `trackPageView` en `/score-grupo`.
- e2e: `score-grupo-finalize-missing.spec.ts`, `scorer-finalizar-ultimo-hoyo.spec.ts`.

## Revisión

Zona crítica (formatos / validación de ronda). Código escrito por Fable → `revisor-fable` con
`model: "opus"`, agente nuevo por vuelta, máximo 3; label `fable-reviewed` con APROBADO.
