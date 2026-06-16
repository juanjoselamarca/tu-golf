# Spec — "Abrir inscripciones" a un torneo (self-service)

**Fecha:** 2026-06-11
**Origen:** reporte inbox 09-jun `9eeb8f51` — "inscripción fallida al torneo".
**Decisión PM (Juanjo, 11-jun):** cablear la acción de organizador para abrir un torneo a inscripciones (draft→open), así el flujo de auto-inscripción ya construido funciona.
**Estado:** APROBADA la dirección. NO implementada todavía — requiere plan-eng-review del lifecycle antes de tocar (es core de torneos reales → CERO FALLOS).

---

## Causa raíz del reporte

El flujo self-service `/torneo/[slug]/unirse` está **construido completo** (página + `GET join-info` + `POST inscribirse` + `src/lib/data/tournaments/joinFlow.ts`), pero:

- `INSCRIBIBLE_STATUSES = ['open']` (joinFlow.ts:20).
- Ningún torneo llega NUNCA a `'open'`. Los torneos nacen `'draft'` (createTournament.ts:78) y la única transición existente es draft→`'in_progress'` (lifecycle.ts:20 `startTournament`) y →`'closed'`/`'cancelled'`. **No existe transición a `'open'`.**

Resultado:
1. La auto-inscripción **siempre** devuelve `not_inscribible` → "Este torneo todavía no está disponible para inscripciones".
2. La página `/unirse` muestra el botón **"Inscribirme" activo** sin chequear `tournament.status` (page.tsx:359-380) → contradicción visible (banner de error + botón que falla).

## Lifecycle objetivo

```
draft ──(Abrir inscripciones)──▶ open ──(Iniciar torneo)──▶ in_progress ──(Cerrar)──▶ closed
  │                                │
  └──────(Iniciar torneo directo)──┘   (el organizador puede saltarse 'open' si arma a mano)
```

- `draft`: armando, sólo organizador lo ve. Agrega jugadores a mano O abre inscripciones.
- `open`: visible públicamente + acepta auto-inscripción vía `/unirse`. El organizador sigue pudiendo agregar a mano y debe poder **Iniciar torneo** desde acá.
- `in_progress`/`closed`: igual que hoy.

## Cambios necesarios (alcance)

1. **Data layer** — `src/lib/data/tournaments/lifecycle.ts`:
   - `openInscriptions(supabase, id)` → setStatus 'open'. (opcional inverso `closeInscriptions` → 'draft').
   - Test unit (espejo de los existentes).

2. **API route** — `POST /api/torneos/[slug]/abrir-inscripciones` (o extender el endpoint de lifecycle):
   - Valida `auth.uid() === organizer_id`. Sólo permite draft→open.
   - Handler delgado, lógica en lifecycle.ts.

3. **UI organizador** — `TournamentActionsBar.tsx` + `useTournamentLifecycle.ts`:
   - Estado `draft`: agregar botón **"Abrir inscripciones"** junto a Eliminar/Iniciar.
   - Nuevo branch `status === 'open'`: mostrar **"Iniciar torneo"** (open→in_progress) + indicador "Inscripciones abiertas" + link a compartir `/unirse`. Decidir si "Eliminar" sigue disponible en open (probablemente sí mientras 0 jugadores).
   - `JugadoresPanel.tsx` (1112 LOC — está en lista de "sucios" → la regla "el que toca, ordena" obliga a refactorizarlo al estándar ANTES de tocarlo).

4. **Guard de la página `/unirse`** — `page.tsx`:
   - Si `!isInscribibleStatus(tournament.status)`: NO mostrar botón activo. Mostrar estado honesto ("Las inscripciones de este torneo aún no están abiertas" / "ya cerraron") + link al leaderboard. (CERO FALLOS — defensivo, independiente de lo demás.)

5. **Compartir el link** — el organizador necesita un CTA "Compartir link de inscripción" (copiar `/torneo/[slug]/unirse`) cuando el torneo está `open`. Confirmar con PM si entra en v1.

## Decisiones abiertas para el eng-review

- ¿"Abrir inscripciones" puede revertirse (open→draft) sin perder jugadores ya inscritos? (probablemente sí, conservando players).
- ¿El organizador puede **Eliminar** un torneo `open` con jugadores inscritos? (confirmación extra).
- ¿`open` aparece en dashboards/`Mi Golf` como "torneo activo"? (`dashboard-derive.ts:38` ya incluye 'open' — verificar consistencia).

## Verificación (al implementar)

- TDD en lifecycle.ts + joinFlow guard.
- E2E: organizador abre inscripciones → segundo usuario se auto-inscribe → aparece en jugadores → organizador inicia torneo.
- Canario: un torneo `draft` NUNCA acepta auto-inscripción.
- `/pre-push` completo + smoke contra preview con 2 cuentas.

## Por qué NO se hizo en la corrida del inbox

Toca el lifecycle del torneo (el core que corre eventos reales) + `JugadoresPanel.tsx` está en la lista de archivos "sucios" (refactor obligatorio antes de tocar). Rushearlo a la 1am con 12 worktrees paralelos activos viola CERO FALLOS. Va como tarea enfocada con plan-eng-review.
