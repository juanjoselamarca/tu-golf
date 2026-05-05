# tAIger+ Cerebro — Modelo de datos

**Estado:** Spec propuesto · Pendiente de reconciliar con el plan final del Cerebro v2 (Agente 2).
**Autor:** Sesión paralela 2026-05-05 (Claude — paralelo a agentes Reset y Cerebro Prompt).
**Punto de partida:** Reset tAIger ya mergeado (commits `c9f9975`, `badb5b5`, `4719cf0`).

---

## 1. Qué deja el Reset (NO tocar)

| Componente | Estado | Archivo / tabla |
|---|---|---|
| Sesión continua por usuario | ✅ activa | `taiger_sessions.is_primary` |
| Streaming real con cache | ✅ activa | `messages.stream()` + `cache_control: ephemeral` |
| Contexto del 100% de rondas | ✅ activa | `src/golf/coach/context.ts` |
| Detección de patrones sin `.limit(50)` | ✅ activa | `src/golf/coach/detect-and-save-patterns.ts` |
| Tools | `get_latest_round`, `get_round_by_id`, `get_recent_rounds`, `get_course_details`, `get_round_by_date`, `get_all_rounds_summary` | `src/golf/coach/tools.ts` |
| Markdown en assistant | ✅ activa | `src/app/coach/sesion/[id]/page.tsx` |
| Gate de 1 ronda | ✅ activa | `src/app/coach/page.tsx` |

**Regla:** el Cerebro construye **encima**, no en lugar de.

---

## 2. Tablas nuevas — `coach_plans`, `plan_outcomes`, `coach_events`

### 2.1 `coach_plans` — plan activo asignado por el coach

Un plan = "el coach detectó un patrón, eligió uno por prioridad, y asignó una regla con métrica y target".

```sql
CREATE TABLE coach_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  pattern_id      TEXT NOT NULL,            -- 'back_nine_collapse', 'first_hole_anxiety', etc.
  pattern_version INTEGER NOT NULL DEFAULT 1, -- invalidación si cambia la regla del patrón

  -- Hipótesis y regla (texto libre, generado por LLM via tool save_plan)
  hypothesis      TEXT NOT NULL,            -- "El back nine cae porque te quedas sin hidratación"
  rule            TEXT NOT NULL,            -- "Tomar agua + snack en hoyo 10. Reset 4-pasos antes del back nine."

  -- Métrica machine-readable (lo que se mide automáticamente)
  metric          TEXT NOT NULL,            -- 'back9_minus_front9_strokes', 'avg_first_hole_score', etc.
  target_value    NUMERIC NOT NULL,         -- valor objetivo (ej. 0 strokes diff, 4.5 avg)
  target_op       TEXT NOT NULL DEFAULT 'lte' CHECK (target_op IN ('lte','gte','eq')),
  baseline_value  NUMERIC,                  -- valor en el momento de asignar (snapshot)
  duration_days   INTEGER NOT NULL DEFAULT 21,

  -- Lifecycle
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'resolved', 'expired', 'superseded', 'cancelled')),
  resolution_reason TEXT,                   -- 'target_reached', 'pattern_resolved', 'duration_exceeded', 'user_replaced'

  -- Auditoría
  observation_data JSONB NOT NULL,          -- {patterns_used: [...], data_points: 18, metric_value: 3.4}
  assigned_by     TEXT NOT NULL DEFAULT 'tAIger', -- 'tAIger' o 'admin' (Juanjo override)
  session_id      UUID REFERENCES taiger_sessions(id) ON DELETE SET NULL,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,

  -- Solo un plan activo por usuario al mismo tiempo
  CONSTRAINT coach_plans_unique_active UNIQUE (user_id, status) DEFERRABLE INITIALLY DEFERRED
);

-- El UNIQUE por (user_id, status) bloqueado con DEFERRABLE permite que el
-- "supersede" deje el viejo en 'superseded' antes de meter el nuevo en 'active'
-- en la misma TX. Para forzar UNA active a la vez, usar un partial index:
CREATE UNIQUE INDEX coach_plans_one_active_per_user
  ON coach_plans (user_id) WHERE status = 'active';

CREATE INDEX idx_coach_plans_user ON coach_plans(user_id);
CREATE INDEX idx_coach_plans_status ON coach_plans(status);
CREATE INDEX idx_coach_plans_pattern ON coach_plans(pattern_id);

ALTER TABLE coach_plans ENABLE ROW LEVEL SECURITY;

-- RLS: el usuario ve su plan, admin ve todos
CREATE POLICY coach_plans_select_own ON coach_plans
  FOR SELECT USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));
CREATE POLICY coach_plans_insert_own ON coach_plans
  FOR INSERT WITH CHECK (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));
CREATE POLICY coach_plans_update_own ON coach_plans
  FOR UPDATE USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));
```

