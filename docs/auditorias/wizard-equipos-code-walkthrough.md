# Wizard Organizar Torneo Equipos — Code Walkthrough

> Fecha: 2026-05-22 · Branch: `main` · Commit base: `09ab3ee`
> Reconstrucción 100% a partir de código fuente. NO se modificó nada.

## 1. Arquitectura del wizard

**El "wizard" NO es un wizard.** Es un editor de un único draft con todas las secciones renderizadas en una sola página scrollable. No hay steps, no hay back/next, no hay validación por etapa. Toda la configuración vive en un draft (`tournament_drafts.config` JSONB) que se autosalva.

Layout principal:

- **Route**: `src/app/organizador/nuevo/page.tsx` (server component, carga `courses`, drafts del owner y torneos recientes en paralelo).
- **Root client**: `src/app/organizador/nuevo/TournamentDraftEditor.tsx:108` — orquesta modal de inicio, store Zustand (`@/lib/draft/store`), header/footer/preview/assistant.
- **Store**: `src/lib/draft/store.ts` — autosave + sync con `/api/torneos/draft/:id`.
- **Tipos**: `src/lib/draft/types.ts` (`TournamentConfig`, `TeamConfig`, `MatchPlayConfig`, etc.).

Secciones renderizadas en `TournamentDraftEditor.tsx:356-371` (orden literal):

| # | Archivo | Visibilidad |
|---|---|---|
| 0 | `DraftHeader.tsx` | Siempre (nombre, autosave, colaboradores) |
| 0.5 | `AssistantPanel` (hero IA) | Siempre — primer foco del usuario |
| 1 | `sections/QueTorneoSection.tsx` | Siempre |
| 2 | `sections/ComoJueganSection.tsx` | Siempre |
| 3 | `sections/EquiposSection.tsx` | Solo si `format ∈ {best_ball, scramble, foursome}` |
| 4 | `sections/MatchPlaySection.tsx` | Solo si `format === 'match_play'` |
| 5 | `sections/StablefordSection.tsx` | Solo si `format === 'stableford'` |
| 6 | `sections/CategoriasSection.tsx` | Siempre |
| 7 | `sections/RondasSection.tsx` | Siempre |
| 8 | `sections/TeesSection.tsx` | Siempre |
| 9 | `sections/InscripcionSection.tsx` | Siempre |
| 10 | `sections/PremiosSection.tsx` | Siempre |
| 11 | `sections/AdminsSection.tsx` | Siempre |
| - | `DraftFooter.tsx` | Sticky bottom (Vista previa / Crear torneo →) |

## 2. Steps en secuencia (página única, no hay steps)

### 2.0 StartModal (gateway antes del editor)

`TournamentDraftEditor.tsx:491-569` — Modal que aparece si no hay `?draft=` en la URL.

- Título: `"Nuevo torneo"` · subtítulo `"¿Por dónde empezamos?"` (line 503-504)
- Botón primario: `"+ Empezar desde cero"` → POST `/api/torneos/draft` (line 188).
- Lista "Continuar un borrador" — solo si `existingDrafts.length > 0`.
- Lista "Duplicar desde un torneo previo" — solo si `recentTournaments.length > 0`.
- No validaciones; sin botón cancelar (queda atrapado en el modal).

### 2.1 Qué torneo (`QueTorneoSection.tsx`)

- Título: `"Qué torneo"` (line 34).
- Campos: `Nombre` (text), `Fecha de inicio` (date), `Foto de portada (URL)` (url).
- Sin required visual; la validación bloqueante recién aparece en el footer.
- Side-effect: setear `date_start` propaga a `rounds[0].date` si la primera ronda no tiene fecha (line 60-66).

### 2.2 Cómo juegan (`ComoJueganSection.tsx`)

- Título: `"Cómo juegan"` (line 48).
- Chips de formato: **`Stroke Play · Stableford · Best Ball · Scramble · Match Play · Foursome`** (line 18-25).
- Chips de modo: `Gross · Neto`. Si formato ∈ {stableford, match_play}, neto se fuerza (line 27, 80-87).

### 2.3 Equipos (`EquiposSection.tsx`) — CLAVE de esta auditoría

Render condicional: `if (!['best_ball','scramble','foursome'].includes(config.format)) return null` (line 16, 25-27).

