# Organizar Campeonato — Spec de Diseño

**Fecha:** 2026-05-07
**Autor:** Claude (CTO) en colaboración con Juan José Lamarca (PM)
**Status:** Aprobado para implementación. Gateado por bugs P0/P1 abiertos (CERO FALLOS).
**Reemplaza:** `/organizador/nuevo` (`NuevoTorneoForm.tsx`, 771 líneas monolíticas).

---

## 1. Visión

Un solo flow universal **"Organizar campeonato"** que cubre todas las modalidades de juego del proyecto (stroke play individual, stableford, best ball, scramble, match play, foursome) y permite customización completa. El usuario objetivo es un organizador de club chileno (capitán, pro del club, socio).

La experiencia es **híbrida**: una **configuración viva del torneo** siempre visible y editable + un **asistente IA** al costado que también puede modificarla por lenguaje natural. Ambos modos coexisten. La configuración es la fuente de verdad; el chat es uno de varios modos de editarla.

El torneo se persiste como **borrador** en cuanto el usuario empieza, se autosaves continuamente, y solo se "crea" formalmente cuando todos los campos requeridos están válidos. Soporta **multi-admin** (1 a 4 admins por torneo) con last-write-wins simple, presence indicator y audit log. Soporta **multi-ronda** desde el día 1 (1 a N rondas, 1 a N días, misma o distinta cancha por ronda). El **live polimórfico** post-creación renderiza distintas vistas (individual, equipos, bracket) según el formato.

---

## 2. Reemplaza

| Componente actual | Estado | Acción |
|---|---|---|
| `src/app/organizador/nuevo/page.tsx` | Server component minimal (carga courses) | Reemplazar |
| `src/app/organizador/nuevo/NuevoTorneoForm.tsx` (771 líneas) | Wizard 3-step monolítico | **Eliminar** completo. Reemplazado por nuevo componente modular. |
| `src/app/api/torneos/create/route.ts` | POST atómico que crea torneo desde form | **Mantener pero re-firmar**: ahora recibe un `draft_id` validado en lugar de campos sueltos. La validación principal vive en el draft. |

---

## 3. Decisiones de producto confirmadas

| # | Decisión | Estado |
|---|---|---|
| 1 | Chat IA disponible 100% sin gating premium en MVP | Confirmado |
| 2 | Multi-admin de 1 a 4 admins, configurable por el organizador | Confirmado |
| 3 | Vista previa antes de crear: opcional pero accesible siempre | Confirmado |
| 4 | Multi-ronda full en MVP (no fase 2): 1 a N rondas, 1 a N fechas, 1 a N canchas | Confirmado |
| A | "Crear basado en torneo anterior" (duplicar config) en MVP | Confirmado |
| B | "Modo simulación del live" con scores fake en MVP | Confirmado (CERO FALLOS) |
| C | Roles owner vs colaborador (sin RBAC complejo) en MVP | Confirmado |
| D | Auto-detección de conflicto fecha+cancha del organizador | Confirmado |

---

## 4. Decisiones técnicas (CTO, no negociables)

Estas son arquitectónicas. Se toman ahora para evitar refactor en producción más adelante.

1. **Persistencia como borrador desde el primer cambio.** Tabla nueva `tournament_drafts`. Autosave debounceado a 500ms. El torneo "real" en `tournaments` solo se crea al hacer click en "Crear torneo" y validar invariantes.
2. **JSON Patch (RFC 6902) como protocolo de cambios.** Cada edit (manual o IA) se expresa como un patch. El cliente aplica el patch al state local y lo persiste. La IA devuelve patches, no campos.
3. **Audit log append-only desde el día 1.** Tabla `tournament_draft_events` con `(draft_id, actor_id, patches_json, source: 'manual'|'ai', created_at)`. Sin esto, retrofitearlo en producción con miles de torneos es caro.
4. **Reglas de golf como datos, no código.** Cada formato tiene parámetros (`% handicap`, `min_drives`, `points_table`, `team_size_min/max`, etc.) que viven en el draft o en una tabla `format_rules`. La UI los expone editables; nunca están hardcoded en el componente.
5. **Live polimórfico modular.** Componente raíz `<TournamentLiveView format={...}>` delega a sub-componentes:
   - `IndividualLeaderboard` (stroke play, stableford individual)
   - `TeamLeaderboard` (best ball, scramble, foursome)
   - `MatchPlayBracket` (match play eliminatorio)
   Cada formato nuevo es un archivo nuevo. Cero `if (format === 'X')` gigantes.
