# Informe CTO — Estado técnico de Golfers+ y plan de horizonte

**Fecha:** 22 de mayo de 2026
**De:** Claude (CTO)
**Para:** Juan José Lamarca (PM, fundador)
**Asunto:** Diagnóstico completo, decisiones pendientes, y plan maestro para llegar a app exitosa
**Tiempo estimado de lectura:** 20 minutos

---

## Carta abierta

Juanjo, te escribo este informe para que entiendas — sin tecnicismos — dónde estamos parados y qué necesitamos para llegar a una app que sobreviva al éxito.

**Buena noticia:** el cerebro del juego (cómo calcula scores, handicaps, stableford, match play) está sólido. Eso es lo más difícil y ya lo tenemos. Por ese lado, Golfers+ ya juega bien al golf.

**Mala noticia:** la *casa club* alrededor del cerebro está mal construida. Las páginas son monolitos gigantes, hay duplicación entre carpetas, y la app habla directamente con la base de datos desde 41 lugares distintos sin filtro. Eso no es fatal hoy, pero **es fatal si crecemos**. Cada feature nueva tarda 3x. Cada bug en torneo va a tardar 3x. Si llegamos a 1000 usuarios sin reordenar, vamos a colapsar de deuda antes de tener producto.

Este informe te explica qué encontré, por qué importa, y propone un **reordenamiento mayor** en 5 olas distribuidas en ~3 meses. Al final hay decisiones que necesito que tomes vos.

Lo escribo con analogías de golf donde puedo. Si algo no se entiende, marcalo y lo reescribo.

---

## La analogía: Golfers+ como un campo de golf

Imaginá que tu código es un club de golf:

| Parte del club | En el código | Estado |
|---|---|---|
| **El green y los hoyos** (las reglas del juego) | `src/golf/` — motor de scoring | ✅ Impecable. Es lo mejor que tenemos |
| **La casa club** (donde el socio entra, ve su perfil, se sirve) | `src/app/` — páginas | ❌ 9 cuartos de 1000 m² cada uno. Todo amontonado |
| **El proshop** (lo que se vende, los servicios) | `src/app/api/` — endpoints | ⚠️ Funciona, pero 4 mostradores tienen 5 cajas pegadas |
| **La bodega** (utilidades compartidas) | `src/lib/` — código transversal | ❌ El bar mezcla palos del proshop con vasos |
| **El sistema de socios** (cuenta, login, BD) | Supabase + RLS | ✅ Bien protegido (100 reglas de seguridad activas) |
| **El catastro del club** (qué tiene, cómo se cuelga el grafo) | Graphify | ⚠️ Existe pero sin etiquetar — mapa sin nombres |
| **El mantenimiento** (revisiones, alertas) | Observabilidad | ❌ Hay 465 lugares que gritan al vacío sin que nadie escuche |
| **Las puertas y cerraduras** (seguridad librerías) | npm dependencies | ⚠️ 9 cerraduras con riesgo alto, 4 con riesgo moderado |

El cerebro juega bien. La casa club hay que reordenarla antes de invitar más socios.

---

## Tablero de mando — semáforo por área