**Lifecycle:**
```
active → resolved (target_reached / pattern_resolved)
active → expired (duration_days excedidos sin alcanzar target)
active → superseded (LLM detecta otro patrón con prioridad mayor)
active → cancelled (usuario o admin lo desactiva)
```

### 2.2 `plan_outcomes` — medición por ronda nueva

Cada vez que entra una ronda al sistema, el motor calcula la métrica del plan activo (si hay) y registra el resultado.

```sql
CREATE TABLE plan_outcomes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id         UUID NOT NULL REFERENCES coach_plans(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Origen de la ronda (uno de los dos NOT NULL)
  historical_round_id UUID REFERENCES historical_rounds(id) ON DELETE SET NULL,
  ronda_libre_id      UUID REFERENCES rondas_libres(id) ON DELETE SET NULL,
  played_at        TIMESTAMPTZ NOT NULL,

  -- Medición
  metric_value     NUMERIC NOT NULL,         -- valor calculado de la métrica del plan
  delta_vs_baseline NUMERIC,                 -- metric_value - baseline_value (signed)
  target_reached   BOOLEAN NOT NULL,         -- según target_op del plan

  -- Adherence (qué tan bien cumplió la regla — heurística)
  -- 'full' = la métrica mejoró >= 50% del gap baseline→target
  -- 'partial' = mejoró pero <50%
  -- 'none' = no mejoró o empeoró
  compliance       TEXT NOT NULL CHECK (compliance IN ('full', 'partial', 'none', 'unknown')),

  metadata         JSONB,                    -- detalles específicos del cálculo
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT plan_outcomes_one_round_source CHECK (
    (historical_round_id IS NOT NULL) OR (ronda_libre_id IS NOT NULL)
  )
);

CREATE INDEX idx_plan_outcomes_plan ON plan_outcomes(plan_id);
CREATE INDEX idx_plan_outcomes_user ON plan_outcomes(user_id);
CREATE INDEX idx_plan_outcomes_played ON plan_outcomes(played_at DESC);

ALTER TABLE plan_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY plan_outcomes_select_own ON plan_outcomes
  FOR SELECT USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));
-- Insert: solo backend con service_role
```

**Trigger:** cuando entra una ronda nueva (insert en `historical_rounds` o `rondas_libres.estado='finalizada'`), un job o trigger SQL llama a `compute_plan_outcome(plan_id, round_id)` que:
1. Carga la métrica del plan
2. Computa el valor sobre la ronda
3. Calcula delta vs baseline
4. Persiste fila en `plan_outcomes`
5. Si `metric_value` cumple `target_op target_value` para N rondas consecutivas → marca plan `resolved`

### 2.3 `coach_events` — event sourcing para Admin Brain

Log inmutable de TODO lo que el coach hace. Alimenta el panel `/admin/sistema/taiger/[userId]` y permite reconstruir el estado del cerebro en cualquier punto.

```sql
CREATE TABLE coach_events (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN (
    'round_processed',      -- entró ronda, se recalcularon patrones
    'pattern_detected',     -- nuevo patrón con confidence > umbral
    'pattern_resolved',     -- patrón cayó bajo umbral N veces
    'plan_assigned',        -- LLM asignó plan via save_plan
    'plan_outcome',         -- ronda nueva midió el plan
    'plan_resolved',        -- target alcanzado o duration excedida
    'plan_superseded',      -- otro plan reemplazó al activo
    'session_message',      -- usuario o coach intercambiaron mensajes (sample)
    'tool_called',          -- LLM llamó a tool (sample)
    'context_built',        -- buildPlayerContext corrió (sample para profiling)
    'admin_override'        -- Juanjo intervino manualmente
  )),
  payload     JSONB NOT NULL,         -- esquema varía por type
  related_plan_id    UUID REFERENCES coach_plans(id) ON DELETE SET NULL,
  related_session_id UUID REFERENCES taiger_sessions(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice por user para el admin viewer
CREATE INDEX idx_coach_events_user_created ON coach_events(user_id, created_at DESC);
-- Índice por type para queries agregadas (KPIs)
CREATE INDEX idx_coach_events_type ON coach_events(type, created_at DESC);

ALTER TABLE coach_events ENABLE ROW LEVEL SECURITY;
-- Solo admin lee eventos de otros usuarios
CREATE POLICY coach_events_select_admin ON coach_events
  FOR SELECT USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));
```