6. **Schema preparado para plantillas reusables.** Tabla `tournament_templates` existe desde el día 1 (vacía o con seeds del club). La UI de "guardar como plantilla" puede salir en fase 2 sin migración.
7. **Tee por jugador siempre presente en el modelo.** Campo `tee_assignment_mode: 'per_player' | 'per_category'` en cada ronda del draft. Nunca asumir un único tee por torneo. Memoria del proyecto: tee por jugador es transversal a todas las modalidades.
8. **Tokens del design system, no hardcodes.** El componente nuevo usa los tokens (`--brand-gold`, `--brand-dark`, etc.) en lugar del objeto `colors = {...}` que tiene el form actual. Compatible con el toggle Auto/Light/Dark.
9. **El chat IA está scoped al draft, separado del coach (tAIger+).** Endpoint distinto, system prompt distinto (extracción de torneos, no entrenamiento personal), sin acceso al historial de coaching. Un bug en el chat de torneos no afecta al coach.
10. **Validación del schema con zod en cliente y servidor.** Cada patch pasa por validación zod antes de aplicarse. Reglas invariantes de golf (ej: scramble requiere `team_size`) se hardcoded en el validator, no se delegan a la IA.

---

## 5. Modelo de datos

### Tabla nueva: `tournament_drafts`

```
id              uuid pk
owner_id        uuid fk profiles  (creador, único que puede borrar)
name            text                (puede estar vacío al inicio)
config          jsonb               (la configuración entera; ver schema abajo)
status          text                ('draft', 'creating', 'created', 'archived')
                                    -- draft: editable, default
                                    -- creating: lock temporal mientras se ejecuta create-tournament transaction
                                    -- created: torneo real existe (tournament_id != null), draft es solo histórico
                                    -- archived: el organizador descartó el draft sin crear el torneo
version         int                 (optimistic locking, increment cada update)
tournament_id   uuid fk tournaments null  (set cuando status='created')
created_at      timestamptz
updated_at      timestamptz
```

### Tabla nueva: `tournament_draft_collaborators`

```
draft_id        uuid fk tournament_drafts
user_id         uuid fk profiles
role            text                ('owner' | 'collaborator')
added_by        uuid fk profiles
added_at        timestamptz
primary key     (draft_id, user_id)
```

Owner está en `tournament_drafts.owner_id` y también con role='owner' en esta tabla por simetría. Collaborators tienen role='collaborator'.

### Tabla nueva: `tournament_draft_events`

```
id              uuid pk
draft_id        uuid fk tournament_drafts
actor_id        uuid fk profiles
patches         jsonb       (array de JSON Patches RFC 6902)
source          text        ('manual' | 'ai')
ai_message      text null   (mensaje original del user al chat, si source='ai')
ai_explanation  text null   (explicación que dio la IA al user, si source='ai')
created_at      timestamptz
```

Append-only. Nunca se modifica ni se borra. Permite auditoría completa, undo histórico (fase 2), analytics.

### Tabla nueva: `tournament_templates` (estructura, sin UI en MVP)

```
id              uuid pk
owner_id        uuid fk profiles      (o null si es global del club/sistema)
name            text
config          jsonb
is_global       boolean default false (true = visible para todos los users del club)
created_at      timestamptz
```

Sin UI pública en MVP. La estructura existe para que en fase 2 se exponga sin migración.

### Schema del `config` (jsonb)

