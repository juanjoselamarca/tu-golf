# Auditoria Testing y Observabilidad

Fecha: 2026-03-17
Estado: diagnostico

## Hallazgos principales

### P0. No existe baseline automatizado confiable

- `package.json` no muestra scripts de test ni typecheck dedicados.
- `npm run lint` abre el asistente interactivo de Next en vez de ejecutar una validacion CI-safe.

Impacto:
- regresiones silenciosas
- baja confianza para merges frecuentes

### P1. Observabilidad real ausente

- logger basado en `console`.
- no se ve integracion activa con herramientas de errores/tracing.
- admin health muestra estado conceptual, no evidencia de incidentes reales.

Impacto:
- diagnostico lento
- incidentes invisibles

### P1. Flujos criticos sin pruebas aparentes

- auth callback
- scoring torneo
- scoring ronda libre
- creacion de torneo/ronda
- calculos GWI/tAIger

Impacto:
- cualquier cambio puede afectar negocio sin alerta previa

### P2. Manejo de errores inconsistente

- algunas vistas traducen errores
- otras usan `alert`
- otras muestran mensajes internos de configuracion
- varias rutas API devuelven errores genericos

Impacto:
- experiencia irregular
- soporte dificil

### P2. Sin metricas claras de producto de extremo a extremo

- existe tracking de eventos, pero no se ve definicion formal de embudo, activacion o calidad de dato.

Impacto:
- decisiones de producto apoyadas en instrumentacion parcial

## Confirmado

- baseline automatizado insuficiente
- lint no operativo
- observabilidad limitada a console

## Requiere validacion manual

- existencia de monitoreo en Vercel/Supabase fuera del repo
- alarmas o dashboards externos
