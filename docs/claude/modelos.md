# MODELOS v2 — "cada modelo en lo suyo" (vigente desde 02-oct-2026)

> Reemplaza la versión del 25-sep (`docs/claude/modelos-v1-25sep-reemplazada.md`). Decidida por Juanjo el
> 02-oct-2026 tras medir que Fable consumía ~38 % del cupo y el total pasó de ~USD 40 a ~USD 185/día.
> Propuesta escrita por Opus, revisada y corregida por Fable. Resumen operativo en `CLAUDE.md` → MODELOS.

## El diagnóstico que la motiva (medido, 25-sep → 1-oct)

- **El 99 % del costo de Fable era leer contexto, no pensar.** Contexto promedio por llamada: 272k tokens.
  El output (su juicio) fue ~1 % del costo.
- 47 % del gasto de Fable: 3 trabajos donde Fable implementó de punta a punta (4-8 h, 350-550 pasos).
  39 %: 17 revisiones de código (~USD 12 c/u). 12 %: 16 críticas visuales (Fable sacando screenshots).
- Revisores "reanudados" para la 2ª vuelta: releían toda la conversación (277k tokens para 3 cambios).
- Cada subagente arrancaba con ~69k tokens (definiciones de todas las herramientas/MCP/skills + CLAUDE.md
  de ~10k + MEMORY.md ~5k) antes de leer una línea del repo.
- Hilo principal Opus: 36 % de sus acciones eran mecánicas (esperar CI, tsc/tests/build, git, screenshots)
  y solo 8 % editaba código; cada acción relee ~200k tokens.

**Física del costo:** lo caro es *tokens × turnos*. Un token que entra al hilo principal se relee en cada
turno siguiente (~14× su precio en una sesión larga). Lanzar un subagente mínimo cuesta poco, una vez.

## En qué es bueno cada modelo

| Modelo | Fortaleza | Peso de cupo | Rol v2 |
|---|---|---|---|
| **Fable 5.1** | Juicio: ve el bug que nadie vio, el caso borde de golf, el riesgo de seguridad, el detalle de diseño | 2,5× Opus | **Juzga**: revisa, critica, diagnostica, diseña planes. No carga ni ejecuta trabajo mecánico |
| **Opus 5.5** | Trabajador completo y rápido; criterio de UI/copy | 1× | **Escribe y decide**: hilo principal, implementa, arma el contexto para Fable |
| **Sonnet 5** | Acotado y verificable | 0,5× | Tareas mecánicas con respuesta objetiva (`tarea-mecanica`) |
| **Haiku 4.5** | Leer/buscar volumen | 0,25× | Búsquedas multi-archivo con salida literal (`explorador-haiku`); triage del inbox |
| **Scripts / comandos** | Gratis | 0 | Esperar CI, tsc/tests/build, screenshots estandarizados, smoke |

## Agentes (`.claude/agents/`) — todos con herramientas mínimas

| Agente | Modelo | Herramientas | Para qué |
|---|---|---|---|
| `revisor-fable` | Fable | Read, Grep, Glob | Toda revisión de código, golf, seguridad y crítica visual |
| `refactor-arquitecto` | Fable | Read, Grep, Glob | **Diseña** refactors grandes / arquitectura / planes de ola. No implementa |
| `debug-profundo` | Fable | Read, Grep, Glob, Bash, Edit, Write | Bug que resistió 2 intentos: Fable de punta a punta (el razonamiento durante la ejecución ES el valor) |
| `ingeniero` | Opus · tope 120 pasos | Read, Grep, Glob, Bash, PowerShell, Edit, Write, Skill | Implementación delegada en segundo plano (fix, frente de un plan). Reemplaza al agente genérico: archivo de estado en `.claude/estado/`, commit por etapa, salidas largas a archivo |
| `tarea-mecanica` | Sonnet | Read, Grep, Glob, Bash, Edit, Write | Renombres, seed, docs, boilerplate 1:1 |
| `explorador-haiku` | Haiku | Read, Grep, Glob | "Lee estos N archivos y ubica dónde se decide X". Salida literal + conteo |