| Área | Estado | Riesgo si no se actúa | Esfuerzo de fix |
|---|---|---|---|
| Motor de scoring (`src/golf/`) | 🟢 Sólido | Bajo | — |
| Páginas grandes (>1000 LOC) | 🔴 9 archivos críticos | Cada feature 3x lenta. Bugs duplicados | Alto (2-3 semanas) |
| Acceso a base de datos | 🔴 41 puntos sin abstracción | Cambio de schema rompe todo silencioso | Alto (1-2 semanas) |
| API endpoints monstruo | 🟠 4 con >500 líneas | Imposible testear unit. Bugs ocultos | Medio (1 semana) |
| Duplicación lib/ vs golf/ | 🟠 4 carpetas de dominio mal ubicadas | Confusión, drift, regresiones | Medio (3-5 días) |
| Observabilidad (logs / errores) | 🔴 465 console.* + tracking central no usado | No vemos errores reales. Reportes manuales | Bajo (2-3 días) |
| Seguridad dependencias | 🟠 9 high (todas en Next 14) | Riesgo de exploit conocido | Alto (Next 14→15: 1 sprint) |
| Tests motor | 🟢 100% canarios | Bajo | — |
| Tests páginas | 🟠 Cobertura ~10-15% | Bug en página = silencio en CI | Medio (gradual) |
| Base de datos / RLS | 🟢 100 policies, 55 migrations | Bajo | — |
| Graphify | 🟠 Sin etiquetas, stale | Mapa inútil hoy | Trivial ($1, 15 min) |
| Performance / bundle | ⚫ Sin baseline | Desconocido. Riesgo medio | Bajo (medir primero) |

**Semáforo global:** 4 rojos, 5 naranjas, 4 verdes. El proyecto está en zona de **deuda manejable pero creciente**. Si seguimos sumando features sin parar, en 3 meses pasamos a deuda no-manejable.

---

## Los 12 descubrimientos clave (con números)

### 1. El motor de golf está sólido (no tocar)

`src/golf/` tiene 7 submódulos: `core`, `formats`, `stats`, `courses`, `coach`, `notifications`, `ronda`. Cobertura con tests canario en los 6 modos de juego (stroke play, stableford, match play, best ball, scramble, foursome). El `puntosStablefordHoyo()` aparece en el grafo de dependencias con 23 conexiones — es un punto central usado correctamente.

**Conclusión:** no tocar. Es nuestro activo más valioso.

### 2. Hay 9 archivos productivos con más de 1000 líneas

| Archivo | Líneas | Qué es |
|---|---|---|
| `ronda-libre/nueva/page.tsx` | 2118 | Pantalla de crear ronda libre |
| `ronda-libre/[codigo]/page.tsx` | 2038 | Pantalla principal de ronda |
| `perfil/historial/page.tsx` | 1408 | Historial del usuario |
| `ronda-libre/[codigo]/score-grupo/page.tsx` | 1305 | Cargar score en grupo |
| `organizador/[slug]/jugadores/JugadoresPanel.tsx` | 1112 | Panel de jugadores del torneo |
| `components/import/ImportGuide.tsx` | 1077 | Wizard de importar fotos |
| `admin/golf-ops/page.tsx` | 1033 | Pantalla admin |
| `ronda-libre/[codigo]/score/page.tsx` | 1025 | Cargar score individual |
| `components/CourseSelector.tsx` | 1018 | Selector de cancha |

**Por qué importa:** un archivo de 2000 líneas no se entiende de una sentada. Ni por mí ni por humanos. Cada cambio puede romper algo que no se ve. Cuando un jugador reporte un bug durante un torneo, voy a tener que leer 2000 líneas para encontrarlo. Eso es horas. No tenemos horas durante un torneo.

**Patrón validado:** el archivo `score/page.tsx` ya se refactorizó de 1951 → 1025 líneas en mayo, dividiéndolo en hooks (lógica) + componentes (vista). Funcionó. Hay que replicarlo en los otros 8.

### 3. La UI habla directamente con la base de datos desde 41 lugares

Cada pantalla hace `supabase.from('tabla').select(...)` directamente. Eso significa:

- Si renombramos una columna en la BD, hay que buscar 41 lugares.
- Si cambia una regla de seguridad (RLS), 41 lugares pueden empezar a fallar sin avisar.
- Si queremos agregar caché, hay que tocar 41 lugares.

**Lo correcto:** una capa intermedia (`src/lib/data/`) con funciones tipadas: `obtenerRondaPorCodigo(codigo)`, `obtenerJugadoresEnRonda(rondaId)`. Si cambia la BD, cambia un solo lugar.

