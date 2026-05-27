# Diseño — Tee por admin (bug #6 inbox 25-may)

**Fecha:** 2026-05-27
**Branch:** `feat/tee-por-admin-claude`
**Origen:** reporte inbox `9e017436-e664` (25-may-2026)
**Worktree:** `.claude/worktrees/tee-por-admin`

---

## Problema

Reporte textual del usuario:

> "Debe haber una sección que sea que el administrador define. Y efectivamente darle la alternativa al administrador de decidir desde qué tee sale cada jugador."

Hoy `RoundConfig.tee_assignment_mode` soporta dos valores:

- `per_player` — cada jugador elige su tee desde su perfil personal.
- `per_category` — el admin define el tee por categoría (Damas/Varones/Senior) y todos los jugadores heredan según su categoría.

Falta un tercer modo: **el admin define el tee de cada jugador uno por uno**, para cubrir casos donde ni `per_player` ni `per_category` aplican (ej. un senior que insiste jugar tee de varones, un junior que va de tee de damas en su primer torneo, etc.).

Sin esta tercera opción, el admin tiene que coordinar fuera del sistema (mails, llamadas) — fricción visible.

---

## Decisiones tomadas

| Tema | Decisión | Quién |
|---|---|---|
| Nombre del modo en código | `'manual'` (tercer literal del union) | Claude (CTO) |
| Nombre del modo en UI | "El admin asigna jugador por jugador" | Claude |
| Persistencia | columna nueva `players.tee_id UUID NULL REFERENCES course_tees(id)` | Claude |
| Bloqueo si faltan asignaciones | **Sin bloqueo** — fallback automático al default por categoría → tee global | Juanjo |
| Fallback chain | 1) `players.tee_id` → 2) `category.default_tee_color` → 3) `tournament.tees` | Claude (CTO) |
| Mapeo género→tee hardcodeado | NO. Cada cancha tiene sus tees reales (FedeGolf). El admin define el mapeo vía `CategoryConfig.default_tee_color`. | Claude (CTO), validado con Juanjo |
| Refactor de JugadoresPanel | OBLIGATORIO (1113 LOC, está en lista "sucios"). Sigue plan existente `docs/superpowers/plans/2026-05-24-wizard-equipos-e2e.md`. | Regla "el que toca, ordena" |
| Coordinación con wizard-equipos-e2e | Mi PR parte de `main`, NO de `wizard-equipos-e2e`. Estructura compatible. Cuando alguien retome equipos, solo agrega `useTeams` + `TeamsAssignmentSection` encima. | Claude (CTO) |

---

## Arquitectura técnica

### Cambio de schema (Supabase migration)

```sql
-- supabase/migrations/20260527_players_tee_id.sql
ALTER TABLE players
  ADD COLUMN tee_id UUID NULL REFERENCES course_tees(id) ON DELETE SET NULL;

CREATE INDEX players_tee_id_idx ON players(tee_id) WHERE tee_id IS NOT NULL;
```

- `NULL` permitido (la mayoría de los jugadores heredarán vía categoría o tee global).
- `ON DELETE SET NULL`: si una cancha cambia sus tees, el jugador no queda colgado.

### Cambio de tipos TS / Zod

`src/lib/draft/types.ts`:
```ts
// ANTES
export type TeeAssignmentMode = 'per_player' | 'per_category';

// DESPUÉS
export type TeeAssignmentMode = 'per_player' | 'per_category' | 'manual';
```

`src/lib/draft/schema.ts` (zod):
```ts
tee_assignment_mode: z.enum(['per_player', 'per_category', 'manual'])
```

`src/lib/draft/initial-config.ts` — sin cambios (default sigue siendo `per_player`).

`src/lib/draft/normalize-ai-partial.ts` — agregar `'manual'` al set de valores válidos (ya hay logica de fallback ahí, debo asegurar que un input `"manual"` del AI pase el check).

`src/lib/prompts/tournament-assistant-v1.ts` — actualizar el prompt para que el assistant entienda y proponga `manual` cuando el admin lo pida.

