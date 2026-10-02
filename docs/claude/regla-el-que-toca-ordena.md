# REGLA OPERATIVA — "El que toca, ordena" (vigente desde 24-may-2026)

> Detalle movido desde `CLAUDE.md` el 02-oct-2026 (texto original, sin cambios). CLAUDE.md conserva la regla resumida y apunta acá.

**Contexto:** auditoría del 22-may-2026 (`docs/INFORME_CTO_2026-05-22.md`) detectó que la app tiene motor sólido pero estructura desordenada: 9 archivos productivos >1000 LOC, 41 puntos de acoplamiento directo UI↔Supabase, 4 API routes >500 LOC, 465 `console.*` sin logger central, duplicación `lib/` ↔ `golf/`. Sin reordenamiento la app no escala y rompe la directiva CERO FALLOS al primer torneo con problemas.

**Decisión de Juanjo (24-may-2026):** NO se pausan features/fixes durante el reordenamiento. La deuda se paga *al tocar* el código, no en sprint dedicado a futuro.

### La regla, sin ambigüedad

**Cuando cualquier agente vaya a modificar un archivo que está en la lista de "sucios" (definida abajo), PRIMERO lo refactoriza al estándar, DESPUÉS le hace el cambio pedido.**

No se pide permiso. No se pregunta a Juanjo. Se informa: *"Esto va a tardar X en vez de Y porque incluye reordenar el archivo Z al estándar."* Y se ejecuta.

### Lista de archivos "sucios" (refactor obligatorio antes de tocar)

Cualquier archivo productivo (no test) que cumpla **cualquiera** de estas condiciones:

1. **>600 LOC** (objetivo post-refactor: <500 LOC, idealmente <300).
2. **Hace `supabase.from(...)` directamente** desde `src/app/` fuera de `api/` (debe ir vía `src/lib/data/` o un hook).
3. **API route con lógica de negocio embebida** (handler debe ser delgado, lógica en `src/golf/` o `src/lib/<dominio>/`).
4. **Módulo de dominio que vive en `src/lib/`** y debería estar en `src/golf/` (ej: `src/lib/ronda/`, `src/lib/mi-golf/`, `src/lib/cpi.ts`, `src/lib/share-card.ts`, `src/lib/gwi.ts`, `src/lib/course-matching.ts`, `src/lib/courses.ts`, `src/lib/score-colors.ts`, `src/lib/garmin-colors.ts`, `src/lib/indice-golfers.ts`).
5. **Usa `console.log/error/warn/info/debug`** en producción (debe usar `captureError()` de `src/lib/error-tracking.ts` o el `logger` correspondiente).

Lista canónica de los 9 archivos >1000 LOC hoy (mayo 2026):
- `src/app/ronda-libre/nueva/page.tsx` (2118)
- `src/app/ronda-libre/[codigo]/page.tsx` (2038)
- `src/app/perfil/historial/page.tsx` (1408)
- `src/app/ronda-libre/[codigo]/score-grupo/page.tsx` (1305)
- `src/app/organizador/[slug]/jugadores/JugadoresPanel.tsx` (1112)
- `src/components/import/ImportGuide.tsx` (1077)
- `src/app/admin/golf-ops/page.tsx` (1033)
- `src/app/ronda-libre/[codigo]/score/page.tsx` (1025)
- `src/components/CourseSelector.tsx` (1018)

### El estándar al que se refactoriza

Mismo patrón validado en `score/page.tsx` (1951 → 1025 LOC, PR `e98e3e3`):

- **Lógica → hooks** en `<misma-ruta>/hooks/use<Cosa>.ts`. Tests unit por hook.
- **Vista → componentes** en `<misma-ruta>/components/<Cosa>.tsx`.
- **Acceso a datos** vía `src/lib/data/<dominio>.ts` (capa nueva — si no existe la función, se crea ahí, no se hace `supabase.from()` directo).
- **Sin `console.*`** en código productivo. Solo `captureError()` o logger.
- **Si lleva lógica de golf**, va a `src/golf/<submódulo>/`. `src/lib/` solo infraestructura.

