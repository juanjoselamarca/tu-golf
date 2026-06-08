# Plan: Wizard Equipos E2E + Refactor JugadoresPanel

> **ESTADO: CERRADO — 2026-06-07.** La feature de equipos está en producción.
>
> El plan original (24-may) apuntaba a tablas `tournament_teams` /
> `tournament_team_members` como fuente de verdad de la membresía. Eso fue
> **SUPERADO** por la decisión PM 2026-06-02 **"el grupo de salida ES el equipo"**:
> los equipos viven en `tournament_groups` y se materializan en `ronda_equipos` al
> iniciar el torneo; el leaderboard lee de ahí (PRs #89/#94/#98).
>
> Mapeo final del plan → realidad:
> - Pasos 1-7 (UI de asignación, wire por formato, validación de tamaño de equipo,
>   materialización): **HECHOS** en el refactor de `JugadoresPanel` (`GroupsSection`
>   con `isTeam`/`teamSize`) + `useTournamentLifecycle` (materializa + valida rango
>   golf-correcto vía `FORMAT_META`). Cubiertos por `useTournamentLifecycle.test.ts`.
> - Paso 8 (test E2E): **HECHO** como integration test contra schema real —
>   `src/__tests__/integration/team-leaderboard.test.ts` prueba el seam sin cubrir
>   (`fetchScrambleTeams`/`fetchBestBallTeams` desde `ronda_equipos`). Se prefirió
>   integration determinista sobre browser E2E (CERO FALLOS: cero flakiness, atrapa
>   drift de schema). Fixture reutilizable en `e2e/helpers/tournament-team-fixture.ts`.
> - Modelo muerto `tournament_teams` (data layer `teams.ts` + tipos + tablas vacías):
>   **ELIMINADO** (migración `20260607_drop_dead_tournament_teams.sql`). Era una
>   trampa que invitaba a construir sobre el modelo equivocado.
>
> Contenido original abajo (histórico — la sección "DB schema nuevo" y los pasos
> 2-3 sobre `tournament_teams` ya no aplican).

---


**Fecha inicio:** 2026-05-24
**Worktree:** `.claude/worktrees/wizard-equipos-e2e` (branch `fix/wizard-equipos-e2e-claude`)
**Triggers:**
- Hallazgo P0 de auditoría FTUE 22-may (`docs/auditorias/2026-05-22-ftue-organizar-torneo-equipos.md`)
- Regla "el que toca, ordena" 24-may → JugadoresPanel.tsx (1112 LOC) requiere refactor previo

## Estado actual (mapeo de JugadoresPanel.tsx)

- **1112 LOC** en un solo componente cliente
- **14 handlers** todos inline en el componente:
  - `fetchPlayers`, `fetchGroups`, `checkAllRoundsClosed`
  - `handleCreateGroup`, `handleDeleteGroup`, `handleGenerateTeeTimes`, `handleAssignPlayer`, `getPlayerGroupId`
  - `handleInscribir` (~63 LOC), `handleDesinscribir`, `handleDescalificar`
  - `handleStartTournament` (~126 LOC — el más grande), `handleCancelTournament`, `handleCloseTournament`
- **JSX:** ~580 líneas de render
- **63 ocurrencias** de `supabase`, `console.*`, `useState`, `useEffect`, `useCallback`, `useMemo` (deuda dispersa)
- **NO existe UI de equipos** — confirmado por grep, ninguna mención de "team" o "equipo"

## Target post-refactor

`JugadoresPanel.tsx` debe quedar como orchestrator delgado (<300 LOC) que compone hooks + componentes.

```
src/app/organizador/[slug]/jugadores/
├── page.tsx                                    (sin cambios)
├── JugadoresPanel.tsx                          (orchestrator <300 LOC)
├── error.tsx                                   (sin cambios)
├── hooks/
│   ├── useJugadores.ts                         (estado + inscribir/desinscribir/descalificar)
│   ├── useGroups.ts                            (groups CRUD + tee times)
│   ├── useTournamentLifecycle.ts               (start/cancel/close + checkAllRoundsClosed)
│   └── useTeams.ts                             (NUEVO — equipos CRUD + asignación)
├── components/
│   ├── PlayersListSection.tsx
│   ├── InscribirPlayerForm.tsx
│   ├── GroupsSection.tsx
│   ├── TournamentActionsBar.tsx                (start/cancel/close buttons)
│   └── TeamsAssignmentSection.tsx              (NUEVO — UI de asignación)
```

Acceso a datos centralizado en:
```
src/lib/data/tournaments/
├── players.ts                                  (inscribir, desinscribir, descalificar, getPlayers)
├── groups.ts                                   (CRUD + tee times)
├── lifecycle.ts                                (start/cancel/close + checkAllRoundsClosed)
└── teams.ts                                    (NUEVO — equipos CRUD + asignación)
```

## DB schema nuevo

Migration `2026-05-24-tournament-teams.sql`:

```sql
CREATE TABLE IF NOT EXISTS tournament_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,                                   -- hex con default por índice (paleta de 8)
  position SMALLINT NOT NULL DEFAULT 1,         -- 1..N orden de visualización
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, position),
  UNIQUE (tournament_id, name)
);

CREATE TABLE IF NOT EXISTS tournament_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES tournament_teams(id) ON DELETE CASCADE,
  inscripcion_id UUID NOT NULL REFERENCES tournament_inscripciones(id) ON DELETE CASCADE,
  position SMALLINT,                            -- orden dentro del equipo (opcional)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (inscripcion_id)                       -- un jugador en UN equipo por torneo
);

CREATE INDEX idx_tournament_teams_tournament ON tournament_teams(tournament_id);
CREATE INDEX idx_tournament_team_members_team ON tournament_team_members(team_id);
CREATE INDEX idx_tournament_team_members_inscripcion ON tournament_team_members(inscripcion_id);

-- RLS
ALTER TABLE tournament_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_team_members ENABLE ROW LEVEL SECURITY;

-- (policies a definir verificando contra patrón existente en tournaments)
```

**Columna `tournaments.team_config`** ya existe como JSONB (verificar via run-sql). Si no existe, agregar.

## Backend

- `src/app/api/tournaments/create-tournament/route.ts:75-96`: leer `team_config` del payload y persistir.
- `src/app/api/tournaments/[id]/teams/route.ts` (nuevo): GET (lista), POST (crear), PUT (asignar inscripcion_id), DELETE (remover member).

## UI asignación de equipos

`TeamsAssignmentSection.tsx`:
- Lista de N equipos creados auto al primer render (según `tournament.team_config.num_teams`)
- Cada equipo: nombre editable, color por defecto, lista de members con `[X]` para remover
- Sección "Sin asignar" con jugadores aún sin equipo
- Tap en jugador "Sin asignar" → modal "¿A qué equipo asignar?"
- Botón "Auto-asignar aleatorio" (shuffle todos los no asignados)
- Validación: bloqueo de "Empezar torneo" si tournament es team_format y hay jugadores sin equipo

## Orden de implementación

1. **Migration tournament_teams + tournament_team_members** + verificar columna `team_config` (~1h)
2. **`src/lib/data/tournaments/teams.ts`** (CRUD básico) (~2h)
3. **Fix `create-tournament/route.ts`** para persistir `team_config` (~30min)
4. **Refactor JugadoresPanel.tsx** (~2 días):
   - Extraer hooks
   - Extraer componentes
   - Crear `src/lib/data/tournaments/{players,groups,lifecycle}.ts`
   - Sin cambio funcional, todo verde tras refactor
   - `npx tsc + npm test + npm run build` después de cada hook extraído
5. **`hooks/useTeams.ts` + `components/TeamsAssignmentSection.tsx`** (~1 día)
6. **Wire en `JugadoresPanel.tsx`**: renderizar TeamsAssignmentSection si `tournament.is_team_format` (~2h)
7. **Validación de "Empezar torneo"** que bloquea si hay sin asignar en team format (~30min)
8. **Tests Playwright E2E** del flow completo (~1 día)
9. **PR** con before/after de LOC, scorecard refactor, screenshots del flow

## Estimación

- **Mínima:** 5 días dev concentrado.
- **Realista:** 7 días.
- **Incluye buffer:** 8 días (tests Playwright tienen historial de flakiness en CI).

## Métricas de éxito

- [ ] `JugadoresPanel.tsx` < 300 LOC (vs 1112 actual)
- [ ] 0 `console.*` en archivos modificados (usar `captureError`)
- [ ] 0 supabase calls directos desde components — todo vía `src/lib/data/`
- [ ] Tests existentes pasan (regresión)
- [ ] Test E2E Playwright nuevo: signup→torneo Best Ball→4 jugadores→asignar 2v2→empezar→scoring equipos correcto
- [ ] Usuario nuevo recibe link y llega a tener torneo equipos en <10 min (medido manualmente)

## Riesgos

- **R1 — Backwards compatibility**: torneos existentes en prod (¿hay alguno con team_format pre-existente?). Verificar con run-sql cuántos tournaments tienen team-format flag activado HOY. Si hay > 0, plan de migración para popular tournament_teams para ellos.
- **R2 — RLS**: las policies deben permitir al organizador modify, y a invitados solo leer. Verificar contra patrón de `tournament_inscripciones`.
- **R3 — Refactor break**: 1112 LOC con 14 handlers — alto riesgo de regresión silenciosa. Mitigation: tests canarios + smoke en preview antes de touch UI de equipos.
- **R4 — Score-grupo**: cuando torneo es team_format, los grupos de scoring deberían reflejar teams. Esto es OUT OF SCOPE de este PR — flag-it y abrir issue follow-up.

## Out of scope (issues separados)

- Score por equipo (Best Ball / Scramble / Foursome) en `/score-grupo/page.tsx` — ese archivo también es sucio (1305 LOC), refactor + feature aparte
- Formatos chilenos (Match Play x Bandera, Bola Pinta, Greensome, Texas Scramble) — issue P1
- Captain picks / snake draft — v2

## Verificación final

Antes de PR:
- [ ] `npx tsc --noEmit` clean
- [ ] `npm run test` clean (incluye canarios)
- [ ] `npm run build` OK
- [ ] Smoke manual en preview: crear torneo equipos, asignar, empezar, ver scoring
- [ ] Health Check (`GET /api/admin/health-check`) sin nuevos FAILs
- [ ] graphify update . (post-refactor estructural)
- [ ] Cuenta de test cleaneada de Supabase
