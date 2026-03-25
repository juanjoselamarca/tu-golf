# Import v2 — Fixes tecnicos + UX rediseñado

## Spec v1.0 — 2026-03-24

### Parte 1: Fixes tecnicos
1. Crear /api/import/status endpoint
2. Deteccion de duplicados antes de confirmar
3. Limites de archivo (CSV 10MB, imagenes 5MB c/u)
4. Fotos procesadas 5 en paralelo

### Parte 2: UX rediseñado
- 3 opciones (foto, CSV, manual) — Garmin removido
- Guia visual animada por fuente
- Review con cards en vez de tabla
- Duplicados con warning visual
- Celebracion mejorada

### Archivos a crear/modificar
- CREATE: src/app/api/import/status/route.ts
- MODIFY: src/app/api/import/csv/route.ts (limites)
- MODIFY: src/app/api/import/screenshot/route.ts (paralelo + limites)
- MODIFY: src/app/api/import/confirm/route.ts (duplicados)
- MODIFY: src/components/import/ImportWizard.tsx (flujo simplificado)
- CREATE: src/components/import/ImportGuide.tsx (guia animada)
- MODIFY: src/components/import/StepSelector.tsx (3 opciones con animaciones)
- MODIFY: src/components/import/StepReview.tsx (cards + duplicados)
- MODIFY: src/components/import/StepProcessing.tsx (fix polling)
- REMOVE: referencia a Garmin/FIT en UI
