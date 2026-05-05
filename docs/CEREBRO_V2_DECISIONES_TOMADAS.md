# Cerebro v2 — Decisiones tomadas (CTO call)

**Fecha:** 2026-05-05
**Tomado por:** Claude (CTO, autonomía técnica)
**Aprobado por:** Juanjo (PM)
**Aplica a:** `docs/superpowers/plans/2026-05-05-cerebro-v2.md`

Este doc cierra las 5 preguntas abiertas del agente de diseño + 2 decisiones bonus. El plan v2 fue actualizado consecuentemente. Cualquier agente de implementación debe leer ESTE doc antes de tocar código.

---

## D1 — Formato 5-puntos: solo en asignación de plan

**Decisión:** el formato rígido (Observé / Creo / Trabajamos / Hacés / Medimos) se usa **únicamente cuando el coach asigna o actualiza un plan**. Para el resto, prosa natural.

**Adición no contemplada por el agente:** se agrega un **tercer modo intermedio** llamado **"reporte de progreso"**, que se dispara automáticamente cuando entra una ronda nueva y el usuario tiene plan activo. Formato semi-estructurado de 4 líneas:

```
Plan: <regla del plan>
Esta ronda: <metric_value medido>
Progreso: <% del gap baseline→target cubierto>
Próximo: <acción concreta para la próxima ronda>
```

**Resultado:** el coach tiene 3 modos:

| Modo | Cuándo | Formato |
|---|---|---|
| Conversación libre | Default | Prosa natural, longitud variable |
| Reporte de progreso | Ronda nueva + plan activo | 4 líneas semi-estructuradas |
| Plan formal (5-puntos) | Asignación/update de plan vía `save_plan` | 5 puntos rígidos |

**Razón:** el coaching de élite alterna modos. Rigidez total mata UX premium. El reporte de progreso (que será 30-40% de los mensajes) merecía su propio molde y nadie lo había definido.

---

## D2 — Modelo único Sonnet en MVP (NO Sonnet+Haiku dual)

**Decisión:** **Sonnet 4.6 para todo en MVP.** Haiku 4.5 queda como FASE 2 cuando lleguemos a >500 usuarios activos o el costo se vuelva visible.

**Esto contradice la recomendación del agente de diseño.** Razones por las que el call correcto es Sonnet único:

1. **Optimización prematura es el #1 killer de proyectos AI.** Orquestar dos modelos en handoff antes de tener tráfico real agrega días de debug sin retorno.

2. **Volumen actual no justifica el costo de complejidad.** Con <100 usuarios activos, el ahorro de Haiku es ~$5/mes. Costos de un bug raro por mala extracción: incalculable contra la directiva CERO FALLOS.

3. **Confiabilidad > costo en MVP.** Un sistema con un solo modelo tiene la mitad de superficie de falla. Cache predecible, debug simple, monitoring claro.

4. **Migración es trivial cuando llegue el momento.** Pasar `save_plan` a Haiku es cambiar el modelo en 1 línea. La dirección correcta de migración en sistemas críticos es: simple → optimizado, NUNCA al revés.

5. **El extractor con tool calling forzado + schema cerrado** ya da la confiabilidad del extractor regex viejo. No necesitamos "el más barato" todavía; necesitamos "el más confiable".

**Trigger explícito para revisar la decisión en el futuro:** cuando se cumpla CUALQUIERA de estas dos condiciones:
- Usuarios activos mensuales > 500
- Costo mensual de Anthropic > $200 USD

Cuando uno de los dos se cumpla, abrir issue para migrar `save_plan` a Haiku 4.5.

---

## D3 — Borrar el extractor regex en el MISMO PR + shadow mode 1 semana

**Decisión:** el extractor regex (`chat/route.ts:190-326`) se **borra** en el mismo PR que introduce la tool `save_plan`. **PERO** se mantiene una versión *desconectada de la base de datos* en modo **shadow** durante 1 semana para validación.

**Cómo funciona el shadow mode:**

1. La tool `save_plan` es la ÚNICA que escribe en `coach_plans`.
2. El regex viejo se queda en una función `extractRecommendationsShadow()` que se invoca en paralelo pero **solo registra a `coach_events('extractor_shadow', { regex_extracted: ..., tool_extracted: ... })`** sin tocar tablas.
3. Cada noche, un job compara: ¿coincide lo que el regex hubiera extraído con lo que extrajo la tool? Reporta divergencias.
4. **Criterio de cierre:** después de 7 días, si menos del 5% de mensajes con asignación de plan tienen divergencia significativa → borramos `extractRecommendationsShadow()`. Si más del 5% → investigamos antes de borrar.

**Por qué NO mantener los dos sistemas escribiendo en paralelo (lo que el agente preguntó):**
- Dos sistemas escribiendo a tablas distintas (`taiger_recommendations` vs `coach_plans`) crea inconsistencia ingobernable.
- Auditoría pierde fuente de verdad.
- Rollback real es `git revert`, no "convivencia".

**Shadow mode es DIFERENTE de dual write:** shadow logea sin escribir; dual write contamina la BD.

---

## D4 — Admin Brain funcional > bonito, criterio "navegable en 30 segundos"