**Solo 3 campos**:

1. **Tamaño de equipo** (select): `2 / 3 / 4 jugadores` (line 49-52).
2. **% de handicap** (select): `USGA 35/15 · USGA 25/15 · Promedio simple · Custom` (line 65-68).
3. **Armado de equipos** (select): `Manual (organizador arma) · Aleatorio · Por handicap · Los jugadores eligen` (line 84-88).

Solo para scramble se muestra un cuarto campo: `"Mínimo drives por jugador (scramble)"` (number, line 91-110).

🔴 **NO hay UI para CREAR equipos. NO hay UI para ASIGNAR jugadores a equipos. NO hay nombres de equipo, ni cantidad de equipos, ni invitaciones.** Solo metadata declarativa (cómo se calcularán, cómo se armarán "después").

### 2.4 Match Play (`MatchPlaySection.tsx`)

- Solo si `format === 'match_play'` (line 22).
- Bracket: `Eliminación simple · Round robin · 1 vs 1`.
- Diferencia de handicap: `100% · 75% · 0%`.
- Toggle: hoyos de desempate.

### 2.5 Stableford / Categorías / Rondas / Tees / Inscripción / Premios / Admins

- **CategoriasSection**: lista editable inline con `+ Agregar categoría`. Empty state permitido (warning, no error — validator line 97-103).
- **RondasSection**: lista de `RoundConfig` (round_number, date, course_id, hole_count, tee_assignment_mode). Required para crear: cada ronda con `date` y `course_id`.
- **InscripcionSection**: modo `open_with_code / invite_only / club_members_only`.

### 2.6 Footer (`DraftFooter.tsx`)

- Botón izquierdo: `"Vista previa"` (siempre habilitado).
- Botón derecho: `"Crear torneo →"`.
- `ready = isReadyToCreate && errors.length === 0` (line 26).
- Si no está ready y hover, muestra tooltip con blockers (line 95-108): "Falta para poder crear: …" + lista de hasta 6.

## 3. Modalidad equipos: formatos ofrecidos

Del enum `TournamentFormat` (`src/lib/draft/types.ts:2-4`):

- `best_ball` (label UI: **"Best Ball"**)
- `scramble` (**"Scramble"**)
- `foursome` (**"Foursome"**)

Los tres son los formatos **de equipo**. `match_play` también puede ser de equipos en la realidad, pero el código actual no lo trata así — no muestra `EquiposSection` para match_play (line 16 EquiposSection).

🔴 **No existen** los formatos chilenos populares: **Match Play x Bandera**, **Bola Pinta**, **Mejor Bola individual (4-pelotas)**, **Greensome / Pinehurst / Chapman**, **Texas Scramble**. El motor solo conoce los 6 formatos USGA core.

## 4. Asignación de jugadores a equipos

**No existe UI alguna.** Tres evidencias concretas:

1. `EquiposSection.tsx` solo edita `team_config` (line 31: `applyChange({ team_config: ...})`) — un objeto de metadata. Sin lista de equipos, sin botones de creación.

2. La página post-creación (`src/app/organizador/[slug]/jugadores/JugadoresPanel.tsx`) **NO contiene la palabra `team` ni `equipo`** (verificado con Grep). Solo hace búsqueda de jugadores por email/nombre y armado de grupos (`tournament_groups`).

3. La migración `supabase/migrations/20260522_team_format_tables.sql` crea `ronda_equipos` + `ronda_equipo_jugadores`, pero **referenciando `rondas_libres(id)`, NO `tournaments(id)`** (lines 23-49). Es decir: los equipos en BD solo existen para ronda libre, no para torneos.

4. El endpoint de creación (`src/app/api/torneos/draft/[id]/create-tournament/route.ts:75-94`) inserta `tournaments` con `formato_juego: config.format` pero **nunca lee `config.team_config`**, nunca inserta una tabla de teams, nunca crea equipos. La metadata de equipos se PIERDE silenciosamente al crear el torneo.

⚠️ **Handicap por equipo**: solo se almacena `handicap_pct` (% a aplicar) en el draft, pero como `team_config` no se persiste tras crear, ese % no afecta a ningún cálculo real más adelante.

## 5. Submit final + post-submit

