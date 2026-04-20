# Roadmap al 100% — Golfers+ pre-lanzamiento

Fecha base: 2026-04-15
Estado al crear: Pendientes #1, #2, #4, #5 de memoria cerrados + 2 bugs críticos de
historial arreglados. Quedan items de la auditoría del 13-abr y del bug sweep del
15-abr por resolver.

> Este archivo es la fuente de verdad de lo que falta para el 100%. Si se pierde
> la sesión o reinicia el computador, empezar leyendo este archivo.

---

## 🔴 P0 — bloqueantes para torneo real

1. **tAIger+ multi-turn roto (C-F8-1).** El coach IA no recuerda contexto entre
   mensajes. Falta pasar el array completo de mensajes al backend. Usuario
   abandona el feature en 2 minutos si la segunda respuesta no entiende el
   contexto.

2. **Par hardcoded a 72 en tAIger+ (C-F8-5).** El coach asume par 72 universal.
   Rompe análisis en canchas de par 70/71 o rondas de 9 hoyos.

3. **GEMINI_API_KEY faltante en Vercel (C-F9-2).** Sin esta env var, la
   importación por foto (OCR) falla silenciosamente en producción desde 9-abril.
   **Acción de Juanjo:** agregar la key en Vercel dashboard.

4. **Fórmula WHS 9 hoyos incorrecta (C-F10).** El diferencial para rondas de 9
   hoyos tiene un bug matemático. Afecta el índice WHS calculado. Revisar
   `calcularDiferencial` en `src/lib/indice-golfers.ts`.

5. **Score de rondas parciales / abandonadas.** Si un usuario finaliza con
   menos de 18 hoyos, se guarda el total incompleto como si fuera completo.
   Mejor: prompt "¿Seguro abandonar? Se guardará como ronda parcial" + marcar
   `holes_played` correctamente (el campo existe, verificar que se use).

6. **Opción de descartar ronda sin guardar.** Si el usuario no quiere terminar
   ni guardar la ronda, hoy no tiene salida limpia — los scores quedan en
   `ronda_libre_jugadores` y la ronda queda `en_curso` para siempre. Necesita:
   - Botón "Descartar ronda" en score page y score-grupo
   - Confirmación clara "Esto eliminará todos los scores de esta ronda"
   - Action: borrar `ronda_libre_jugadores` + `rondas_libres` (cascade)
   - NO insertar en `historical_rounds`
   - Redirect a dashboard con toast "Ronda descartada"

---

## 🟠 P1 — calidad antes de escalar