**Decisión:** funcional, con la métrica explícita: **si Juanjo (PM no técnico) necesita más de 30 segundos para entender el estado de un usuario, el Admin Brain falló.**

**Implicancia operacional:**
- Tablas con sorting básico, sin librerías de datatable pesadas.
- Re-usar tokens existentes (`var(--bg-surface)`, `var(--text)`, etc.). Cero CSS nuevo.
- Timeline cronológico de `coach_events` con expand para payload.
- Plan activo arriba de todo: regla, métrica, target, último outcome, gráfico simple SVG.
- Gráfico simple = 1 línea de progreso baseline→target con puntos por outcome. NADA de Chart.js, Recharts, etc.

El polish visual viene en FASE 3 con feedback real de uso.

---

## D5 — Playground sandbox + toggle "enviar al usuario"

**Decisión:** el playground (`/admin/sistema/taiger/playground`) **NO persiste** al usuario real por default — sandbox total. **Pero** se agrega un toggle explícito **"enviar al usuario"** que sí persiste el mensaje en la sesión real, marcado con `metadata.sent_by_admin: true` para trazabilidad.

**Razón del matiz:** hay casos legítimos donde Juanjo prueba un consejo, ve que sale bien y quiere que el usuario lo reciba. Sin el toggle, hay que escribirlo dos veces (una en sandbox, otra fuera). Con el toggle, marca "enviar" y queda registrado.

**Auditabilidad:** todos los mensajes con `sent_by_admin: true` se listan aparte en el Admin Brain del usuario, para que se vea qué llegó por humano vs IA.

---

## D6 (BONUS) — Validador de alucinación: shadow deployment 7 días

**Decisión:** el validador post-respuesta arranca en modo **shadow / log-only** durante 7 días.

**Pipeline:**

1. **Día 1-7:** validador analiza cada respuesta del coach. Si detecta alucinación, escribe a `coach_events('hallucination_warning', {...})` pero NO degrada la respuesta enviada al usuario.
2. **Revisión diaria:** Juanjo (o yo) revisa el log de warnings, marca cada uno como **falso positivo** o **alucinación real**.
3. **Criterio de promoción:** si al cabo de 7 días, los falsos positivos son **< 5%** del total de warnings, se activa el modo enforcement (degrada la respuesta antes de mandarla).
4. **Si > 5%:** el detector es muy agresivo. Refinar las reglas (probablemente el regex de scores/canchas es demasiado amplio) y reiniciar el contador de 7 días.

Este es el patrón estándar de motores predictivos en producción: **deploy → mide precisión → activa cuando es confiable.**

---

## D7 (BONUS) — `compute_plan_outcome` con gate de performance

**Riesgo descubierto al revisar el plan:** el cómputo de `plan_outcomes` se dispara *inline* cuando el usuario guarda una ronda. Si ese cómputo demora más de ~200ms, el botón "guardar tarjeta" se siente lento — muerte para UX en cancha (usuario con guante, entre hoyos, con apuro).

**Decisión:** antes de poner el trigger inline en producción, correr load test del cómputo. Criterio:

- **Si p95 < 100ms:** trigger inline en MVP, simple, una sola transacción.
- **Si p95 ≥ 100ms:** desde el día 1, va a cola async (job en Supabase queue + recálculo dentro de los siguientes 5 segundos, con notificación push opcional al usuario "Tu coach actualizó tu plan").

**Por qué esta decisión upfront y no migración futura:**
- Migrar a queue después de tener usuarios quejándose es más costoso que diseñarlo bien desde el inicio.
- El test de carga es 1 hora de trabajo. La migración futura es 2-3 días + downtime.

---

## Compendio operativo

| ID | Tema | Decisión |
|---|---|---|
| D1 | Formato del coach | 3 modos: libre / reporte progreso / 5-puntos. 5-puntos solo al asignar plan |
| D2 | Modelo de IA | Sonnet único en MVP. Migrar a Sonnet+Haiku al pasar 500 usuarios o $200/mes |
| D3 | Extractor regex viejo | Borrar en mismo PR. Shadow mode 1 semana para validar |
| D4 | Admin Brain UI | Funcional > bonito. Métrica: navegable en 30s |
| D5 | Playground | Sandbox por default + toggle "enviar al usuario" |
| D6 | Validador alucinación | Shadow 7 días, promover a enforcement con <5% FP |
| D7 | compute_plan_outcome | Load test ANTES. Si p95 ≥ 100ms → cola async desde día 1 |

---

## Para el próximo agente de implementación

1. Leer este doc COMPLETO antes de tocar código.
2. Las 7 decisiones son **invariantes**. Si encontrás una razón fuerte para cambiar alguna, escribís un follow-up doc y esperás aprobación; no decidís solo.
3. Cuando arranques FASE 0 del plan v2, abrir branch `feat/cerebro-v2`. Cada FASE termina con commit aislado + demo a Juanjo + green light explícito.
4. El plan v2 (`docs/superpowers/plans/2026-05-05-cerebro-v2.md`) tiene los detalles técnicos de cada FASE. ESTE doc tiene las decisiones de producto/arquitectura.