Endpoint: `POST /api/torneos/draft/[id]/create-tournament` (`create-tournament/route.ts`).

Pipeline:

1. Auth + verificar owner (line 31-41).
2. `upgradeConfig(d.config)` (migra schema_version si hace falta).
3. Validación dura: zod `tournamentConfigSchema` (line 47) + `validateGolfRules` (line 50) + `isReadyToCreate` (line 52).
4. Lock: `status = 'creating'`.
5. INSERT directo a `tournaments` con service_role (line 75-96). **No es RPC**, es INSERT crudo.
6. INSERT a `categories` (cascade FK), `tournament_prizes`, `rounds` (a partir de la 2da; la 1ra vive en `tournaments` directo).
7. UPDATE `tournament_drafts.status = 'created'`.
8. Compensación: si algo falla después del INSERT inicial, hace `DELETE tournaments WHERE id = ...` y rollea draft a `'draft'`.
9. Side-effects:
   - `codigo` (6 caracteres alfanuméricos, alfabeto sin chars confundibles, line 22-27).
   - `slug` (nombre normalizado + timestamp base36, line 11-20).
   - No envía emails, no genera pairings, no crea players, no crea teams.
10. Redirect cliente: `router.push('/organizador/${data.slug}/jugadores')` (TournamentDraftEditor.tsx:268).

⚠️ **Pattern "transacción simulada"**: si el INSERT de categorías falla DESPUÉS del INSERT de tournament, el delete de compensación corre — pero si ese delete también falla, queda un tournament huérfano (line 158-159 solo loguea, no alerta a Sentry).

## 6. Heurística mínima (# clicks)

Camino "happy path" desde `/organizador/nuevo` hasta torneo equipos creado:

| # | Acción | Obligatoria | Notas |
|---|---|---|---|
| 1 | Click `"+ Empezar desde cero"` | Sí | crea draft, redirige al editor |
| 2 | Tipear nombre del torneo | Sí | blocker |
| 3 | Click date picker + elegir fecha | Sí | blocker |
| 4 | Click chip `Best Ball` (o Scramble / Foursome) | Sí | dispara visibilidad de EquiposSection |
| 5 | (opcional) Cambiar tamaño/handicap/formación de equipo | No | defaults: 2 jugadores, USGA 35/15, manual |
| 6 | Scroll a Rondas. Click date picker ronda 1 | Sí | blocker |
| 7 | Click CourseSelector + buscar + click cancha | Sí | blocker (autocomplete, mínimo 2 interacciones) |
| 8 | Scroll al footer, click `"Crear torneo →"` | Sí | |

**Mínimo absoluto: ~9-10 clicks/interacciones** + 2 textos (nombre, fecha). Vista previa es opcional.

Acciones que aparentan obligatorias pero NO lo son: categorías (warning), inscripción (defaults OK), premios, admins, tees explícitos. El blocker minimal son: `name`, `date_start`, `rounds[0].date`, `rounds[0].course_id`, y `team_config` se autocompleta con default al cambiar formato (`EquiposSection.tsx:18-22`).

## 7. Hallazgos críticos (bugs, fricciones, branches problemáticos)

### 🔴 P0 — `team_config` se PIERDE al crear el torneo

`create-tournament/route.ts:75-96` inserta solo `format`, `formato_juego`, `modo_juego`, `hole_count`, etc. No hay rastro de `team_config.size`, `team_config.handicap_pct`, `team_config.formation_mode`. Cualquier elección que haga el usuario en `EquiposSection` se evapora. La página `jugadores` no sabe ni que es torneo de equipos.

**Impacto**: usuaria configura "Best Ball, 2 jugadores, manual" → footer dice "OK, listo" → torneo se crea → llega a `/organizador/<slug>/jugadores` → ve UI de scoring individual. La promesa del wizard se rompe en silencio.

### 🔴 P0 — No existe asignación de jugadores a equipos (en torneos)

No hay `tournament_teams` ni `tournament_team_players` en migraciones. Las tablas `ronda_equipos` / `ronda_equipo_jugadores` (`20260522_team_format_tables.sql:35-50`) solo apuntan a `rondas_libres`. Por lo tanto: torneo creado en modo Best Ball **no tiene path para formar equipos jamás**.