**Schemas de payload por type:**

| type | payload |
|---|---|
| `round_processed` | `{round_id, source: 'historical'\|'libre', total_rounds: int, patterns_recomputed: int}` |
| `pattern_detected` | `{pattern_id, confidence, data_points, metadata}` |
| `pattern_resolved` | `{pattern_id, last_confidence, consecutive_low: int}` |
| `plan_assigned` | `{plan_id, pattern_id, hypothesis, rule, metric, target_value, baseline_value}` |
| `plan_outcome` | `{plan_id, outcome_id, metric_value, delta, compliance, target_reached}` |
| `plan_resolved` | `{plan_id, resolution_reason, total_outcomes: int, full_compliance: int}` |
| `plan_superseded` | `{old_plan_id, new_plan_id, reason}` |
| `session_message` | `{session_id, role, content_preview, tokens, cached: bool}` |
| `tool_called` | `{session_id, tool_name, input, ms, error: bool}` |
| `context_built` | `{session_id, total_rounds_used, patterns_count, tokens_in_context}` |
| `admin_override` | `{action: 'cancel_plan'\|'force_pattern'\|'edit_session', target_id, reason}` |

---

## 3. Tool nueva — `save_plan` (mata el extractor regex)

El extractor regex actual de `chat/route.ts` (~líneas 300-400) es deuda flagged. La sustituye:

```ts
{
  name: 'save_plan',
  description: 'Asigna un plan estructurado al jugador. ÚNICA forma de comprometer un plan — no escribir el plan en prosa sin llamar esta tool.',
  input_schema: {
    type: 'object',
    properties: {
      pattern_id: { type: 'string', enum: ['back_nine_collapse','front_nine_struggles','first_hole_anxiety','par_3_weakness','short_game_weakness','post_bogey_spiral','three_putt_frequency','pressure_deterioration','driving_inconsistency'] },
      observation_data: {
        type: 'object',
        properties: {
          data_points: { type: 'integer', minimum: 1 },
          metric_value: { type: 'number' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: ['data_points', 'metric_value', 'confidence'],
      },
      hypothesis: { type: 'string', minLength: 20, maxLength: 500 },
      plan: {
        type: 'object',
        properties: {
          rule: { type: 'string', minLength: 10, maxLength: 800 },
          metric: { type: 'string', enum: ['back9_minus_front9_strokes','avg_first_hole_score','par3_avg_vs_par','three_putts_per_round','post_bogey_score_avg','double_or_worse_pct'] },
          target_value: { type: 'number' },
          target_op: { type: 'string', enum: ['lte','gte','eq'] },
          duration_days: { type: 'integer', minimum: 7, maximum: 90 },
        },
        required: ['rule', 'metric', 'target_value', 'target_op', 'duration_days'],
      },
    },
    required: ['pattern_id', 'observation_data', 'hypothesis', 'plan'],
  },
},
```

Handler en `executeTool` inserta en `coach_plans` (con `status='active'`, marcando `superseded` cualquier otro activo del mismo usuario en TX) y emite evento `plan_assigned`.

---

## 4. Decision Engine — qué patrón gana

Cuando el motor detecta múltiples patrones activos, elige UNO con esta prioridad:

```ts
score = severity_weight(pattern) * confidence
severity_weight = { critical: 3, warning: 2, info: 1 }
desempate 1: data_points (más > menos)
desempate 2: created_at del pattern row (más antiguo > más nuevo)
```

