# Auditoria Arquitectura y Produccion

Fecha: 2026-03-17
Estado: diagnostico

## Hallazgos principales

### P0. Desalineacion estructural entre schema versionado y app actual

- La migracion base no coincide con columnas y estados usados por la app.
- `docs/SQL_PENDIENTE.md` confirma que parte del schema requerido aun depende de SQL manual.

Impacto:
- deploys no reproducibles
- onboarding de nuevos entornos fragil
- bugs imposibles de aislar con rapidez

### P0. El producto depende de SQL manual fuera del flujo normal de migraciones

- El repo documenta SQL pendiente y tablas ya ejecutadas por fuera de la migracion base.

Impacto:
- alto riesgo de drift entre entornos
- produccion no reconstruible desde cero con confianza

### P1. El dominio central de scoring no esta normalizado de forma consistente

- torneo usa `hole_scores` y `rounds`
- ronda libre guarda JSON por jugador en `ronda_libre_jugadores.scores`
- historial usa arreglos con supuestos de par fijo

Impacto:
- tres modelos de datos distintos para el mismo problema de negocio
- baja capacidad de evolucionar reglas comunes, analitica y validacion

### P1. Capa de inteligencia y analitica construida sobre datos aun inconsistentes

- GWI y tAIger dependen de historial/patrones que hoy tienen errores de segmentacion y completitud.

Impacto:
- decisiones de producto sobre señales potencialmente incorrectas
- sobrepromesa de valor

### P2. Arquitectura de acceso dispersa

- parte del control esta en middleware
- parte en server components
- parte en chequeos cliente
- parte en service role

Impacto:
- reglas de acceso dificiles de razonar y mantener

### P2. Admin dashboard parece de produccion, pero su base operativa no lo acompaña aun

- paneles amplios
- health checks y metricas
- pero sin modelo robusto de permisos, observabilidad ni datos confiables en todas las tablas

Impacto:
- falsa sensacion de readiness

## Confirmado

- drift de schema
- SQL manual pendiente
- multiples modelos de scoring
- acceso y permisos repartidos

## Requiere validacion manual

- schema exacto aplicado hoy en Supabase productivo
- pipelines reales de deploy y rollback