Memoria sub-utilizada que dice "UI de Asignación de Equipos SÍ Está Implementada — Renderiza Condicionalmente" es **falsa hoy** (ver §8).

### 🔴 P0 — Formatos chilenos populares ausentes

`TournamentFormat` solo cubre `stroke_play | stableford | best_ball | scramble | match_play | foursome`. Falta: Match Play x Bandera (juego típico de clubes chilenos), Bola Pinta, Greensome, Pinehurst, Texas Scramble. El backlog (`docs/superpowers/plans/archive/2026-Q2/2026-04-16-team-formats.md`) menciona algunos como follow-up.

### ⚠️ Footer tooltip oculta blockers en mobile

`DraftFooter.tsx:92-94` el tooltip de blockers se abre con `onMouseEnter` (no hay equivalente táctil). En mobile, si el botón está disabled, el usuario no entiende por qué. `onFocus` (line 115) ayuda algo pero requiere tab focus, no tap.

### ⚠️ Pattern "transacción simulada" frágil

`create-tournament/route.ts:152-160`: si falla el rollback delete, el tournament huérfano queda en BD y solo se loguea con `console.error`. No notifica Sentry, no alerta al organizador, el draft queda en estado `'draft'` aunque ya haya un torneo creado parcialmente. Idempotencia rota.

### ⚠️ ComoJueganSection cambia modo silenciosamente

`ComoJueganSection.tsx:33-39`: cambiar formato a stableford/match_play patchea también `modo: 'neto'` sin avisarle al usuario. Reversible (no es bug per se), pero podría sorprender.

### ⚠️ Sin "back" / "cancel" en el editor

Una vez creado el draft (que pasa solo con click `"+ Empezar desde cero"`), no hay forma visible de descartar y volver al dashboard. La X del browser o `/dashboard` directo es el único escape. Drafts quedan en BD.

### ⚠️ AssistantPanel error boundary tragado

`TournamentDraftEditor.tsx:390-424` `AssistantErrorBoundary` captura cualquier error del chat IA y muestra "Asistente no disponible". Loguea con `console.error` pero **no a Sentry**. Si el assistant rompe, nadie se entera.

### ⚠️ No hay validación de "min jugadores para tamaño_equipo"

Si organizador elige equipos de 3 pero después inscribe 7 jugadores, no hay warning. Se descubre el día del torneo.

### ⚠️ EquiposSection no muestra cuántos equipos se formarán

Solo pide `size` y `formation_mode`. No hay input "cantidad de equipos" ni preview tipo "con 16 jugadores y equipos de 2 → 8 equipos". El organizador queda volando hasta `/jugadores`.

## 8. Resolución de contradicción de memoria

Memoria A: *"Selector de Formatos de Equipo Implementado — Falta UI de Asignación de Jugadores a Equipos"*

Memoria B: *"UI de Asignación de Equipos SÍ Está Implementada — Renderiza Condicionalmente"*

**Memoria A es la verdad al 2026-05-22.** Memoria B está obsoleta o se refiere a una vista que nunca existió en el path de torneos.

Evidencia:

1. `EquiposSection.tsx` renderiza condicionalmente — eso es lo que parecía cumplir Memoria B — pero solo edita **metadata** (`size`, `handicap_pct`, `formation_mode`), no asigna jugadores reales.
2. `JugadoresPanel.tsx` (la página post-creación de jugadores) no contiene strings `team|equipo` (Grep exhaustivo).
3. Migración de tablas de equipos `20260522_team_format_tables.sql` solo crea tablas para `rondas_libres`, no para `tournaments`.
4. `create-tournament/route.ts` no persiste `team_config` ni crea registros en ninguna tabla de equipos.

Memoria B probablemente confundió la render condicional de **configuración** con la UI de **asignación**. Son dos cosas distintas. La asignación no existe.

---

## TL;DR

El "wizard de torneos" es un editor de una página con autosave a draft JSONB. Modo equipos hoy es una promesa rota: el usuario puede declarar metadata de equipos pero esa data se borra al crear el torneo, y no hay UI para formar equipos reales. Los tres formatos USGA (Best Ball, Scramble, Foursome) están como chips clickeables, pero el resto del producto los ignora. Formatos chilenos populares (Match Play x Bandera, Bola Pinta) no existen en el enum.