`src/__tests__/draft/tournament-config-validator.test.ts` — extender los tests del validador con casos `manual`.

### Refactor de JugadoresPanel (estructura objetivo)

Sigue el plan documentado en `docs/superpowers/plans/2026-05-24-wizard-equipos-e2e.md`. Mi PR materializa los hooks y componentes base, dejando la estructura lista para equipos sin retrabajo.

```
src/app/organizador/[slug]/jugadores/
├── JugadoresPanel.tsx           ← orquestador <300 LOC
├── hooks/
│   ├── useJugadores.ts          ← players + handicaps + WD/DQ
│   ├── useGroups.ts             ← tournament_groups + assignments
│   ├── useTournamentLifecycle.ts ← start/close torneo
│   └── useTees.ts               ← (mío) carga course_tees + asigna players.tee_id
└── components/
    ├── InvitationCard.tsx       ← link copy + código
    ├── PlayerList.tsx           ← lista + agregar manual + WD/DQ
    ├── GroupAssignment.tsx      ← drag/drop a grupos
    └── TeesAssignmentSection.tsx ← (mío) tabla jugador → dropdown tee
```

`src/lib/data/tournaments/`:
```
├── players.ts      ← list/create/delete/wd/dq + update tee_id
├── groups.ts       ← list/create/assign
└── lifecycle.ts    ← start/close
```

**Patrón validado en `score/page.tsx` (PR `e98e3e3`)**: cada hook tiene tests unit, cada componente recibe props serializables, sin `supabase.from()` directo desde el componente.

### Nueva API route

`PATCH /api/torneos/[slug]/players/[playerId]` con body `{ tee_id: string | null }`.

Validación:
- El admin debe ser owner o admin del torneo (RLS check).
- `tee_id` debe pertenecer a `course_tees` de la cancha del torneo (`course_id` match).
- `null` permitido (limpia la asignación, vuelve a fallback).

### Lógica de fallback runtime (motor)

Nueva función pura en `src/golf/courses/resolve-player-tee.ts`:

```ts
export function resolvePlayerTee(input: {
  playerTeeId: string | null;          // players.tee_id
  categoryDefaultTeeColor: string | null; // category.default_tee_color
  tournamentTeesGlobal: string | null;  // tournament.tees (fallback final)
  courseTees: CourseTee[];              // SELECT * FROM course_tees WHERE course_id = ...
}): CourseTee | null {
  // 1. Manual del admin: si tee_id existe, usar
  if (input.playerTeeId) {
    const t = input.courseTees.find(ct => ct.id === input.playerTeeId);
    if (t) return t;
  }
  // 2. Default por categoría
  if (input.categoryDefaultTeeColor) {
    const t = input.courseTees.find(ct =>
      ct.nombre.toLowerCase() === input.categoryDefaultTeeColor!.toLowerCase()
    );
    if (t) return t;
  }
  // 3. Tee global del torneo
  if (input.tournamentTeesGlobal) {
    const t = input.courseTees.find(ct =>
      ct.nombre.toLowerCase() === input.tournamentTeesGlobal!.toLowerCase()
    );
    if (t) return t;
  }
  return null; // motor decide qué hacer (probable: usar slope/CR del torneo)
}
```

Tests unit cubren los 4 caminos (manual / categoría / global / null). Esta función la consumen:
- `src/app/ronda-libre/[codigo]/score/page.tsx`
- `src/app/ronda-libre/[codigo]/score-grupo/page.tsx`
- `src/app/organizador/[slug]/salida/page.tsx`
- y cualquier futuro punto que calcule course handicap por jugador.

---

## UI — Wizard (TeesSection.tsx)

Cambio mínimo en `src/app/organizador/nuevo/sections/TeesSection.tsx` (152 LOC, archivo sano, NO requiere refactor previo).

Añadir un tercer `<label><input type="radio">` con el mismo patrón visual de los dos existentes:

```tsx
<label style={radioRowStyle}>
  <input
    type="radio"
    name="tee-mode"
    value="manual"
    checked={currentMode === 'manual'}
    onChange={() => setMode('manual')}
  />
  <div>
    <div style={radioTitleStyle}>El admin asigna jugador por jugador</div>
    <div style={radioHelperStyle}>
      Para casos especiales (senior que juega tees de varón, junior de tees adelantadas, etc.).
      Vas a poder configurar quién juega de qué tee desde el panel de jugadores.
    </div>
  </div>
</label>
```

Sin colores nuevos, sin layout nuevo. Mismo tradeoff visual que los otros dos modos.

---

## UI — JugadoresPanel (TeesAssignmentSection.tsx, nuevo)

**Visibilidad condicional:**

```tsx
const showTeesSection = tournament.rounds?.some(r => r.tee_assignment_mode === 'manual') ?? false;
```

Si ninguna ronda usa modo `manual`, la sección no se renderiza. **Cero ruido para el 95% de los torneos.**

**Patrón visual:** clona `CategoriasSection.tsx` (cards con grid auto-fit `repeat(auto-fit, minmax(140px, 1fr))`). Componente premium ya validado.

```
┌─ Asignación de tees ─────────────────────────────────┐
│  Modo manual activo. Asigná un tee por jugador.       │
│  Los vacíos heredan por categoría → tee global.       │
│                                                       │
│  ┌──────────────────────────────────────────────┐   │
│  │ Juan Pérez            HCP 12.3   [● Azul ▼]  │   │
│  └──────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────┐   │
│  │ María González        HCP 18.4   [○ Rojo* ▼] │   │
│  └──────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────┐   │
│  │ Diego Rojas (Senior)  HCP 8.1    [● Blanco▼] │   │
│  └──────────────────────────────────────────────┘   │
│                                                       │
│  * heredado de la categoría                          │
└───────────────────────────────────────────────────────┘
```

**Componente del dropdown:**

- `<select>` nativo (accesible, móvil-friendly, sin custom UI).
- Opciones se cargan dinámicamente desde `course_tees` filtrados por `course_id` del torneo (ej. Granadilla muestra `azul / negras / rojo / dorado / blanco`; Antofagasta muestra `azul / blanco / rojo`).
- Primera opción: `"— Sin asignar (hereda) —"` con `value=""`.
- Al elegir → optimistic update + `PATCH` al endpoint. Si falla, rollback con toast de error.

**Dot de color a la izquierda del nombre:**

- Si asignado: dot lleno con color derivado del nombre del tee vía mapa en `src/golf/core/colors.ts` (ya existe, ej. `"azul" → "#1a4fd6"`, `"rojo" → "#dc2626"`).
- Si tee del jugador no matchea ningún color conocido en el mapa (ej. `"dorado"`): dot gris neutro. No revienta nada.
- Si heredado (vacío): dot vacío (outline) + nombre del tee heredado en `text-2` itálico con asterisco indicando que es default.

**Mobile-first:**

- `gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))'` colapsa a 1 columna debajo de ~480px.
- Cada fila tiene padding generoso (`12px 16px`) para tap con guante.
- El `<select>` nativo abre el picker nativo del sistema operativo (iOS wheel, Android sheet) — UX de primera, sin custom.

---

## Out of scope (decidido)

- ❌ **Bulk actions** ("asignar a todos los varones tee X"). Si surge demanda, se evalúa después. El admin tiene categorías para eso.
- ❌ **Custom dropdown con dot dentro de las opciones**. `<select>` nativo cumple y es premium en mobile.
- ❌ **Validación bloqueante**. Decisión explícita de Juanjo: fallback automático.
- ❌ **Modal "asignar a varios"**. Fila por fila es suficiente.
- ❌ **Auto-asignación inteligente por HCP**. Out of scope.
- ❌ **UI de equipos**. NO toca este PR. Queda para wizard-equipos-e2e.

---

## Plan de validación

Antes de mergear el PR:

1. `npx tsc --noEmit` — 0 errores.
2. `npm run test` — toda la suite verde, incluye:
   - Tests unit nuevos: `resolve-player-tee.test.ts`, `useTees.test.ts`, `useJugadores.test.ts`, `useGroups.test.ts`, `useTournamentLifecycle.test.ts`.
   - Tests existentes del scorer (no deben romperse — el motor sigue retornando lo mismo si no hay modo manual).
   - Canarios `canary-stability.test.ts`.
3. `npm run build` — Next.js build exitoso.
4. **Smoke manual en preview Vercel** (browse skill):
   - Crear torneo nuevo en modo `manual` para 1 ronda.
   - Asignar tees a 3 jugadores: uno con tee distinto al de su categoría, uno sin asignar (debe heredar), uno con categoría sin default (debe usar tee global).
   - Iniciar la ronda. Verificar que en `/score-grupo` el course handicap por jugador refleja SU tee.
   - Cerrar el torneo. Verificar que `historical_rounds.differential` está calculado con el tee correcto del jugador.
5. **Code reviewer pre-merge** (CLAUDE.md default #6) — diff seguro >100 LOC, paso obligatorio. Si encuentra issues críticos, fix antes de merge.
6. **Migration en prod** vía `node --env-file=.env.local scripts/run-sql.mjs supabase/migrations/20260527_players_tee_id.sql`. Backfill no necesario (columna nullable).

---

## Compatibilidad con wizard-equipos-e2e

Mi PR materializa los hooks/components base que el plan equipos también necesita. Cuando alguien retome wizard-equipos-e2e:

1. Rebasea su branch sobre `main` (que ya tiene mi PR mergeado).
2. Sus 3 commits actuales se mantienen: capa `src/lib/data/tournaments/teams.ts` + migration `tournament_teams` + types tournament.
3. Suma encima: `useTeams.ts` (mismo patrón que mi `useTees.ts`) y `TeamsAssignmentSection.tsx` (mismo patrón que mi `TeesAssignmentSection.tsx`).
4. JugadoresPanel.tsx (mi versión orquestador) renderiza condicionalmente ambas secciones.

**Cero retrabajo. Doble feature gratis.**

Anotaré una línea en el plan equipos (`docs/superpowers/plans/2026-05-24-wizard-equipos-e2e.md`) indicando que mi PR cubre los pasos 3-7 de su refactor base.

---

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Otro agente retoma wizard-equipos-e2e en paralelo y modifica JugadoresPanel | Branch dormant 25h sin PR. Si pasa, conflicto solo en JugadoresPanel.tsx; lo resuelvo manual. |
| Migration falla en prod | Columna nullable, rollback trivial (`DROP COLUMN`). |
| Tee del jugador apunta a un `course_tees.id` de otra cancha | API valida que `course_id` matche antes de persistir. Si pasara por race, `resolvePlayerTee` retorna null y cae al fallback. |
| `course_tees` cambia (sync FedeGolf) y el ID al que apuntaba desaparece | `ON DELETE SET NULL` en la FK → jugador vuelve al fallback automáticamente. |
| Admin ve modo manual activo pero el dropdown vacío de opciones (cancha sin tees cargados) | Mostrar mensaje "Esta cancha aún no tiene tees cargados — contactá al admin" + link a sync. Edge case raro. |
| Performance: cargar 50 jugadores + course_tees + categorías | Una query JOIN. <500ms en prod. Si fuera lento, paginar (out of scope hoy). |

---

## Estimación

- Refactor base JugadoresPanel (decomposición + hooks + data layer + tests): **~1 día**
- Feature tee-por-admin encima (schema + types + UI + API + motor + tests): **4-6 h**
- Validación end-to-end (smoke preview + code review pre-merge): **2 h**

**Total estimado: ~1.5 días**

Sin el refactor (rompiendo regla "el que toca, ordena"): 6 h. Pero deja el archivo más sucio que antes y obliga a wizard-equipos-e2e a rehacer todo cuando se retome.