Mientras un plan tiene `status='active'`:
- El Decision Engine NO cambia de patrón **salvo** que la confidence del patrón actual caiga <0.4 O el plan exceda `duration_days`.
- Si entra ronda nueva y otro patrón gana mucho score (>2x del actual), emitir `plan_superseded`.

---

## 5. Backfill — eventos retroactivos al activar el cerebro

Cuando se aplican estas tablas en prod, ejecutar `scripts/backfill-coach-events.mjs`:

```
Para cada usuario con >0 historical_rounds:
  Para cada ronda (orden ASC por played_at):
    INSERT coach_events (type='round_processed', payload={round_id, total_rounds_so_far})
  Si tiene player_patterns activos:
    INSERT coach_events (type='pattern_detected', payload={pattern_id, confidence, data_points})
```

Sin esto, el Admin Brain arranca vacío al primer mes.

---

## 6. KPIs para validar que el cerebro funciona

| KPI | Target inicial | Cómo se mide |
|---|---|---|
| % usuarios con plan activo | >50% de usuarios con ≥5 rondas | `coach_plans WHERE status='active'` |
| Adherence promedio | >40% de outcomes en `compliance='full'` | `plan_outcomes` agregado |
| Plan resuelve por target | >30% de planes cierran con `resolution_reason='target_reached'` | `coach_plans WHERE status='resolved'` |
| Cache hit ratio | >80% en sesiones con >3 mensajes | telemetry de `messages.stream()` |
| Costo por usuario activo/mes | <$1 USD | suma `usage.input_tokens + output` * pricing |

---

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| LLM asigna plan duplicado al activo | UNIQUE partial index `(user_id) WHERE status='active'` rompe el insert |
| Extractor regex sigue corriendo en paralelo al `save_plan` y crea duplicados | Eliminar el extractor regex en el mismo PR que crea las tablas |
| Métricas mal definidas hacen target imposible | Schema fija enum `metric` — si LLM inventa otra, tool falla y reporta |
| Backfill explota memoria con 10k+ usuarios | Procesar en batches de 100 con `LIMIT/OFFSET` |
| RLS bug deja un user ver eventos de otro | Tests de RLS antes de mergear (vitest con cliente impersonado) |
| Confidence "de un día para otro" porque cambia la fórmula | `pattern_version` en `coach_plans` — invalidar planes con versión vieja |

---

## 8. Orden de aplicación recomendado (cuando se ejecute)

1. Migration `034_cerebro_foundation.sql` (las 3 tablas + RLS + índices)
2. Insertar tools `save_plan` en `src/golf/coach/tools.ts`
3. Implementar handler `executeTool` para `save_plan`
4. **Eliminar** extractor regex en `chat/route.ts` (`extractRecommendation*`)
5. Implementar `compute_plan_outcome` en `src/golf/coach/plan-engine.ts`
6. Cron job o trigger para llamar `compute_plan_outcome` al insert de `historical_rounds`
7. Endpoint `/api/admin/taiger/brain/[userId]` lee `coach_events` y arma timeline
8. UI `/admin/sistema/taiger/[userId]` consume el endpoint
9. `scripts/backfill-coach-events.mjs` ejecutado una vez

---

## 9. Lo que este spec NO decide (out of scope explícito)

- Voz/personalidad del coach (simple vs analítico) — vive en system prompt y `profiles.coach_voice` (decisión de Cerebro v2)
- Cuotas / paywall — siempre out of scope hasta validación interna
- UI del Admin Brain — diseño visual va en otro doc
- Migración a `pg_cron` para `compute_plan_outcome` — empezar con trigger SQL simple

---

## 10. Reconciliación con Cerebro v2 (Agente 2)

Cuando el Agente 2 cierre `2026-05-05-cerebro-prompt-review.md` y proponga el plan v2, comparar:
- Schemas: ¿coinciden los campos clave (`metric`, `target_op`, `compliance`)? Si difieren, ajustar este doc o el plan.
- Patrón en uso: este doc asume 7 patrones implementados + 2 huérfanos en prompt (`pressure_deterioration`, `driving_inconsistency`). El v2 debe decidir si los implementa o los borra del prompt.
- Tool `save_plan`: este spec define schema. El v2 puede pedir más campos — agregarlos aquí.

**Esperar plan v2 antes de aplicar la migration.**
