# Cerebro v2 — Resumen de decisiones [✅ APROBADO 2026-05-05]

> **Estado:** las 5 preguntas de este doc fueron resueltas el 2026-05-05. Detalle de las 7 decisiones finales (5 originales + 2 bonus) en `docs/CEREBRO_V2_DECISIONES_TOMADAS.md`. Plan v2 (`docs/superpowers/plans/2026-05-05-cerebro-v2.md`) actualizado con sección §0.5 referenciando esas decisiones. Listo para arrancar FASE 0 cuando Juanjo lo gatille.

**Para:** Juanjo (PM)
**De:** Agente 3 (diseño y documentación)
**Fecha:** 2026-05-05
**Plan completo:** `docs/superpowers/plans/2026-05-05-cerebro-v2.md`

---

## Qué cambió respecto del prompt original

1. **"Solo 3 patrones" → mantenemos los 7 actuales.** Borrar 4 ya implementados era regresión. Además implementamos los 2 huérfanos (`pressure_deterioration`, `driving_inconsistency`) que solo viven en el system prompt, llegando a 9.

2. **"Formato 5-puntos siempre" → solo cuando se asigna un plan.** Conversación libre para el resto. El formato rígido convertía cada respuesta en formulario y rompía la sesión continua.

3. **"Memory básica" → 3 tablas nuevas + las existentes.** Sustituí por `coach_plans`, `plan_outcomes` y `coach_events`. Schema completo en `docs/CEREBRO_DATA_MODEL.md`.

4. **"Anti-alucinación" sin mecanismo → tool calling forzado + validador.** Tool `save_plan` con schema cerrado (no puede inventar métricas), validador que detecta scores no respaldados por datos, y set de 20 mensajes-trampa en CI.

5. **"Aprende con el tiempo" sin definirlo → 3 mecanismos determinísticos.** Sin ML: (a) recálculo de confianza, (b) cumplimiento del plan, (c) mejora antes/después.

6. **Admin Panel "FASE 2" → Admin Brain en paralelo con FASE 1.** Necesitás verlo pensar mientras se construye.

7. **Modelo único → Sonnet (chat) + Haiku 4.5 (extractor `save_plan`).** Ahorro ~10x en lo estructurado. Si la integración multi-modelo se complica, fallback documentado.

---

## Decisiones clave (con porqué en una línea)

1. **Decision Engine determinístico.** `score = peso_severidad × confianza`. El LLM no elige patrón, eso es numérico — su rol es hablar.
2. **Plan activo es UNO solo (constraint en DB).** Partial unique index. Evita duplicados.
3. **`compute_plan_outcome` inline al insertar ronda.** No `pg_cron` todavía. Migrar si genera lag.
4. **`taiger_recommendations` queda vacía sin drop.** Limpiar después; drop ahora suma complejidad sin valor.
5. **Voice adaptation va a FASE 2.** Sin tráfico real no se valida el switch.
6. **Set de regresión de 20 mensajes corre en CI.** Sin gate automático, las alucinaciones vuelven.
7. **`pattern_version` en schema pero no se usa en MVP.** Documenta invalidación futura sin pagar el costo hoy.

---

## Qué necesito que apruebes antes de arrancar

1. **¿Formato 5-puntos solo cuando se asigna plan, OK?** O preferís que se mantenga rígido siempre.
2. **¿Sonnet (chat) + Haiku 4.5 (extractor `save_plan`), OK?** O dejamos Sonnet en todo por simplicidad inicial.
3. **¿Borramos el extractor regex en el mismo PR que crea las tablas?** Es la única forma de no tener dos sistemas en paralelo creando duplicados. Confirmá.
4. **¿Admin Brain MVP funcional > bonito?** Me concentro en que muestre la información correcta sin diseño elaborado todavía.
5. **¿`/admin/sistema/taiger/playground` con sandbox que NO persiste al usuario real, OK?** Te deja probar prompts sin contaminar la sesión continua del jugador.

---

## Riesgos más altos

1. **Regresión sobre el reset.** Si el agente de implementación toca por error `taiger_sessions.is_primary` o el streaming, perdemos 1-2 días. *Mitigación:* sección 0 del plan v2 lo lista invariantes con tabla explícita.
2. **`compute_plan_outcome` lento al insertar ronda.** Si el cálculo agrega latencia visible al guardar tarjeta, mala UX. *Mitigación:* trigger inline solo si <50ms en p95; si supera, queue async.
3. **El validador de alucinación tiene falsos positivos.** Marca como "alucinación" cosas válidas. *Mitigación:* primero modo log-only por 1 semana; degradar respuesta solo cuando confiemos.

---

## Tiempo estimado de implementación

- **Versión limpia (recomendada):** 4-5 días de desarrollo, sin regresión, motor coherente con todo lo shippeado, Admin Brain operativo, costos predecibles.
- **Versión con riesgos (no recomendada):** 2-3 días + 1-2 días limpiando regresiones del reset = 3-5 días con ruido alto.

**Recomendación:** ir por los 4-5 días limpios. Cada FASE termina con demo y green light explícito tuyo.