```typescript
interface TournamentConfig {
  // Que torneo
  name: string
  date_start: string                  // ISO date
  cover_image_url: string | null

  // Como juegan (a nivel torneo, defaults)
  format: 'stroke_play' | 'stableford' | 'best_ball' | 'scramble' |
          'match_play' | 'foursome'
  modo: 'gross' | 'neto'              // forced 'neto' for stableford & match_play
  use_handicap: boolean               // alias semántico de modo === 'neto'

  // Equipos (solo si format es de equipo)
  team_config?: {
    size: number                      // 2, 3, 4
    handicap_pct: 'usga_35_15' | 'usga_25_15' | 'simple_avg' | 'custom'
    handicap_pct_custom?: { lower_pct: number, higher_pct: number }
    min_drives_per_player?: number    // scramble
    formation_mode: 'manual' | 'random' | 'by_handicap' | 'players_choose'
  }

  // Match play (solo si format=match_play)
  match_play_config?: {
    bracket_mode: 'single_elimination' | 'round_robin' | 'one_vs_one'
    handicap_diff: 'full' | 'three_quarters' | 'none'
    extra_holes_on_tie: boolean
  }

  // Stableford (solo si format=stableford)
  stableford_config?: {
    points_table: { albatross_or_better: 5, eagle: 4, birdie: 3, par: 2, bogey: 1, double_or_worse: 0 }
    // editable por organizador
  }

  // Categorías
  categories: Array<{
    id: string                        // uuid local
    name: string
    handicap_min: number | null
    handicap_max: number | null
    gender: 'male' | 'female' | 'mixed' | null
    age_min?: number
    age_max?: number
    default_tee_color?: string        // sugerido para esta categoría
  }>

  // Rondas (1 o N)
  rounds: Array<{
    round_number: number              // 1, 2, 3, ...
    date: string                      // ISO date
    course_id: string                 // puede variar por ronda
    hole_count: 9 | 18
    tee_assignment_mode: 'per_player' | 'per_category'
    custom_si?: Record<string, number>  // override stroke index
    notes?: string
  }>

  // Inscripción
  registration: {
    mode: 'open_with_code' | 'invite_only' | 'club_members_only'
    code?: string                     // generado para 'open_with_code'
    deadline?: string                 // ISO datetime
    max_players?: number
  }

  // Premios
  prizes: Array<{
    id: string                        // uuid local
    type: 'category_position' | 'closest_to_pin' | 'long_drive' | 'special'
    description: string
    category_id?: string              // si type=category_position
    position?: number                 // 1, 2, 3...
    hole_number?: number              // si type=closest_to_pin o long_drive
  }>

  // Comportamiento (un solo flag, dos consecuencias)
  is_practice: boolean                // true = no actualiza WHS, no afecta ranking del club, no aparece en leaderboard global
                                      // (default false: torneo oficial)

  // Validación interna (computed)
  required_fields_complete: boolean   // calculated, not stored
}
```

### Migración a `tournaments` real

Cuando el organizador hace click en "Crear torneo":

1. El servidor valida `draft.config` con un zod schema completo (todos los campos requeridos presentes, reglas de golf válidas).
2. Si pasa, abre transacción:
   - Inserta en `tournaments` con los campos legacy del schema actual (mantiene compatibilidad con `players`, `rounds`, `categories`, etc.)
   - Inserta filas en `categories` (una por cada categoría del draft)
   - Inserta filas en `rounds` (una por cada ronda del draft)
   - Inserta filas en `tournament_prizes` (tabla nueva, ver abajo) si hay premios
   - Marca `tournament_drafts.status = 'created'` y `tournament_id = ...`
3. Si falla, transacción rollback. El draft queda intacto.

### Tabla nueva: `tournament_prizes`

```
id              uuid pk
tournament_id   uuid fk tournaments
type            text
description     text
category_id     uuid null fk categories
position        int null
hole_number     int null
awarded_to      uuid null fk players  (set cuando se entrega el premio)
created_at      timestamptz
```

### RLS (Row-Level Security) policies

- `tournament_drafts`:
  - SELECT/UPDATE: `owner_id = auth.uid()` OR `auth.uid() IN (SELECT user_id FROM tournament_draft_collaborators WHERE draft_id = id)`
  - DELETE: solo `owner_id = auth.uid()`
- `tournament_draft_collaborators`:
  - SELECT: el user es owner del draft o está en la lista
  - INSERT/DELETE: solo `owner_id` del draft
- `tournament_draft_events`:
  - SELECT: igual que `tournament_drafts`
  - INSERT: cualquier collaborator/owner (server enforced)
  - UPDATE/DELETE: nunca (append-only)

---

## 6. Componente raíz: `TournamentDraftEditor`

### Árbol de componentes

```
src/app/organizador/nuevo/
  page.tsx                          (server component, valida user, fetch courses, fetch existing drafts)
  TournamentDraftEditor.tsx         (client root, manages draft state)
    DraftHeader.tsx                 (nombre, status, autosave indicator, presence)
    ConfigPanel.tsx                 (panel izquierdo desktop / tab "Config" mobile)
      QueTorneoSection.tsx          (nombre, cancha, fecha, foto)
      ComoJueganSection.tsx         (formato, modo, hoyos)
      EquiposSection.tsx            (solo si team format)
      MatchPlaySection.tsx          (solo si match_play)
      StablefordSection.tsx         (solo si stableford)
      CategoriasSection.tsx         (lista editable de categorías)
      TeesSection.tsx               (per_player vs per_category)
      RondasSection.tsx             (multi-ronda)
      InscripcionSection.tsx        (modo, código, deadline)
      PremiosSection.tsx            (lista editable de premios)
      AdminsSection.tsx             (multi-admin: 1-4)
    AssistantPanel.tsx              (panel derecho desktop / tab "Asistente" mobile)
      AssistantMessages.tsx
      AssistantInput.tsx
      ProposalConfirmation.tsx      (cuando IA propone cambios de baja confianza)
    DraftFooter.tsx                 (botones: Vista previa | Crear torneo)
    DraftPreviewModal.tsx           (vista previa del live)
  utils/
    draft-store.ts                  (zustand store con autosave)
    apply-patch.ts                  (aplica JSON Patch al state)
    validate-config.ts              (zod schema + reglas de golf)
```