Restringir `tools:` saca del arranque las definiciones de MCP/skills que el agente no usa. Meta: arranque
≤25k tokens (se mide con `scripts/uso-modelos.mjs`).

## Reglas

1. **Fable juzga con expediente mecánico.** Antes de cada revisión:
   `node scripts/expediente-review.mjs --intencion "qué quise hacer (≤150 palabras)" [--imagenes …]`.
   El expediente lo arma un script (diff completo, usos de cada símbolo tocado, candidatos de fuente
   canónica, listas literales repetidas, checklist fijo), **no el autor**: el autor dice qué quiso hacer,
   nunca dónde mirar. Se lanza `revisor-fable` con la ruta del expediente. Fable puede leer/buscar en el
   repo (≤20 turnos) y siempre responde "qué me faltó ver"; el hilo principal responde cada ítem.
2. **Segunda vuelta = `revisor-fable` NUEVO** con `--desde <sha de la revisión anterior>` (solo el delta).
   Nunca `SendMessage` a un revisor anterior: lo reanuda y relee todo.
3. **PR grande** (expediente >60k tokens): partirlo con `--solo "rutas"`, un revisor por grupo.
4. **Una revisión Fable por PR** que junte código + visual cuando aplican ambos (no dos agentes). Única
   excepción: la evaluación de variantes de diseño en `/inbox` (antes de implementar).
5. **Crítica visual:** Opus toma los screenshots estandarizados (390px, claro y oscuro, estados con datos
   largos) y mide contraste; Fable los recibe vía `--imagenes` y solo juzga. Fable no corre Playwright.
6. **Fable antes en zona crítica:** en trabajo nuevo sobre golf/BD/pagos, `refactor-arquitecto` o
   `revisor-fable` revisa el *plan* (≤15 turnos) antes de escribir código. Evita vueltas de CAMBIOS.
7. **Refactor grande / arquitectura:** `refactor-arquitecto` diseña → Opus ejecuta el plan → `revisor-fable`
   revisa el diff final. `debug-profundo` NO sigue este esquema (Fable de punta a punta).
8. **Esperas y verificaciones = comandos, no modelos.** `gh pr checks --watch`, `/pre-push`, scripts de
   screenshots. La decisión de merge se toma **solo por exit code / estado de checks**, nunca por un resumen.
9. **Cuándo delegar desde el hilo principal:** cuando lo que volvería al hilo supere ~3k tokens (~100 líneas)
   o exija >5 turnos de espera; el subagente devuelve ≤300 tokens. Un grep chico se hace directo
   (`head_limit`). Haiku solo para búsquedas multi-archivo y el hilo verifica el conteo con un grep.
10. **Sonnet y Haiku nunca escriben** lógica de golf, código de zona crítica, UI, copy de cara al usuario
    ni SQL contra prod. Si encuentran criterio de golf/producto/arquitectura, se detienen y devuelven.
11. **El autor nunca se revisa a sí mismo** (modelo distinto). Lo que escribió Opus lo revisa Fable; lo que
    escribió Fable (`debug-profundo`) lo revisa `revisor-fable` lanzado con `model: "opus"` (el override de
    `Agent` pisa el frontmatter), agente nuevo, esfuerzo máximo.
12. **Escalar, nunca bajar tras un error** (Haiku → Sonnet → Opus → Fable).
13. **Cupo de Fable agotado:** `revisor-fable` con `model: "opus"`, agente nuevo, esfuerzo máximo, y se avisa a
    Juanjo en una línea. Nunca se frena el trabajo por eso.
14. **Sesión entera en Fable** (brainstorm largo 100 % interactivo que no se puede delegar): Claude avisa
    "Sugiero `/model` → Fable porque <razón>" y espera. Raro.
