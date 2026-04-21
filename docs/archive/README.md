# docs/archive/

Auditorías, postmortems y docs históricos que **ya no reflejan estado actual** pero se conservan como referencia.

## Estructura

Un subdirectorio por trimestre:

```
docs/archive/
  2026-Q1/   # enero–marzo 2026
  2026-Q2/   # abril–junio 2026
  ...
```

## Criterio para archivar

Un doc se mueve a `archive/` cuando se cumple **cualquiera** de estas condiciones:

1. **Está fechado en el nombre** (`*_2026-03-17.md`) y esa fecha tiene más de 30 días.
2. Es un **one-off** (auditoría, informe, consultoría) cuyo resultado ya fue internalizado en código o en docs vivos.
3. Es un **plan o calendario** de un periodo que ya terminó.

## Qué NO archivar

Mantener en `docs/` raíz los documentos **vivos** y **operacionales**:

- `ESTADO_ACTUAL.md`, `ARQUITECTURA.md`, `ROADMAP_COMPLETO.md`, `SPRINT_LOG.md` — estado vivo
- `TAIGER_SYSTEM_PROMPT.md`, `GWI_MODELO.md` — referencias técnicas activas
- `POSTMORTEM_*.md` — aprendizajes permanentes (siempre útiles para el próximo incidente)
- `SQL_PENDIENTE*.md`, `RLS_FIXES_*.sql` — acciones pendientes
- `PROMPT_SETUP_NUEVO_COMPUTADOR.md` — guía operativa reutilizable

## Cómo archivar

Siempre con `git mv` para preservar historial:

```bash
mkdir -p docs/archive/2026-QN
git mv docs/NOMBRE_DOC.md docs/archive/2026-QN/
```