### Estado del draft (zustand)

```typescript
interface DraftStore {
  draftId: string
  config: TournamentConfig
  version: number
  collaborators: Array<{ user_id, role, name }>
  presence: Array<{ user_id, name, lastSeen }>
  pendingPatches: Patch[]      // queued for next autosave flush

  applyPatches(patches: Patch[], source: 'manual' | 'ai'): void
  undoLastChange(): void        // for the 5-second toast
  flush(): Promise<void>        // sends pending patches to server
}
```

### Autosave loop

- Cada `applyPatches` agrega a `pendingPatches` y schedules un flush en 500ms.
- Flush envía `POST /api/torneos/draft/{id}/patches` con `{ patches, version }`.
- Server valida version, aplica patches al jsonb config, incrementa version, inserta evento en `tournament_draft_events`.
- Si server devuelve `409 Conflict` (otro admin editó), el cliente refresca config y muestra toast `Pedro cambió Categorías. Tus cambios fueron descartados, refrescá.`
- Indicador visual: `Borrador guardado hace 3s` en el footer.

### Presence (multi-admin)

- Channel Supabase Realtime: `tournament_draft:{draftId}:presence`.
- Cada cliente publica `{ user_id, name, last_seen, current_section }` cada 10s.
- UI: avatares pequeños arriba a la derecha; tooltip muestra qué sección está editando.

---

## 7. Asistente IA: API y comportamiento

### Endpoint: `POST /api/torneos/draft/{id}/assistant`

**Request:**
```json
{
  "message": "Scramble parejas, sabado 12 jul, Los Leones, neto, 20-30 personas",
  "current_config": { ... }
}
```

**Response:**
```json
{
  "patches": [
    { "op": "replace", "path": "/format", "value": "scramble" },
    { "op": "replace", "path": "/modo", "value": "neto" },
    { "op": "replace", "path": "/team_config/size", "value": 2 },
    { "op": "replace", "path": "/rounds/0/date", "value": "2026-07-12" }
  ],
  "explanation": "Actualice formato a scramble parejas, modo neto, fecha al 12/jul. Falta confirmar tees (los marque como 'per_player' por defecto) y categorias.",
  "needs_confirmation": [
    { "field": "tees_per_player", "reason": "no especificado" },
    { "field": "categories", "reason": "no especificado, sugiero default 'General'" }
  ]
}
```

### System prompt (alto nivel)

```
Sos un asistente especializado en armar torneos de golf en clubes chilenos.
Tu única tarea es producir JSON Patches (RFC 6902) que modifiquen una configuración
de torneo en base al mensaje del organizador.

Reglas estrictas:
1. Si NO te lo dijo explícitamente, NO inventes. Marca como "needs_confirmation".
2. NUNCA inventes reglas de golf. Solo usa formatos y parámetros conocidos.
3. NUNCA toques campos sobre los que no tienes alta confianza.
4. Devolvé siempre JSON valido con la estructura exacta esperada.
5. Tu respuesta es para el organizador (en español, conciso, sin tecnicismos).

Formatos validos: stroke_play, stableford, best_ball, scramble, match_play, foursome.
Modos validos: gross, neto.
Match play y stableford fuerzan modo neto.
...
```

### Validación server-side de la respuesta

1. Schema zod de la respuesta JSON.
2. Cada patch en `patches[]` se valida contra el schema del config.
3. Si una regla de golf invariante se rompería (ej. scramble sin team_size), el patch se rechaza.
4. Solo patches válidos se aplican y se persisten.
5. La explicación se muestra al user en el chat.
6. Los `needs_confirmation` se muestran como badges junto a los campos correspondientes.

### Costos y latencia

- Modelo: Claude Haiku 4.5 (rápido y barato para extracción estructurada).
- Costo aproximado: $0.001-$0.005 por mensaje. Para un torneo armado con ~5 mensajes, ~$0.025.
- Latencia objetivo: <3 segundos. Si supera 8s, fallback al modo manual con disclaimer.
- Sin caching agresivo (cada draft es único).
- **Sin streaming en MVP**: la respuesta es un objeto JSON estructurado, streaming no aporta UX y complica el parsing. Si latencia molesta en producción, se evalúa.

### Comportamiento del cambio (UX del patch)