15. **Label `fable-reviewed`** (lo exige el check de zona crítica del CI): con APROBADO, el hilo principal lo
    agrega (`gh pr edit <N> --add-label fable-reviewed`) citando la ruta del expediente. De noche, solo Juanjo.
16. **Tope de vueltas Fable por PR: 3.** Desde la 4ª vuelta revisa `revisor-fable` con `model: "opus"`
    (agente nuevo, esfuerzo máximo, solo el delta). Excepción: si la 3ª vuelta encontró un P0 de golf,
    datos o seguridad, la 4ª sigue en Fable. En zona crítica, el label `fable-reviewed` tras una 4ª vuelta Opus
    APROBADO se pone citando los expedientes de la 3ª (Fable) y la 4ª. Para llegar a menos vueltas: plan revisado antes del código en
    zona crítica (regla 6) y responder TODOS los hallazgos de una vuelta antes de pedir la siguiente.
17. **Trabajo delegado largo = agente `ingeniero`**, nunca `general-purpose`. Máximo **1 ingeniero en
    segundo plano a la vez** (2 solo con torneo inminente). Un encargo por agente; si queda PARCIAL (tope de
    120 pasos), se lanza un ingeniero NUEVO con el archivo de estado, no se reanuda el anterior.

### Qué revisa Fable (y qué no)

| Cambio | Revisión |
|---|---|
| Zona crítica (abajo), cualquier tamaño | `revisor-fable` obligatorio |
| PR >100 LOC fuera de zona crítica | `revisor-fable` con `model: "opus"` (expediente, esfuerzo máximo) — desde 09-oct |
| Pantalla nueva / rediseño / pantalla de cancha modificada | `revisor-fable` con screenshots (junto con el código si hay) |
| Tweak visual (color, espaciado, texto) | Opus: screenshot antes/después 390px claro/oscuro + contraste medido |
| PR solo docs, CI/config, `.gitignore`, solo tests nuevos | Sin revisión |
| Torneo inminente / P0 en cancha | Velocidad: Opus. Si Opus falla 2 veces, `debug-profundo` |

**Zona crítica:** `src/golf/core/`, `src/golf/formats/`, handicap/índice/net, scoring y leaderboard,
paywall/pagos, auth (`src/proxy.ts`), archivos protegidos, migraciones SQL, `DELETE`/`UPDATE` masivo de datos
de usuarios, RLS. En diseño: pantallas de cancha (scorer, leaderboard, inscripción, resultados) y primer
contacto (home, onboarding, /planes). Rutas: `.github/critical-zone-paths.txt`.

### Pipeline de diseño (proporcional al tamaño)

| Cambio | Qué se exige |
|---|---|
| Tweak | Screenshot antes/después 390px claro y oscuro; contraste WCAG AA medido |
| Componente o pantalla modificada | Lo anterior + `revisor-fable` con los screenshots |
| Pantalla nueva o rediseño | `design-shotgun` (3-4 variantes) → Fable elige dirección → Opus implementa con `frontend-design` → `revisor-fable` → decision log en `docs/design-decisions/` |

Checklist visual de Fable: uso real en cancha (una mano, guante, sol, ≥44px, pulgar), heurísticas de
Nielsen, WCAG 2.2 AA (contraste compositado, foco, etiquetas, no solo color), leyes de UX (Hick, Fitts,
Jakob, una acción principal), estados completos (cargando, vacío, error, sin red, nombres de 30 letras,
4 jugadores, 27 hoyos), consistencia con `DESIGN.md`, benchmark The Grint / V-Par / Garmin Golf.
Veredicto APROBADO / CAMBIOS; con CAMBIOS no se mergea.

## Consumo — por qué se acaba el cupo y los frenos (09-oct-2026)