### Flujo concreto cuando llega un pedido

1. Juanjo: *"el historial está roto, no muestra rondas de equipo"*.
2. Agente: identifica que el fix toca `src/app/perfil/historial/page.tsx` (1408 LOC, está en lista).
3. Agente avisa: *"Voy a refactorizar `historial/page.tsx` primero (1 día) y después meter el fix (30 min). Total ~1.5 días en vez de 2 horas. Pero queda hecho para siempre."*
4. Agente abre worktree dedicado (`node scripts/setup-worktree.mjs ...`), refactoriza, valida (tsc + tests + canarios + smoke en preview), commitea el refactor, hace el fix, commitea el fix, abre PR.
5. Agente reporta al final con escala 1-10 del archivo refactorizado vs. antes.

### Excepciones (NO refactorizar antes)

- **Bug bloqueante con torneo real próximo** (Juanjo avisa "hay torneo el X"). Foco solo en estabilidad. Refactor se posterga.
- **Cambio de 1 línea trivial** que claramente no requiere abrir el archivo entero (ej: cambiar un copy, un color). Si el cambio cabe en un Edit chico sin leer >100 líneas alrededor, no se gatilla la regla.
- **El archivo ya fue refactorizado a <600 LOC y cumple los 5 criterios.** Confirmado vía `wc -l` + grep antes de empezar.

### Lo que SÍ queda como sprint dedicado (no se puede "por el camino")

Tres cosas necesitan trabajo concentrado, todo lo demás se hace al pasar:

1. **Limpieza inicial** (1 semana, ola 1 del plan). Se hace una sola vez cuando cierren los pivots abiertos (Drill Studio, `.clone/`, residuales). Detalle en `docs/superpowers/brainstorms/2026-05-22-plan-mejora-codigo.md`.
2. **Capa de datos completa** (2-3 semanas, ola 4). Cuando ya tengamos varios archivos refactorizados, hacemos pasada completa para llevar los 41 lugares restantes a `src/lib/data/`. En el medio, cada refactor de un archivo "sucio" va creando funciones en `src/lib/data/` *ad-hoc*.
3. **Barrido final de archivos no tocados** (1 semana, al cierre del trimestre, ~3 meses tras vigencia de esta regla). Auditoría: ¿qué archivos "sucios" sobrevivieron sin que nadie los tocara? Refactor forzado de los que sigan en lista. Justifica: si un archivo no se tocó en 60-90 días es bajo riesgo activo, pero sigue siendo deuda latente y debe quedar igualmente al estándar antes del lanzamiento público.

**Mecanismo de seguimiento:** mantener `docs/REORDENAMIENTO_TRACKING.md` con la lista de los 9 archivos monstruo y check al lado de cada uno cuando se refactoriza. Agente principal revisa al inicio de cada sesión si quedan pendientes >60 días → propone refactor proactivo aunque nadie lo pida.

### Reporte semanal (CTO → PM)

Cada lunes, agente principal arma una línea: *"Esta semana: X archivos refactorizados (lista), Y bugs cerrados, escala global Z/10 (era W/10)."* Sin informe largo. Si Juanjo quiere detalle, abre el PR.

### Por qué esta regla y no sprint dedicado

- Juanjo confirmó: hay rutas a medio terminar que requieren trabajo continuo. No se puede congelar features 3 meses.
- La deuda se paga *donde duele* (rutas que se tocan = rutas que importan).
- Las rutas que nadie toca, no urgen — al final del trimestre quedan refactorizadas las que se usan.
- Compatible con CERO FALLOS: cada archivo refactorizado *reduce* riesgo de bug futuro.

Detalle expandido en `feedback_regla_el_que_toca_ordena.md` (memoria).