1. Usuario tipea "Scramble parejas".
2. IA devuelve patches.
3. Cliente aplica patches al state.
4. Los campos modificados se highlight amarillo por 2 segundos.
5. Toast en la esquina: `tAIger+: cambié formato a Scramble. [Deshacer]` (5 segundos).
6. Si el user no tocá, se confirma. Si toca "Deshacer", se aplica el patch inverso.

### Aislamiento del coach

- Endpoint distinto: `/api/torneos/draft/.../assistant` (no `/api/taiger/chat`).
- System prompt distinto, totalmente focalizado en torneos.
- Sin acceso al historial de coach del usuario.
- Sin tools (no llama a herramientas, solo extrae estructura).
- Modelo separado en config (Haiku vs el Sonnet/Opus que use el coach).

---

## 8. Layouts visuales

### Desktop (≥1024px)

Dos paneles fijos lado a lado, con scroll independiente. Panel izquierdo es la configuración (~60% ancho). Panel derecho es el asistente (~40%).

```
+----------------------------------------+--------------------+
|  [< Volver]  Copa Club Mayo 2026       |  Asistente IA      |
|  Borrador  Guardado hace 3s     A B    |                    |
|                                        |  Hola. Decime el   |
|  ─── Que torneo ──────────────         |  torneo en una     |
|  Nombre   [Copa Club Mayo 2026     ]   |  frase.            |
|  Cancha   [Los Leones (Sur)      v]    |                    |
|  Fecha    [Sab 12/jul/2026         ]   |  > Scramble        |
|  Foto     [+ subir]                    |    parejas, sab    |
|                                        |    12 jul, Los     |
|  ─── Como juegan ─────────────          |    Leones, neto    |
|  Formato  [Scramble       v]           |                    |
|  Modo     [Neto (forzado)] (lock)      |  Listo. Actualice  |
|                                        |  formato, modo,    |
|  ─── Equipos ──────────────             |  cancha y fecha.   |
|  Tamaño   [2 v]                        |  Falta tees y      |
|  % HCP    [USGA 35/15      v]          |  categorías.       |
|                                        |                    |
|  ─── Categorias ──────────              |  ────────────────  |
|  + Damas  Tees Rojas   [editar][x]     |  [______________]  |
|  + Varones A  HCP 0-12 Negras  [...]   |  [Enviar]          |
|  [+ Agregar categoria]                 |                    |
|                                        |                    |
|  ─── Rondas ──────────────              |                    |
|  Ronda 1  Sab 12/jul Los Leones 18h    |                    |
|  [+ Agregar ronda]                     |                    |
|                                        |                    |
|  ─── Inscripcion ─────────              |                    |
|  Abierta con codigo  CLUB-XR4T  [QR]   |                    |
|                                        |                    |
|  ─── Premios ──────────────             |                    |
|  + 1ro y 2do por categoria   [x]       |                    |
|                                        |                    |
|  ─── Admins ───────────────             |                    |
|  [Vos]  + Pedro Garcia  [+invitar]     |                    |
|                                        |                    |
|  ──────────────────────────              |                    |
|  [Vista previa]   [Crear torneo →]      |                    |
+----------------------------------------+--------------------+
```

### Mobile (<1024px)

Tabs arriba: `[Configuración | Asistente]`. Una sola sección visible a la vez. Al volver de Asistente a Configuración, los campos modificados parpadean amarillo 2 segundos para que el user vea qué cambió.

```
+--------------------------------+
|  [< Volver]                    |
|  Copa Club Mayo 2026           |
|  Borrador · Guardado hace 3s   |
|                                |
|  [Configuración] [Asistente]   |
|  ━━━━━━━━━━━━━                  |
|                                |
|  ─── Que torneo ──             |
|  Nombre [Copa Club Mayo 2026 ] |
|  Cancha [Los Leones        v]  |
|  Fecha  [Sab 12/jul/2026   ]   |
|                                |
|  ─── Como juegan ──            |
|  Formato [Scramble       v]    |
|  Modo    [Neto         lock]   |
|                                |
|  ─── Equipos ──                |
|  Tamaño  [2 v]                 |
|  % HCP   [USGA 35/15     v]    |
|                                |
|  ─── Categorias ──             |
|  + Damas Tees Rojas  [...]     |
|  + Varones A 0-12  [...]       |
|  [+ Agregar]                   |
|                                |
|  ...                           |
|                                |
|  [Vista previa]                |
|  [Crear torneo →]              |
+--------------------------------+
```

### Sticky footer en ambos layouts

- "Borrador guardado hace Xs" + spinner si flush en curso.
- Botón `Vista previa` (siempre disponible).
- Botón `Crear torneo →` (deshabilitado hasta que `required_fields_complete = true`, con tooltip que lista qué falta).

