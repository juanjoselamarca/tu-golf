# REGLA OPERATIVA — "Un concepto, una fuente" (vigente desde 22-jun-2026)

> Detalle movido desde `CLAUDE.md` el 02-oct-2026 (texto original, sin cambios). CLAUDE.md conserva la regla resumida y apunta acá.
>
> **02-oct-2026 (modelos v2):** la revisión pre-merge es `revisor-fable` con expediente (`node scripts/expediente-review.mjs`, ver `docs/claude/modelos.md` → Reglas 1-4). Donde este texto dice `superpowers:code-reviewer` o `model: "fable"`, léase eso.

**Contexto:** la regla "el que toca, ordena" mide *tamaño y plomería* (LOC, supabase directo, `console.*`). Achica archivos, pero NO captura el desorden *lógico*: el mismo concepto contestado de N formas distintas y esparcido por la app. El 22-jun-2026, al revisar las pantallas de resultados de ronda libre, se encontró la lista `['best_ball','scramble','foursome']` (el concepto "¿es formato por equipos?") **hardcodeada en ~13 archivos**, y el predicado "¿hay puntajes para mostrar?" escrito de **3 formas inconsistentes** en una sola pantalla (una miraba `leaderboard[0]`, otra `leaderboard.some(...)`). Eso es deuda de claridad con borde filoso: si alguien arregla una copia y no las otras, una modalidad rompe en torneo. CERO FALLOS lo prohíbe.

### La regla, sin ambigüedad

**Cada concepto de dominio vive en EXACTAMENTE UN lugar con nombre. Nada de copias paralelas ni re-derivaciones inline.** Un "concepto" es: una lista (los formatos por equipo), un predicado (¿hay datos?, ¿es equipo?), un umbral (minN=15), un mapeo, o una decisión de orden/layout.

Antes de escribir código que necesita un concepto: **grep primero**. Si ya existe una fuente canónica, se importa. Si no existe, se crea la canónica (concepto de golf → `src/golf/`; infraestructura → `src/lib/`) y se usa. Nunca se hace una segunda copia.

### Smells que se RECHAZAN (en review y al escribir)

1. **La misma pregunta contestada de 2+ formas.** Ej: `formato === 'best_ball' || ...` inline en un archivo y `TEAM_FORMAT_KEYS.includes(...)` en otro. Hay que elegir la canónica y migrar.
2. **El mismo predicado duplicado con variaciones sutiles.** Ej: tres definiciones de "hay puntajes". Se unifica en un solo valor/función con nombre (`hasPlayData`) usado en todos lados.
3. **Un array/número/string hardcodeado que ya existe como export canónico.** Ej: `['best_ball','scramble','foursome']` cuando existe `TEAM_FORMAT_KEYS` en `src/golf/formats`.
4. **Lógica de decisión/orden esparcida inline** en vez de declarada en un solo lugar (una tabla, un descriptor, un selector con nombre).

### Cómo se hace cumplir (portero, no papel)

- **El `superpowers:code-reviewer` (ya obligatorio para PRs >100 LOC) suma esto a su checklist:** debe marcar duplicación de concepto / predicado inconsistente / hardcode que ya existe canónico. Si lo encuentra → no se mergea hasta unificar.
- **Extensión de "el que toca, ordena":** si tocás un archivo que re-deriva un concepto inline, lo reemplazás por la fuente canónica como parte de tu cambio (mismo espíritu: el que toca, unifica).
- **Las migraciones grandes se rastrean, no se hacen a la fuerza en cualquier PR.** Si un concepto está duplicado en write-paths críticos (rutas de creación de torneo), se documenta en `docs/REORDENAMIENTO_TRACKING.md` y se migra cuando se toca ese flujo — nunca se ensancha el blast radius de un PR de display hacia el motor de creación.

### Fuentes canónicas ya establecidas (importar, no recrear)

- **Formatos por equipo:** `isTeamFormat()`, `TEAM_FORMAT_KEYS` en `src/golf/formats` (derivados del registry por `category === 'team'`).
- **Bola compartida (scramble/foursome, NO best_ball):** `isSharedBallFormat()`, `SHARED_BALL_FORMAT_KEYS` en `src/golf/formats`.
- **Lista completa de formatos válidos:** `KNOWN_FORMAT_KEYS` en `src/golf/formats`.

Detalle expandido en `feedback_un_concepto_una_fuente.md` (memoria).
