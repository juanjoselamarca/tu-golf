# Skills sub-utilizadas — recomendaciones para Golfers+

Tenemos 100+ skills instaladas entre plugins. **No usamos ni la cuarta parte.** Este doc lista las que aportarían valor real al proyecto y cuándo invocarlas.

> **Para Juanjo:** no tienes que aprender comandos nuevos. Esto es un menú para que Claude elija mejor. Si en algún momento quieres pedir alguno explícitamente, copiá la frase de "Cómo invocar".

---

## Top 5 skills que deberíamos usar más (orden de impacto)

### 1. `office-hours` (gstack) — antes de cualquier feature nuevo grande

**Qué hace:** brainstorming estilo YC — 6 preguntas que exponen si el feature realmente vale la pena, qué problema resuelve, cuál es el wedge más chico.

**Cuándo invocar:** cuando Juanjo dice "tengo una idea para X", "deberíamos agregar Y", o cualquier feature que tomaría más de 1 día de trabajo.

**Por qué hoy no la usamos:** saltamos directo a `brainstorming` (más visual, design-first). `office-hours` es mejor cuando todavía no sabemos si vale la pena construir.

**Cómo invocar:** "office-hours sobre [idea]"

---

### 2. `plan-eng-review` (gstack) — antes de ejecutar planes grandes

**Qué hace:** review interactivo del plan técnico — arquitectura, edge cases, tests, performance. Identifica problemas antes de tocar código.

**Cuándo invocar:** después de escribir un plan en `docs/superpowers/plans/` y antes de empezar a ejecutarlo. Especialmente si toca >5 archivos o algo crítico (BD, scoring, leaderboard).

**Por qué hoy no la usamos:** ejecutamos los planes directo. Hemos tenido bugs encontrables con un review previo (incidente del 25-mar con Navbar).

**Cómo invocar:** "review el plan de [archivo]"

---

### 3. `codex` (gstack) — segunda opinión antes de shippear cosas críticas

**Qué hace:** corre el diff por OpenAI Codex en modo adversarial — intenta romper el código. Tres modos: review, challenge, consult.

**Cuándo invocar:** antes de mergear cambios en motor de scoring, leaderboards, BD critical paths, o cualquier cosa que toque la directiva CERO FALLOS.

**Por qué hoy no la usamos:** cero veces en el historial. Es exactamente el tipo de safety net que la directiva máxima exige.

**Cómo invocar:** "pasale codex" o "challenge codex"

---

### 4. `dispatching-parallel-agents` (superpowers) — sprints con tareas independientes

**Qué hace:** dispara múltiples sub-agentes en paralelo cuando hay 2+ tareas sin dependencias.

**Cuándo invocar:** sprints de polish (audit UI/UX), refactors mecánicos en muchos archivos, sweeps tipo "migrar todos los CTAs a Foundation Button".

**Por qué importa:** el sprint del audit UI 22-abr usó 4 agentes en paralelo (multi-agente) y cerró 33/38 hallazgos en una tarde. Ese patrón se puede repetir más seguido.

**Cómo invocar:** Claude lo elige solo cuando ve 2+ tareas independientes, pero podés forzarlo: "esto en paralelo".

---

### 5. `document-release` (gstack) — al final de cada sprint

**Qué hace:** lee toda la documentación del proyecto, cruza contra el diff del sprint, actualiza README/ARQUITECTURA/SPRINT_LOG/CHANGELOG/CLAUDE.md de forma consistente.

**Cuándo invocar:** al final de cada sprint, antes del último push.

**Por qué hoy no la usamos:** actualizamos docs a mano. Es lento, propenso a olvidar archivos. CLAUDE.md ya tiene la regla "DOCUMENTACIÓN al final de cada sprint" pero la ejecutamos manual.

**Cómo invocar:** "actualizá los docs del sprint" o "document-release"

---

## Otras skills que vale la pena tener en mente

| Skill | Cuándo |
|-------|--------|
| `test-driven-development` (superpowers) | Para código del motor (`src/golf/**`). Tests primero, código después. Es la única zona donde el costo de bug es desproporcionado. |
| `verification-before-completion` (superpowers) | Cuando termino algo y voy a decir "listo". Fuerza correr verificación real antes de afirmar éxito. |
| `design-shotgun` (gstack) | Cuando dudamos sobre cómo se ve algo. Genera 5+ variantes de diseño para comparar. |
| `frontend-design` | Para pantallas premium nuevas. Anti-AI-slop. |
| `qa` (gstack) | QA visual completo + fix iterativo. Bloqueado hoy por Device Guard de Windows en el headless browser. |
| `setup-browser-cookies` (gstack) | Para destrabar `qa` autenticado cuando se pueda usar el browser. |
| `retro` (gstack) | Retrospectiva semanal/mensual con métricas reales (commits, contribuciones, calidad). |
| `vercel:vercel-functions` | Si dudamos de runtime de una API route (Node vs Edge, timeout, etc.). |
| `vercel:env-vars` | Cuando agreguemos/cambiemos env vars en Vercel. |

---

## Skills que NO recomendamos usar hoy

Para no perder tiempo:

- **`vercel:next-forge`** — somos monolito, no monorepo Turborepo.
- **`vercel:chat-sdk`** — no tenemos chatbots multi-plataforma.
- **`vercel:vercel-sandbox`** — no ejecutamos código de usuarios.
- **`vercel:next-upgrade`** — solo cuando explícitamente decidamos pasar a Next 15.
- **`gstack:design-html`** — generamos HTML directo en React, no necesitamos otro pipeline.
- **`claude-mem:knowledge-agent`** — overlapping con la memoria que ya tenemos.
- **`browse` / `qa` autenticado** — bloqueado por Device Guard en Windows hasta que se resuelva.

---

## Cómo evoluciona este doc

Este doc no es estático. Cada vez que:

- Agreguemos un plugin → revisar si hay skill nueva relevante.
- Una skill recomendada se vuelva uso habitual → moverla a `COMANDOS.md`.
- Una skill recomendada no se use en 2 meses → bajarla a "no recomendamos hoy" o eliminarla del doc.

Mantener este doc actualizado es responsabilidad del CTO (Claude). Revisar mensualmente.