---

## 9. Flujos de usuario clave

### Flujo 1: Crear torneo desde cero con chat

1. Click "Organizar campeonato" → entra a `/organizador/nuevo` → se crea draft vacío.
2. Tipea en el chat: "Scramble parejas, sábado 12 jul, Los Leones, neto, 20-30 personas".
3. IA devuelve patches → config se actualiza, campos parpadean amarillo.
4. Mensaje del IA: "Falta tees y categorías".
5. User edita manualmente categorías (Damas, Varones A, Varones B).
6. User confirma tees: "per_player".
7. Click "Vista previa" → modal full-screen con leaderboard placeholder.
8. Click "Crear torneo" → validación server-side → torneo creado → redirect a `/organizador/{slug}/jugadores`.

### Flujo 2: Crear torneo desde uno anterior (Mejora A)

1. Click "Organizar campeonato".
2. Se muestra modal: "¿Empezar desde cero o duplicar uno anterior?"
3. Lista los últimos 5 torneos del organizador con thumbnails.
4. Click en "Copa Club Marzo 2026" → se crea draft con config copiada (excepto: nombre, fecha, código de inscripción, lista de jugadores).
5. User cambia nombre y fecha. Listo, click "Crear torneo".

### Flujo 3: Multi-admin colaborando

1. Owner crea draft, agrega a Pedro como collaborator (search por usuario).
2. Pedro recibe link compartido, entra al draft.
3. Mientras Owner edita "Categorías", Pedro edita "Rondas". Presence muestra ambos.
4. Si ambos editan el mismo campo: last-write-wins. El que pierde recibe toast.
5. Owner click "Crear torneo". Pedro pierde permisos (ya es torneo real, no draft).

### Flujo 4: Modo simulación del live (Mejora B)

1. Antes de click "Crear torneo", click "Vista previa".
2. Modal full-screen renderiza el live polimórfico con datos placeholder (3-4 jugadores fake con nombres tipo "Juan Demo", "María Demo").
3. Si formato es team, muestra equipos demo. Si es match_play, bracket demo.
4. User scrollea, verifica que se ve bien.
5. Cierra modal, ajusta config si es necesario.
6. Recién ahí "Crear torneo".

### Flujo 5: Conflicto de fecha (Mejora D)

1. User selecciona fecha "12/jul/2026" + cancha "Los Leones".
2. Cliente hace query: `SELECT 1 FROM tournaments WHERE organizer_id = me AND date_start = ? AND course_id = ?`.
3. Si hay match: warning rojo en la sección Fecha: `Ya tenés un torneo ese día en esta cancha: "Copa Club Mayo 2026". ¿Seguro?`.
4. User puede ignorar el warning y avanzar (no es bloqueante, solo aviso).

---

## 10. Live polimórfico (post-creación)

Una sola ruta: `/torneo/{slug}/en-vivo`. El componente raíz lee `tournament.format` y delega.

```
src/app/torneo/[slug]/en-vivo/
  page.tsx                          (server component, fetch tournament + scores)
  LiveView.tsx                      (client root, polling/realtime)
    LiveHeader.tsx                  (nombre torneo, ronda actual, status)
    LiveTabs.tsx                    (Acumulado | Ronda 1 | Ronda 2 | ...)
    formats/
      IndividualLeaderboard.tsx     (stroke play, stableford individual)
      TeamLeaderboard.tsx           (best ball, scramble, foursome)
      MatchPlayBracket.tsx          (match_play con bracket_mode='single_elimination' o 'round_robin')
      MatchPlayHeadToHead.tsx       (match_play con bracket_mode='one_vs_one')
    LiveFilterBar.tsx               (por categoría, por grupo de salida, mi grupo)
    TVMode.tsx                      (full screen para pantalla del club)
```

### Comportamiento

- Polling cada 30s o Supabase Realtime channel (lo que sea más eficiente).
- Tab "Acumulado" suma todas las rondas. Tabs "Ronda N" muestran solo esa ronda.
- Filtros: por categoría (default), por grupo de salida, "mi vista" (jugador ve su grupo).
- TV mode: oculta navbar, fonts grandes, autoswitch entre categorías cada 30s.

### Per formato

- **Individual:** tabla con `Pos | Jugador | Cat | Score Bruto | HCP Cancha | Score Neto | A Par | THRU`.
- **Equipos:** tabla con `Pos | Equipo | Jugadores | Score | A Par | THRU`. Click en equipo expande a scorecard del equipo.
- **Match play bracket:** SVG/CSS grid con eliminatorias. Cada celda muestra `Jugador 1 vs Jugador 2 (3&2)`.
- **Match play 1v1:** scorecard hoyo a hoyo con dormie / AS / MP estatus.

