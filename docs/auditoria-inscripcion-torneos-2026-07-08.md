# Auditoría — Inscripción de jugadores a torneos (el "mundo de torneos")

> Fecha: 2026-07-08 · Método: recon de código con evidencia `file:line` (read-only). Complementa `docs/auditoria-campeonato-padre-e-hijo-lb-2026.md` (ciclo de torneo) enfocándose en **cómo entra un jugador al torneo** — la puerta de entrada al uso de la app.
>
> **Por qué importa:** la inscripción es el primer contacto real de cada jugador con Golfers+. Si un padre-hijo se inscribe y su neto sale mal, o el organizador sobre-inscribe el cupo, se rompe CERO FALLOS en el momento de máxima exposición.

---

## Veredicto

| Subsistema | Estado | Escala |
|---|---|---|
| **Inscripción self-service** (jugador se anota solo) | 🟢 sólido | 8/10 |
| **Alta por organizador** (agrega jugadores/invitados) | 🔴 con bugs de corrección | 4/10 |
| **Armado de grupos/parejas** | 🟡 funciona pero fuera de la capa de datos | 6/10 |
| **Reutilización / "un concepto, una fuente"** | 🔴 3 caminos reimplementan lo mismo | 3/10 |

**Hallazgo central:** hay **3 caminos de inscripción** que insertan en las mismas tablas (`players` + `rounds`) pero **cada uno reimplementa la lógica por su cuenta**. La validación de cupo existe en **1 solo camino**; el course handicap se calcula con **2 fórmulas** (una sin soporte 9h); la creación de la ronda está **triplicada**; y la "capa canónica" que debería unificar (`src/lib/data/tournaments/players.ts::inscribePlayer`) está **muerta y rota** (inserta una columna inexistente `profile_id`).

> Nota de modelo de datos: la inscripción NO usa tablas `tournament_players`/`rondas_libres`. Vive en `players` (una fila por inscrito, `user_id` XOR `pending_user_id` para invitados) + `rounds` (una por inscrito). Los grupos/parejas viven en `tournament_groups` + `tournament_group_players`.

---

## Los 3 caminos (con evidencia)

### A — Self-service ✅ (el más correcto — usar como patrón)
```
torneo/[slug]/unirse/page.tsx  → POST /api/torneos/[slug]/inscribirse/route.ts
  → joinFlow.fetchJoinInfo()            (lib/data/tournaments/joinFlow.ts:75)
  → resolverCourseHandicap()            (golf/core/course-handicap.ts:24)   ← fórmula canónica (9h/18h)
  → joinFlow.registerPlayerAndRound()   (joinFlow.ts:117)
       ├─ gate status==='open'          (joinFlow.ts:126)
       ├─ CHEQUEO DE CUPO max_players   (joinFlow.ts:142-161)   ← ÚNICO camino que lo hace
       ├─ INSERT players (RegisterResult tipado)  (joinFlow.ts:163)
       └─ INSERT rounds                 (joinFlow.ts:198)
```

### B — Alta por organizador 🔴
```
organizador/[slug]/jugadores/ → hooks/usePlayers.ts  (client, supabase.from() DIRECTO)
  ├─ inscribirPlayer()  (usePlayers.ts:43)   registrado
  │    ├─ calcCourseHandicap()  (usePlayers.ts:8)   ← FÓRMULA DUPLICADA, SOLO 18h
  │    ├─ INSERT players         (usePlayers.ts:67)  ← sin cupo, sin gate de status
  │    └─ INSERT rounds          (usePlayers.ts:92)
  └─ inscribirGuest()   (usePlayers.ts:115)  invitado
       ├─ INSERT players (pending_user_id)  (usePlayers.ts:128)
       └─ INSERT rounds          (usePlayers.ts:159)
```