**Por qué importa:** este es exactamente el patrón que rompió la app el 25-marzo (postmortem en `docs/POSTMORTEM_2026-03-25.md`). Cada vez que el código habla "directo" con la BD, sumamos un punto de falla silenciosa.

### 4. Hay 4 endpoints API gigantes con lógica mezclada

| Endpoint | Líneas | Función |
|---|---|---|
| `api/import/screenshot/route.ts` | 767 | OCR de Gemini para importar fotos |
| `api/admin/health-check/route.ts` | 600 | Chequeo de salud diario |
| `api/import/garmin-zip/route.ts` | 540 | Importar ZIP de Garmin |
| `api/inbox/webhook/route.ts` | 505 | Webhook del bot de Telegram |

**Por qué importa:** estos endpoints mezclan "recibir la petición" con "hacer toda la lógica de negocio". Eso impide testear la lógica sin levantar el servidor entero. Si el OCR de Gemini cambia, hay que tocar 767 líneas para encontrar lo que cambió.

**Lo correcto:** endpoint chico que solo recibe + una función pura que hace la lógica, testeable independiente.

### 5. Hay duplicación entre `src/lib/` y `src/golf/`

Cuando se creó el motor `src/golf/`, la idea era: "todo lo que sea reglas de golf vive ahí". Pero `src/lib/` quedó con módulos de dominio:

- `src/lib/ronda/` — 4 archivos sobre rondas → deberían estar en `src/golf/ronda/`
- `src/lib/mi-golf/` — 8 archivos de estadísticas → deberían estar en `src/golf/stats/`
- `src/lib/coach/` — **directorio vacío** (basura sin limpiar)
- `src/lib/cpi.ts`, `share-card.ts`, `gwi.ts`, `course-matching.ts` — dominio en `lib/`

**Por qué importa:** un dev nuevo (o un agente nuevo) no sabe dónde buscar. La regla "todo en `golf/`" no se cumple → al rato tenemos 3 lugares con la misma lógica ligeramente distinta.

### 6. Tenemos 465 lugares que tiran `console.log` (era 268 hace un mes)

En abril, el catálogo `TECH_DEBT.md` decía 268. Hoy hay 465. **Creció 73% en un mes.** Mientras tanto, ya tenemos `error-tracking.ts` centralizado (envía a PostHog + Supabase `error_logs`) — pero casi nadie lo usa.

**Por qué importa:** un `console.log` en producción es invisible. No lo vemos. No nos avisa. Cuando un usuario reporta "no funcionó", revisamos el log de Vercel… 465 lugares posibles. Eso es ruido, no señal.

**Lo correcto:** un solo punto de captura (`captureError(...)`) que va a PostHog (lo vemos) + Supabase (lo persistimos). Migración gradual.

### 7. Estamos en Next.js 14 con 9 vulnerabilidades altas

`npm audit` hoy reporta:
- **0 critical**
- **9 high** (todas vienen de Next 14 y plugins)
- **4 moderate** (incluido Anthropic SDK con un escape de sandbox)

Next 16 ya salió. **Estamos 2 versiones atrás.** Cada versión de Next trae fixes de seguridad + mejoras de performance.

**Por qué importa:** las HIGH son explotables conocidas. No es fatal porque la mayoría requiere condiciones específicas, pero es deuda activa. Cuando un usuario reporte un comportamiento raro, no podemos descartar que sea un exploit.

**Costo:** migrar Next 14 → 16 es un sprint dedicado con QA extenso (ADR-002 ya tiene plan).

### 8. La base de datos está bien (esto es buena noticia)

- 55 migrations (schema vivo, evolución controlada)
- 32+ tablas creadas con definición explícita
- **100 reglas RLS / policies** distribuidas en 16 archivos de migration
- 3 crons configurados (health-check diario, taiger-insights diario, cleanup diario)