---

## 11. Las 4 mejoras del MVP detalladas

### A. Crear basado en torneo anterior

- Al hacer click en "Organizar campeonato", se muestra modal con dos opciones:
  - `+ Empezar desde cero`
  - Lista de los últimos 5 torneos del organizador (thumbnail, nombre, fecha, formato).
- Click en uno → POST a `/api/torneos/draft/duplicate-from/{tournamentId}` → server crea un draft nuevo copiando `config` del torneo origen, excepto:
  - `name` (vacío)
  - `date_start` (vacío)
  - `rounds[].date` (vacío)
  - `registration.code` (regenerado)
  - `cover_image_url` (mantenido — el organizador puede cambiarlo después)
- Redirect al draft nuevo.

### B. Modo simulación del live

- Botón "Vista previa" siempre disponible en footer.
- Genera 4-8 jugadores fake (nombres "Demo 1", "Demo 2"...) con scores randómicos válidos.
- Renderiza `LiveView` con esos datos (modo `is_simulation: true` que oculta partes que no aplican como "Cerrar tarjeta").
- El user navega el preview, valida visualmente.
- Al cerrar, los datos demo se descartan.

### C. Roles owner vs colaborador

- `tournament_drafts.owner_id` = el creador. Puede borrar el draft, transferir ownership.
- `tournament_draft_collaborators.role`:
  - `owner` (uno solo, simétrico con `owner_id`)
  - `collaborator` (puede editar todo excepto borrar el draft)
- En la UI: sección "Admins" del config. Owner ve botón `[+ Invitar admin]` con search de usuarios. Collaborators no ven ese botón.

### D. Auto-detección de conflicto fecha+cancha

- En `RondasSection`, cada vez que cambia `round.date` o `round.course_id`:
  - Query: `SELECT id, name, slug FROM tournaments WHERE organizer_id = me AND date_start = $date AND course_id = $courseId AND status NOT IN ('cancelled')`.
  - Si hay match: warning amarillo bajo el campo: `Ya tenés "{name}" ese día en esta cancha. ¿Seguro?`.
  - No bloqueante. Solo aviso.

---

## 12. Anti-scope-creep (lo que NO va a tener)

| Feature | Por qué no en MVP |
|---|---|
| Real-time collaborative editing tipo Figma (OT/CRDT) | Last-write-wins basta para 1-4 admins. Complejidad 10x. |
| Undo/redo histórico tipo Notion (más allá del toast 5s) | Audit log existe, retrofitear undo es barato. |
| Importar CSV/Excel de inscritos | Caso real chico al inicio. Fase 2. |
| Recordatorios automáticos a jugadores (email/push) | Útil pero no bloqueante. Fase 2. |
| PDF/imagen exportable de resultados | Nice-to-have. Fase 2. |
| Broadcast de mensajes a inscritos | Operación día del torneo. Fase 2. |
| Logo del club como watermark en portada | Premium polish. Fase 2. |
| Plantillas guardadas por club (UI) | Schema existe; UI fase 2. |
| Multi-cancha en una misma ronda | Edge case raro. Fase 2 si surge demanda. |
| Email magic link para invitar colaboradores externos | Search en usuarios registrados basta. |
| Web Push notifications | Otro proyecto. |
| Plantillas pre-cocidas globales del sistema | La IA reemplaza eso. |
| Stripe / pagos de inscripción | Otro proyecto. |
| RBAC complejo con roles arbitrarios | Owner + collaborator basta. |

---

## 13. Plan de implementación por fases

### Fase 0 — Pre-requisitos (BLOQUEANTE)

Antes de empezar a codear este flow, tienen que estar cerrados:

- [ ] Bugs P0/P1 abiertos del backlog actual (`project_db_schema_mismatches.md`).
- [ ] Auditoría de utilidad de health checks (`project_backlog_admin_health_e2e.md`).
- [ ] Visibilidad E2E desde admin.

Esto respeta la directiva CERO FALLOS: no se construyen features nuevas hasta que las existentes estén al 100%.

### Fase 1 — Modelo y backend

- [ ] Migración: tablas `tournament_drafts`, `tournament_draft_collaborators`, `tournament_draft_events`, `tournament_templates`, `tournament_prizes`.
- [ ] RLS policies para todas las tablas nuevas.
- [ ] Schema zod del `TournamentConfig`.
- [ ] Validador de reglas de golf (`golf/tournament-config-validator.ts`).
- [ ] API endpoints:
  - `POST /api/torneos/draft` (crear draft)
  - `GET /api/torneos/draft/:id`
  - `PATCH /api/torneos/draft/:id/patches` (apply patches)
  - `POST /api/torneos/draft/:id/collaborators` (invitar)
  - `DELETE /api/torneos/draft/:id/collaborators/:userId`
  - `POST /api/torneos/draft/:id/assistant` (IA)
  - `POST /api/torneos/draft/:id/create-tournament` (crea el torneo real)
  - `POST /api/torneos/draft/duplicate-from/:tournamentId` (Mejora A)