### C — Armado de grupos/parejas 🟡
```
JugadoresPanel.tsx → hooks/useGroups.ts  (client, supabase.from() DIRECTO)
  ├─ tournament_groups           INSERT/UPDATE/DELETE
  └─ tournament_group_players    INSERT/DELETE   (delete-then-insert: 1 jugador ≤1 grupo)
```
El organizador crea los grupos a mano (no hay auto-armado de parejas). `grupo = flight/tee-time`; "grupo = equipo" se materializa en scoring vía `tournament_groups.ronda_libre_id`.

---

## Hallazgos rankeados

### 🔴 P1 — El organizador puede sobre-inscribir el cupo (`max_players` ignorado)
- **Evidencia:** `registerPlayerAndRound` valida cupo (`joinFlow.ts:142-161`) pero `inscribirPlayer`/`inscribirGuest` (`usePlayers.ts:43,115`) **no cuentan inscritos**.
- **Impacto Padre e Hijo:** el cupo de 24 (que acabamos de hacer respetar en el flujo público, #248) **no se respeta cuando el organizador agrega parejas** — que es el camino natural para un padre-hijo. Parejas de más el día del torneo.
- **Decisión de producto pendiente (Juanjo):** ¿el organizador puede **override** el cupo (agregar aun estando lleno, con warning) o se le **bloquea** igual que al público? Recomiendo *warn + permitir* (el organizador manda), pero contar y avisar.

### 🟠 P2 — Course handicap del organizador NO soporta 9 hoyos · ✅ VERIFICADO: cosmético para el neto de equipos
- **Evidencia:** `calcCourseHandicap` (`usePlayers.ts:8-10`) = `round(indice*(slope/113)+(rating-par))`, **solo escala 18h**; no divide `/2` ni usa CR/slope de 9h como la canónica `resolverCourseHandicap` (`course-handicap.ts:6`). Al inscribir un **registrado** guarda ese CH (doble en 9h) en `handicap_at_registration` (`usePlayers.ts:73`).
- **✅ Verificado (2026-07-08) — NO corrompe el neto del Padre e Hijo:** el board de equipos re-deriva el handicap a scoring-time con `resolvePlayerHandicap` (`teamRounds.ts:80-85`), cuya precedencia es **`profiles.indice` (índice WHS vivo) → `handicap_at_registration` → 0**. Para un registrado usa el índice vivo; `calcularScramble/Foursome` hacen la conversión a course handicap 9h internamente (#245). Los **invitados** guardan el **índice crudo** (`inscribirGuest`, no `calcCourseHandicap`), que es el input correcto. El `handicap_at_registration` mal calculado solo se usa para **display** de HCP en pantallas de score y como fallback si `profiles.indice` es null.
- **Impacto real (menor):** display de HCP incorrecto para registrados agregados por el organizador en 9h, y riesgo en el **path individual/legacy** (`torneo/[slug]/score/page.tsx:129` usa `handicap_at_registration` como índice directo). No bloquea el campeonato.
- **Fix (al unificar):** eliminar `calcCourseHandicap` y usar `resolverCourseHandicap` — cae solo cuando se haga `enrollPlayer` (abajo).

### 🔴 P2 — Capa canónica `inscribePlayer` muerta y rota (trampa)
- **Evidencia:** `lib/data/tournaments/players.ts::inscribePlayer` inserta `profile_id` (columna inexistente; la tabla usa `user_id`, `001:81`). No se llama desde ningún call-site real (solo tests). Cualquiera que "migre a la capa canónica" rompe la inscripción en runtime.
- **Fix:** reemplazarla por la función unificada de abajo (o borrarla). No dejar dead code que parece la solución correcta.

### 🟠 P2 — Sin gate de status en el camino organizador
- `inscribirPlayer`/`inscribirGuest` no validan `status` del torneo → se pueden agregar jugadores a un torneo `closed`/`published` (que ahora congelamos en #248). Solo self-service lo bloquea (`joinFlow.ts:126`).

### 🟠 P2 — Jugador inscrito sin `rounds` (no atómico)
- Los 3 caminos crean `rounds` como best-effort y **no abortan si falla** (`joinFlow.ts:204-211`, `usePlayers.ts:97,164`). Un jugador puede quedar en `players` sin su `rounds` → scoring/leaderboard roto para ese jugador. Debería ser una RPC transaccional (players + rounds juntos).

### 🟡 P3 — Cupo no atómico (race condition)
- El chequeo de cupo (`joinFlow.ts:142-161`) es check-then-insert sin lock (el propio TODO lo admite). Bajo concurrencia entra 1 de más. Fix real: constraint/trigger en DB (`count(approved) <= max_players`).

### 🟡 P3 — Duplicación de concepto (regla "un concepto, una fuente")
- Inserción de `players` reimplementada 3× · mapeo de errores 2× (tipado vs string-matching) · SELECT de grupos 2× (`groups.ts::GROUPS_SELECT` vs inline `useGroups.ts:36`, con shapes distintos) · `groups.ts::createGroup/assignPlayerToGroup` también muertos (solo tests).

---

## Recomendación: 1 función canónica de inscripción

Crear/arreglar **una** función server-side reutilizable (arreglar `lib/data/tournaments/players.ts`, `profile_id`→`user_id`):

```ts
enrollPlayer(admin, {
  tournamentId, tournamentStatus,
  identity: { userId } | { guestName, handicapIndex },  // registrado XOR invitado
  categoryId?, teeId?,
  enforceStatusGate?: boolean,   // true en self-service; en organizador según decisión
  enforceCapacity?: boolean,     // true siempre (o warn en organizador)
}): Promise<RegisterResult>
```
Responsabilidades (hoy dispersas): (a) gate de status, (b) cupo `max_players`, (c) course handicap vía `resolverCourseHandicap` (9h/18h — una sola fórmula), (d) INSERT `players` respetando `players_identity_check`, (e) INSERT `rounds` **en la misma RPC transaccional**, (f) `RegisterResult` tipado.

**Call-sites a migrar:**
1. `registerPlayerAndRound` (self-service) → wrapper delgado de `enrollPlayer`.
2. `usePlayers.inscribirPlayer/inscribirGuest` → POST a un endpoint nuevo `/api/organizador/[slug]/players` que llame `enrollPlayer` (saca `supabase.from()` del cliente; elimina `calcCourseHandicap`).
3. Grupos: consolidar en `groups.ts` (arreglar shape de `listGroups`) y migrar `useGroups.ts` a endpoint.

**Beneficio:** cupo, course-handicap 9h/18h, ronda transaccional y mapeo de errores quedan en **un** lugar para los 3 caminos. La inscripción pasa de 3 implementaciones divergentes a 1 fuente.

---

## Plan sugerido (orden, no bloquea el PR de P2)

| # | Acción | Tipo | Bloqueante Padre e Hijo |
|---|---|---|---|
| 1 | ✅ **Verificado**: el board re-deriva el CH de `profiles.indice`/índice crudo → bug 9h del organizador es cosmético (no P0) | recon (hecho) | no |
| 2 | Cupo en camino organizador (warn/bloqueo — **decisión Juanjo**) | fix + test | **sí** (cupo 24) |
| 3 | `enrollPlayer` canónica + RPC transaccional players+rounds (arregla `profile_id`, gate status, course-handicap 9h) | refactor (worktree) | no, pero paga toda la deuda |
| 4 | Migrar `usePlayers`/`useGroups` a endpoints sobre la capa de datos | refactor | no |
| 5 | Constraint DB de cupo (atómico) | migración | no |

**Único bloqueante real para el Padre e Hijo: paso 2 (cupo en el camino organizador).** Requiere una decisión de producto tuya (Juanjo): ¿el organizador puede pasarse del cupo con warning, o se le bloquea igual que al público?

> Nota de alcance ("un concepto, una fuente"): la unificación toca **write-paths de creación de torneo** — no se mete a la fuerza en un PR de display. Se hace en su propio worktree cuando se toque ese flujo. Los pasos 1-2 sí son acotados y relevantes YA para el campeonato.