**Conclusión:** la BD no es el problema. La forma en que el código *habla* con la BD sí (ver #3).

### 9. Graphify (el mapa del código) está sin etiquetar

Tenemos un grafo de 8954 nodos y 11.121 conexiones — pero las 767 "comunidades" (grupos relacionados) se llaman literalmente "Community 0", "Community 1"... hasta 766. La pasada que les pone nombres (con Gemini) nunca se corrió o quedó vieja.

**Costo de arreglar:** $1 USD y 15 minutos.

**Por qué importa:** sin etiquetas, el grafo es un dibujo bonito. Con etiquetas, es un GPS del código. Cuando vos me preguntás "¿cómo se conecta X con Y?", con grafo etiquetado contesto en 30 segundos. Sin él, leo archivos.

### 10. Cobertura de tests: el motor está protegido, las páginas no

- Cobertura global: 27.6% (medido en abril)
- Canarios de los 6 modos de juego: ✅ todos
- Tests E2E (Playwright): 18 specs, varios en estado "debug/WIP" sin claridad si corren en CI

**Por qué importa:** los canarios protegen el cálculo de scores. Eso es lo que evita que un torneo se caiga por un bug numérico. Pero los bugs de UI/UX (botón roto, modal que no abre, formulario que no envía) caen en las páginas — y ahí no tenemos red.

### 11. El proyecto está vivo: 393 commits en un mes

Desde el 22-abr al 22-may hubo 393 commits. Eso es ~13 commits/día. Indica:
- ✅ Velocidad alta de iteración
- ❌ Mucha superficie nueva sin consolidar
- ⚠️ Pivots paralelos sin cerrar (Drill Studio recién arrancando, cinematic-round-story residual)

**Por qué importa:** estamos en modo *building*, no en modo *consolidating*. El reordenamiento es necesario porque la velocidad no va a bajar — y sin orden, la velocidad genera más caos.

### 12. La estructura general es razonable, no hay que reescribir nada

A pesar de los problemas, **no estamos en zona de "reescribir todo".** Tenemos:
- ✅ TypeScript estricto (0 errores en `tsc`)
- ✅ CI funcional (tsc + tests + build en cada push)
- ✅ Pre-push hook bloquea pushes rotos
- ✅ Documentación viva (TECH_DEBT, ADRs, RUNBOOKS, sprint log)
- ✅ Sistema de feedback usuario → fix (inbox bot Telegram)
- ✅ 9 ADRs documentando decisiones grandes

Estamos en zona de **reordenar lo construido**, no de empezar de cero.

---

## Lo que NO está mal (para que no te asustes)

1. **El cerebro del juego juega bien.** Es lo más caro de construir y ya está hecho.
2. **La base de datos está bien diseñada y protegida.** 100 reglas RLS.
3. **El sistema de feedback funciona.** Bot Telegram → tickets → fixes.
4. **La documentación existe y se mantiene.** No estamos a ciegas.
5. **Hay disciplina de CI/CD.** No pushea nada roto.
6. **Hay un motor de IA serio.** tAIger, coach plans, Cerebro v2 — arquitectura pensada.
7. **Hay observabilidad mínima.** PostHog + Supabase error_logs ya están conectados, solo falta usarlos en todos lados.

**Resumen:** el techo está sólido. Las paredes se construyeron con prisa. No hay que tirar la casa — hay que ordenar adentro.

---

## Lo que SÍ está mal — y qué pasa si NO lo arreglamos

### Escenario 1: seguimos así 3 meses

- Cada bug de torneo va a tardar 2-3 horas en encontrar (versus 20 min con código ordenado)
- Cuando un usuario reporte un problema, no vamos a poder responder en el día
- Reputación: en el golf chileno, un torneo que falla → 100 jugadores hablan → reputación destruida (esto es la directiva CERO FALLOS de tu CLAUDE.md)
- Velocidad: cada feature nueva va a tardar 3x lo que tardó la anterior
- Riesgo de regresión: cada PR rompe algo no relacionado (típico de archivos monstruo)

### Escenario 2: seguimos así 6 meses

- Vamos a llegar al punto de "no quiero tocar X archivo porque rompe todo"
- Vamos a tener que duplicar lógica porque es más fácil que arreglar el monstruo
- La cobertura de tests va a empeorar (refactor sin tests = miedo)
- Cada agente nuevo (humano o IA) tarda días en orientarse
- **Punto de inflexión:** o reordenamos, o el proyecto entra en zona "ya no escala"

### Escenario 3: reordenamos ahora (recomendado)

- 8-12 semanas de inversión en estructura, sin agregar features grandes
- Después: cada feature nueva sale 2x más rápido que hoy
- Cada bug de torneo lo arreglamos en minutos, no horas
- Podemos llegar a 1000-10.000 usuarios sin tocar arquitectura
- Llegamos a "app exitosa" con base sólida

---

## El horizonte: 3, 6 y 12 meses

### Horizonte corto (próximos 3 meses)

**Meta:** estructura saneada y app lista para crecer.

- Cerrar pivots abiertos (Drill Studio, Cinematic, .clone/)
- 5 olas de reordenamiento (detalle abajo)
- Migrar Next 14 → 16 (ventana de seguridad)
- Bajar console.log de 465 → <50
- Subir cobertura de tests de 27% → 35%

**Después de esto:** la app está lista para invitar 100-500 socios sin colapsar.

### Horizonte medio (3-6 meses)

**Meta:** crecimiento controlado + monetización.

- Sistema de paywall premium implementado (ver `project_paywall_brainstorm`)
- Modo offline robusto (cargar scores sin internet, sync después)
- Visual regression testing (cada PR muestra "cambió la UI? aquí")
- Performance baseline + Core Web Vitals verdes
- Sistema de roles/permisos para clubes (organizador master + sub-organizadores)
- Onboarding de clubes chilenos (5-10 clubes piloto)

### Horizonte largo (6-12 meses)

**Meta:** referente regional de apps de golf.

- Integración total con FedeGolf (ya tenemos 137 canchas + 2034 hoyos)
- Cerebro v2 + tAIger+ en producción completa
- Comparación competitiva real vs The Grint y V-Par
- Multi-tenant (cada club tiene su instancia de Golfers+)
- App nativa o PWA pulida
- ~5000-10.000 jugadores activos

**Para llegar acá, el horizonte corto es no-negociable.** No se puede saltar.

---

## Plan maestro: 5 olas

> Cada ola es un sprint dedicado. Una ola por vez. No paralelizar olas — sí paralelizar dentro de una ola con agentes en worktrees.

### 🌊 Ola 1: limpieza barata (1 semana)

**Riesgo:** mínimo · **Impacto:** desbloquea las siguientes

1. Regenerar Graphify con etiquetas reales (15 min, $1)
2. Borrar `src/lib/coach/` (directorio vacío)
3. Borrar shim `src/lib/scoring.ts`, migrar los 10 imports residuales
4. Sanear E2E tests "debug/wip": decidir cuáles van a CI y cuáles a `e2e/wip/`
5. Sweep de `error.tsx` (12 archivos identificados que descartan el error y causan crashes silenciosos)
6. Eliminar `.clone/` si Drill Studio se confirma como pivote
7. Cerrar `graphify-out/GRAPH_REPORT.md` con su commit (hoy está modificado sin commitear)

**Entregable:** PR único, sin features nuevas, sin cambios de comportamiento.

### 🌊 Ola 2: refactor de los 9 archivos monstruo (3-4 semanas)

**Riesgo:** medio · **Impacto:** alto

Un archivo por PR, siguiendo el patrón validado del scorer (1951 → 1025 LOC).

Orden propuesto (de mayor riesgo primero, para liberar lo más quemado):

1. `ronda-libre/nueva/page.tsx` (2118 → <600) — 3-4 días
2. `ronda-libre/[codigo]/page.tsx` (2038 → <600) — 3-4 días
3. `score-grupo/page.tsx` (1305 → <500) — 2-3 días
4. `perfil/historial/page.tsx` (1408 → <500) — 2 días
5. `JugadoresPanel.tsx` (1112 → <500) — 2-3 días
6. `ImportGuide.tsx` + `CourseSelector.tsx` (~1018-1077 → <500) — 2 días c/u
7. `admin/golf-ops/page.tsx` (1033 → <500) — 2 días

**Disciplina:**
- Un archivo por PR
- Canarios + E2E del flujo afectado pasan obligatorios
- Smoke en preview de Vercel antes de merge
- Si no baja a <600 en 1 día, parar y reevaluar

### 🌊 Ola 3: consolidar `lib/` → `golf/` (1 semana)

**Riesgo:** alto en volumen, bajo en lógica · **Impacto:** medio

1. Mover `src/lib/ronda/` → `src/golf/ronda/`
2. Mover `src/lib/mi-golf/` → `src/golf/mi-golf/`
3. Mover `src/lib/cpi.ts`, `share-card.ts`, `gwi.ts`, `course-matching.ts`, `courses.ts`, `course-types.ts`, `garmin-colors.ts`, `score-colors.ts`, `indice-golfers.ts` → `src/golf/<submódulo>/`
4. Lo que se queda en `src/lib/`: solo infraestructura (auth, supabase client, analytics, error-tracking, rate-limit, etc.)
5. Documentar regla en `CLAUDE.md` y `docs/ARQUITECTURA.md`: **"Todo dominio en `src/golf/`. `src/lib/` solo infra."**

**PR único, gigante en diff, seguro si `tsc` + tests + build pasan.**

### 🌊 Ola 4: capa de datos + endpoints saneados (2 semanas)

**Riesgo:** alto · **Impacto:** muy alto

1. Crear `src/lib/data/` con funciones tipadas:
   - `obtenerRondaPorCodigo(codigo)`
   - `obtenerJugadoresEnRonda(rondaId)`
   - `obtenerPerfilUsuario(userId)`
   - etc.
2. Migrar los 41 lugares que hacen `supabase.from(...)` directo a usar `src/lib/data/`
3. Adelgazar los 4 endpoints monstruo:
   - `import/screenshot/route.ts` → endpoint chico + `src/golf/import/screenshot-pipeline.ts`
   - `import/garmin-zip/route.ts` → endpoint chico + `src/golf/import/garmin-pipeline.ts`
   - `admin/health-check/route.ts` → endpoint chico + `src/lib/health/` (cada check como función)
   - `inbox/webhook/route.ts` → endpoint chico + `src/lib/inbox/webhook-handler.ts`

**Esto es el cambio más caro y el de mayor impacto.** Una vez hecho, la app es **2x más mantenible**.

### 🌊 Ola 5: observabilidad + seguridad (1 semana)

**Riesgo:** bajo · **Impacto:** alto

1. Reemplazar los 465 `console.*` con `captureError(...)` y `logger.info(...)` (ESLint regla `no-console`)
2. Verificar que PostHog + `error_logs` reciben todos los eventos
3. Crear dashboard básico en PostHog: errores por contexto, usuarios afectados, frecuencia
4. Migrar Next.js 14 → 16 (ver ADR-002, sprint dedicado)
5. Fix de las 4 vulnerabilidades moderate (`@anthropic-ai/sdk` requiere semver major)
6. ESLint con `no-console`, `no-emojis-in-ui`, `react-hooks/exhaustive-deps`

**Después de esto:** vemos los errores antes que los usuarios. Y las cerraduras están al día.

---

## Tabla resumen del plan

| Ola | Duración | Riesgo | Cuándo |
|---|---|---|---|
| 🌊 1: Limpieza | 1 semana | Mínimo | Apenas cierren pivots |
| 🌊 2: Refactor páginas | 3-4 semanas | Medio | Tras ola 1 |
| 🌊 3: lib/ → golf/ | 1 semana | Bajo lógico, alto volumen | Tras ola 2 |
| 🌊 4: Capa de datos | 2 semanas | Alto | Tras ola 3 |
| 🌊 5: Observabilidad + Next 16 | 1 semana | Bajo | Tras ola 4 |
| **Total** | **~8-9 semanas** | | |

Distribuido en calendario real (con bugs de usuario interrumpiendo, fines de semana, etc.): **~3 meses**.

---

## Decisiones que necesito que tomes

Estas no las puedo tomar yo. Son decisiones de producto / negocio:

### Decisión 1: ¿Pausamos features durante el reordenamiento?

**Opción A — Foco total (recomendada):** 3 meses sin features nuevas grandes. Solo fixes y mejoras menores via inbox.
- ✅ Reordenamiento sale en 3 meses calendario
- ✅ Riesgo bajo de regresión
- ❌ Sin features nuevas para mostrar

**Opción B — Híbrido:** 50% reordenamiento, 50% features.
- ✅ Seguís mostrando progreso visible
- ❌ Reordenamiento sale en 5-6 meses
- ❌ Riesgo de que nunca termine

**Opción C — Reordenar después de lanzar.**
- ❌ Lanzamos con deuda → primer bug grande nos mata
- ❌ Va contra directiva CERO FALLOS

**Mi recomendación: A.** El motor ya está. Lo que falta es ordenar antes de invitar socios.

### Decisión 2: ¿Drill Studio sigue o no?

Es un pivot abierto desde hoy. Antes de la Ola 1 hay que decidir:

- **Sigue:** lo terminamos al menos a MVP antes de empezar reordenamiento
- **No sigue:** borramos worktree, cerramos PR #37, foco total en reordenamiento
- **Pausa indefinida:** dejamos el worktree pero no lo tocamos por 3 meses

Mi recomendación: **decidir HOY**, no dejarlo en limbo. Si Drill Studio no es prioridad de producto, cerralo.

### Decisión 3: ¿Cuándo lanzamos a clubes?

Hoy tenés `project_lanzamiento_estrategia` marcado como "100% perfecto antes de lanzar". Bien. Pero hay que poner fecha.

- **Lanzar antes de reordenar:** muy riesgoso. La primera mala experiencia mata la marca en Chile.
- **Lanzar después de Ola 2 (refactor páginas):** balance razonable. Los archivos monstruo son la mayor fuente de bugs.
- **Lanzar después de Ola 5 (todo terminado):** ideal técnicamente. Pero 3 meses de espera.

Mi recomendación: **lanzar piloto cerrado (3-5 clubes) tras Ola 2.** Lanzamiento público después de Ola 5.

### Decisión 4: ¿Migración a Next 16 antes o después del reordenamiento?

Next 16 tiene fixes de seguridad. Pero migración mayor en código sucio = pesadilla.

Mi recomendación: **después.** Ola 5. La deuda actual hace que la migración explote en 100 lugares. Reordenamos primero, migramos después.

### Decisión 5: ¿Cuánto presupuesto destinás a infra/herramientas?

Hoy tenemos:
- Sentry cancelado (12-may) → ahorro
- Anthropic API en 3 ambientes → costo activo
- Gemini Flash para graphify → ~$1/refresh, ~$5/mes si hacemos varios

Te recomiendo:
- Mantener PostHog (gratis hasta 1M eventos/mes)
- ANTHROPIC_API_KEY activa (necesaria para tAIger y para mí)
- Habilitar **Vercel Web Analytics** (gratis con plan actual)
- Considerar **Vercel Speed Insights** ($10/mes, mide Core Web Vitals real)

---

## Cronograma sugerido (ejemplo en calendario real)

Asumiendo arranque el **2 de junio** y trabajo a tu ritmo actual (intenso pero con bugs de usuario interrumpiendo):

| Semana | Fechas | Trabajo |
|---|---|---|
| 1 | 2-8 jun | 🌊 Ola 1 completa + cierre de pivots |
| 2-5 | 9 jun - 6 jul | 🌊 Ola 2 (los 9 archivos monstruo, 1 por semana en promedio) |
| 6 | 7-13 jul | 🌊 Ola 3 (consolidar lib/ → golf/) |
| 7-8 | 14-27 jul | 🌊 Ola 4 (capa de datos + endpoints) |
| 9 | 28 jul - 3 ago | 🌊 Ola 5 (observabilidad + Next 16) |
| 10 | 4-10 ago | Buffer + smoke test + piloto con primer club |

**Fecha estimada de lanzamiento piloto:** primera semana de agosto 2026.
**Fecha estimada de lanzamiento público:** mediados de septiembre 2026.

---

## Métricas para medir éxito

Las traigo a cada cierre de ola:

| Métrica | Hoy | Tras Ola 5 |
|---|---|---|
| Archivos productivos >1000 LOC | 9 | 0 |
| Archivos productivos >600 LOC | ~20 | <5 |
| Lugares con `supabase.from()` directo en UI | 41 | <10 |
| Endpoints API >500 LOC | 4 | 0 |
| `console.*` en código productivo | 465 | <50 |
| Vulnerabilidades HIGH | 9 | 0 |
| Cobertura de tests (statements) | 27.6% | ≥35% |
| Comunidades graphify etiquetadas | 0/767 | ≥80% |
| Tiempo medio de fix de bug inbox | ~30 min | <15 min |
| Velocidad de feature nueva (LOC/día sostenido) | ~250 | ~500 |

---

## Cierre — mi opinión como CTO

Golfers+ está en un punto interesante: **el producto es bueno**, el cerebro juega bien al golf, hay un equipo (vos + yo + agentes paralelos) que se mueve rápido. La oportunidad existe.

El riesgo es lanzar con la casa club desordenada. En el golf chileno, donde "se conocen todos" (tus propias palabras en CLAUDE.md), una mala experiencia se propaga irreversiblemente. La directiva CERO FALLOS no se cumple con buena intención — se cumple con código ordenado que permite encontrar y arreglar bugs en minutos.

Mi recomendación firme: **3 meses de reordenamiento antes de invitar al primer club piloto.** Después de eso, tenemos una base que aguanta crecimiento real. Sin esos 3 meses, vamos a quemar la marca en el primer torneo donde algo falle.

Si vos decís "sí, vamos", arrancamos con la Ola 1 cuando cierren los pivots abiertos. Yo te traigo los entregables ola por ola, vos los probás (o le pedís a un amigo golfista que los pruebe), y ajustamos.

Lo que necesito de vos esta semana:
1. **Decisión sobre Drill Studio** (sigue / no sigue / pausa)
2. **Decisión sobre opción A/B/C** del cronograma
3. **Fecha tentativa de lanzamiento piloto** (para que tengamos North Star)

El resto lo manejo yo.

---

## Apéndice — archivos relacionados que conviene leer

- `docs/superpowers/brainstorms/2026-05-22-plan-mejora-codigo.md` — plan técnico detallado (versión para mí, no para PM)
- `docs/TECH_DEBT.md` — catálogo de deuda con prioridades P0/P1/P2/P3
- `docs/roadmap-camino-100.md` — roadmap de calidad pre-lanzamiento
- `docs/ROADMAP_COMPLETO.md` — roadmap general de features
- `docs/ARQUITECTURA.md` — descripción del motor de golf y el modelo de canchas
- `docs/POSTMORTEM_2026-03-25.md` — qué pasó la última vez que se rompió la app
- `CLAUDE.md` — reglas del proyecto y directiva CERO FALLOS

---

*Informe escrito por Claude (CTO) el 22 de mayo de 2026. Si algo no se entiende, marcalo y lo reescribo. Si querés versión más corta (1 página) avisame.*