- [ ] Tests unitarios de cada endpoint.

### Fase 2 — Frontend del Editor

- [ ] Componente `TournamentDraftEditor` y subsections.
- [ ] Zustand store + autosave debounceado.
- [ ] Apply patches con highlight visual.
- [ ] Validación cliente.
- [ ] Layouts desktop + mobile.
- [ ] Tests de componentes.

### Fase 3 — Asistente IA

- [ ] System prompt versionado (`/lib/prompts/tournament-assistant-v1.ts`).
- [ ] Endpoint con Anthropic SDK (Haiku 4.5).
- [ ] Validación zod de la respuesta.
- [ ] UI del chat (`AssistantPanel`).
- [ ] Toast con "Deshacer" 5s.
- [ ] Tests de prompts (simulación con casos canónicos).

### Fase 4 — Multi-admin y presence

- [ ] Sección Admins en el editor.
- [ ] Search de usuarios + invitar.
- [ ] Supabase Realtime channel para presence.
- [ ] Last-write-wins con version + toast de conflicto.
- [ ] Tests de concurrencia.

### Fase 5 — Mejoras del MVP (A/B/C/D)

- [ ] Modal "Empezar desde cero / Duplicar" (A).
- [ ] Endpoint duplicate-from (A).
- [ ] Modo simulación del live (B): genera datos demo, render placeholder.
- [ ] Roles owner/collaborator UI (C).
- [ ] Auto-detect conflicto fecha+cancha (D).

### Fase 6 — Live polimórfico

- [ ] Componente raíz `LiveView` con tabs.
- [ ] Sub-componentes por formato.
- [ ] TV mode.
- [ ] Filtros (categoría, grupo, mi vista).
- [ ] Polling/realtime de scores.

### Fase 7 — QA y ship

- [ ] Tests E2E con Playwright para los 5 flujos.
- [ ] Tests anti-regresión canary.
- [ ] Smoke test pre-torneo (`/pre-torneo`).
- [ ] Deploy gradual con flag.
- [ ] Migración de torneos existentes (no necesaria si el flow es solo para nuevos).

---

## 14. Gating con CERO FALLOS

Esta feature **violaría** la directiva "cero features nuevas hasta que las existentes funcionen al 100%" si se implementara ahora. Está aprobada como spec, pero la **implementación queda gateada** hasta que:

1. Los 9 bugs de schema BD del backlog estén cerrados.
2. Los 2 P0 + 4 P1 priorizados en `project_db_schema_mismatches.md` estén cerrados.
3. Las canaries anti-regresión existentes pasen 100%.
4. El backlog admin/health/e2e esté cerrado.

Solo entonces se arranca la Fase 1.

---

## 15. Métricas de éxito (post-MVP)

Para saber si esto funciona bien después del lanzamiento:

- **Tiempo medio para crear un torneo** (objetivo: <2 minutos para repeated, <5 minutos para nuevos).
- **% torneos creados con asistente IA** vs manual.
- **% torneos que usan "Duplicar de anterior"** (Mejora A).
- **% torneos que disparan el conflicto fecha+cancha** (Mejora D).
- **# casos donde el organizador descubre un bug en la vista previa antes de crear** (Mejora B → CERO FALLOS efectivo).
- **# torneos creados por organizadores con multi-admin activado**.
- **Errores reales en torneos creados con IA vs manual** (deben ser idénticos o IA inferior).

---

## 16. Riesgos abiertos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| IA alucina reglas de golf | Media | Alto | Validador hardcoded + needs_confirmation explícito |
| Conflicto multi-admin pierde edits | Baja | Medio | Last-write-wins + toast + audit log permite recuperar |
| Anthropic API caída | Baja | Medio | Fallback al modo manual con disclaimer |
| Costo IA explota | Baja | Bajo | Haiku 4.5 + monitoreo + rate limit |
| Schema del config crece y deprecation duele | Media | Medio | Versionar config (`config.schema_version`) desde día 1 |
| Validation gap entre cliente y servidor | Media | Alto | Mismo zod schema en ambos lados |
| Live polimórfico explota con formato nuevo | Baja | Medio | Tests por formato + fallback a Individual si format desconocido |