**Medido 02→09 oct:** ~73 % del gasto lo hicieron 6 sesiones/agentes Opus de >150 pasos que releían en cada
paso 300k-660k tokens de historial (picos de ~970k, casi nunca resumían porque el límite es 1M). Las 74
revisiones Fable fueron ~18 % (mediana USD 1,7, 8 turnos) y claude-mem ~7 %. Total ~USD 230/día: el semanal
duraba 3 días. Fable NO era el problema; los contextos gigantes sí.

| Freno | Dónde | Cómo se apaga |
|---|---|---|
| Resumen automático a ~250k tokens (sesiones y subagentes; probado 09-oct con Haiku: el subagente resume) | `.claude/settings.json` → `env.CLAUDE_CODE_AUTO_COMPACT_WINDOW` | Borrar la línea |
| Agente `ingeniero` con `maxTurns: 120` (al tope devuelve PARCIAL; probado 09-oct) | `.claude/agents/ingeniero.md` | Subir/quitar `maxTurns` |
| Fable: zona crítica + pantallas; PR >100 LOC no crítico → Opus; tope 3 vueltas | Reglas 16 y tabla de arriba | Revertir esas filas |
| claude-mem apagado (lanzaba un Sonnet por cada acción) | `~/.claude/settings.json` → `enabledPlugins` (global, no en el repo) | Volver a `true` |
| Aviso Telegram de ritmo semanal (uso > semana transcurrida + 15 pts, desde 30 %) | `--watchdog` 08:00 y 12:00 (`weeklyPaceAlert`) | Quitar `checkWeeklyPace()` |

**Riesgo conocido del resumen automático:** si un solo paso mete mucho texto (un build entero), el agente
puede resumir en bucle y perder el hilo (visto en la prueba con ventana de 100k). Por eso: salidas largas a
archivo + `tail`, y el archivo de estado del `ingeniero`. **Higiene del hilo principal:** una sesión por
frente; al cambiar de frente, `/clear` (la memoria y los docs guardan lo importante).
**Medir:** `node scripts/uso-modelos.mjs --desde <fecha>`. Meta: ≤ USD 130/día y semanal que dure 6-7 días.

## Medición y criterio de éxito

`node scripts/uso-modelos.mjs [--desde AAAA-MM-DD] [--hasta AAAA-MM-DD]` — gasto por día/modelo/origen y
métricas de las revisiones Fable. Línea base 25-sep → 1-oct: total ~USD 185/día, Fable ~70/día (38 %),
revisión mediana USD 4,7 / 20 turnos / arranque 68k, 15 revisores reanudados, 5/20 revisiones con CAMBIOS,
~6 referencias archivo:línea por revisión.

**Éxito a 1 semana (costo):** Fable ≤ USD 20/día y ≤ 15 % del total; total ≤ USD 145/día; revisión mediana
≤ USD 4 y ≤ 20 turnos; arranque de agentes ≤ 25k; 0 revisores reanudados.
**Calidad (manda sobre el costo):** proporción de revisiones con CAMBIOS y referencias por revisión no caen
vs. la línea base; 100 % de "qué me faltó ver" respondidos; 0 bugs de prod/inbox atribuibles a un PR
revisado bajo la v2.
**Fracaso:** vueltas CAMBIOS +30 %, hallazgos −40 % o cualquier P0 escapado de un PR revisado → se revierte
ESA medida, no toda la v2.

## Qué NO cubre

El modelo que usa la app en producción (coach tAIger+, import por foto, triage del inbox) se decide en su
propio código y presupuesto. Los agentes nocturnos (`scripts/ceo/`) siguen igual: de noche no se lanza Fable;
la revisión de PR >100 LOC es `revisor-fable` con `model: "opus"` y expediente, y la zona crítica queda en PR
abierto para que la revise Fable de día (`scripts/ceo-prompts/night-rules.md` regla 3).

## Mantenimiento

Cuando salga un modelo nuevo, Claude actualiza esta tabla y los `model:` de `.claude/agents/*.md` en la
misma sesión en que lo detecta.