7. **Formatos de equipo (Pendiente #3 de memoria).** Best Ball, Scramble,
   Foursome. Motor en `src/golf/formats/` existe pero UI de creación comentada y
   scoring/espectador sin flujo. ~1 semana.

8. **WD/DQ en torneos (C-F3).** Retiro/descalificación sin implementar. Hoy
   retirar un jugador cascade-deletea sus scores (destrucción de data).
   Necesita status `withdrawn`/`disqualified` y UI.

9. **Stableford + gross no aceptado (C-F3).** `rules.FORMAT_META` lo permite
   pero UI/scoring lo bloquean. Contradicción a resolver.

10. **Paleta Garmin no unificada (I-F4).** Al menos 3 paletas coexisten. Spectator
    y share cards ya arreglados, falta barrer `en-vivo`, leaderboards,
    scorecards legacy.

11. **Match Play y Stableford en share cards (C-F5).** Match Play no muestra el
    resultado del match (2&1, Dormie, etc.). Stableford muestra score bruto en
    vez de puntos. Misleading al compartir.

---

## 🟡 P2 — robustez real-world

12. **Migración de rondas de invitados a cuenta nueva.** Cuando un invitado
    (`pending_user_id`) finalmente crea cuenta, sus rondas históricas no se
    migran a su `user_id`. Pierden historial retroactivo.

13. **Imports no preservan formato/modo.** Imports de Garmin/foto/ZIP siempre
    guardan `stroke_play + gross` por default.

14. **Push notifications en producción.** Código existe. ¿Funciona en iOS
    Safari? ¿Permisos se piden en el momento correcto? Testing real en celular.

15. **Offline resilience durante scoring.** `useScoreSync` + localStorage
    existen. Probar: pérdida de conexión a mitad de ronda, cierre de app,
    recuperación.

16. **Canchas multi-recorrido × per-player tees.** Matriz combinada no probada
    end-to-end (ej. Norte+Sur con 2 hombres blancas + 2 mujeres rojas).

---

## ⚪ P3 — pulido para lanzamiento

17. **Real-world torneo test end-to-end.** Simular flujo completo contra BD de
    producción: crear torneo → inscribir 8 jugadores → scorear 18 hoyos →
    finalizar → leaderboard → share card → cleanup. Protocolo en CLAUDE.md pero
    sin evidencia de haberse corrido recientemente.

18. **Secrets rotation pendiente (Security audit abr-2026).** Rotación manual
    pendiente. **Acción de Juanjo.**

19. **Admin finaliza a mitad de ronda.** Si el organizador aprieta "finalizar"
    con hoyos sin scorear, probablemente guarda `total_gross` erróneo y rompe
    el índice de los jugadores. Validar y prevenir.
    _Auditoría 2026-04-20: NO es hueco — 3 gates activos (`canFinalize ≥ 9`,
    `.filter(s != null)` en totales, `calcularDiferencial` retorna null si
    `holesPlayed < 9`). Cerrado sin cambios._

20. **Ranking real (rebuild completo).** Hoy `/leaderboard` es una simulación
    demo ("Copa Golfers+ Demo 2026") con datos falsos, tema mixto dark/light,
    formato y lógica fuera de línea con la app. El item "Ranking" se removió
    del nav de visitantes (commit dbf51c1, 2026-04-20). Diseñar proper Ranking:
    top 50 índices Golfers+ (handicap ranking global), torneos activos
    destacados, integración con CPI/stats intelligence. Tema blanco consistente.

21. **Demo rebuild completo.** `/demo` no tiene sentido funcional actualmente,
    reconstrucción completa pendiente. Reportado por Juanjo 2026-04-20.

---

## Secuencia propuesta

| Sprint | Duración | Items | Foco |
|--------|----------|-------|------|
| 1 | 2 días | P0 #1-6 | Bugs no-features, bajo riesgo, alto impacto |
| 2 | 3 días | P1 #8-11 | Calidad/coherencia, aprovecha la auditoría |
| 3 | 1 semana | P1 #7 | Formatos de equipo — el feature grande |
| 4 | 2 días | P2 #12-16 | Robustez antes de tráfico real |
| 5 | 1 día | P3 #17 | Torneo end-to-end antes de abrir clubes |

---

## Progreso

- 2026-04-15 AM: Pendientes #1 (tee por jugador), #2 (formato/modo),
  #4 (share card), #5 (demo cleanup) shippeados.
- 2026-04-15 AM: Bug sweep → score-grupo insert faltante y score page
  user_id incorrecto shippeados.
- 2026-04-15 PM: **Sprint 1 completo** (commit c04e58c):
  - #1 tAIger+ multi-turn: verificado ya corregido en main
  - #2 Par hardcoded: hole_pars reales de course_holes
  - #3 GEMINI_API_KEY: error 503 gracioso existe, pendiente acción Juanjo
  - #4 WHS 9h: scaleo ×2 a equivalente 18h + heurística legacy mejorada
  - #5 Rondas parciales: holes_played real + diferencial solo si ≥9
  - #6 Descartar ronda: botón dos-pasos en score y score-grupo
  - tsc 0, 927 tests pass, build OK, deploy disparado.
- 2026-04-15 PM: **Sprint 2 completo** (commit 014dc3d):
  - #8 WD/DQ: verificado ya correcto en main (audit flag era de versión pre-fix)
  - #9 Stableford Gross no exige HCP (estaba bloqueado por validación UI)
  - #10 Paleta Garmin: MiniLeaderboard under-par → birdie celeste
  - #11 Match Play share card: muestra "3&2"/"All Square" en vez de gross
  - tsc 0, 927 tests pass, build OK, deploy disparado.
