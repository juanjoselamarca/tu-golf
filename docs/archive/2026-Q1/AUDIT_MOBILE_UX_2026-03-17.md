# Auditoria Mobile UX

Fecha: 2026-03-17
Estado: diagnostico

## Hallazgos principales

### P1. La experiencia mobile-first esta bien encaminada en scoring, pero no es uniforme en toda la app

- Hay buen trabajo en tamaños tactiles, safe areas, bottom sheet y score entry.
- Otras vistas siguen apoyandose en layouts inline y tablas amplias con fallback horizontal.

Impacto:
- la experiencia cambia demasiado entre flujos
- sensacion de producto desigual

### P1. El flujo central de scoring mobile es fuerte, pero la confianza del guardado no acompaña

- feedback de guardado existe
- manejo offline parcial existe
- pero la consistencia real de datos no esta garantizada

Impacto:
- UX buena en apariencia, fragil en confianza

### P2. El home y algunas pantallas priorizan marketing/estilo por sobre claridad operativa

- hero pesado con slideshow
- widgets y efectos antes de validar tareas clave de conversion o onboarding

Impacto:
- peor performance percibida en mobile
- posible distraccion respecto a la accion principal

### P2. Algunas superficies complejas siguen siendo densas para celular

- leaderboard y scorecards usan tablas anchas y scroll horizontal.
- admin mobile existe, pero no parece pensado para operacion frecuente en campo.

Impacto:
- consumo aceptable, operacion incomoda en escenarios reales

### P2. Mensajes y estados no siempre reducen ansiedad del usuario

- errores tecnicos visibles
- promesas de inteligencia antes de confianza total del dato

Impacto:
- baja credibilidad cuando algo falla

## Fortalezas

- esfuerzo real en touch targets, safe areas y flujo de ingreso de score
- identidad visual consistente
- algunas decisiones pensadas especificamente para iPhone/mobile

## Confirmado

- buen foco mobile en scoring
- inconsistencia en otras vistas
- tablas y overlays con friccion potencial
