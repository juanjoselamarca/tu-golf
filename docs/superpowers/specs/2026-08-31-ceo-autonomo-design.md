# CEO Autónomo — Spec de Diseño

**Fecha:** 2026-08-31
**Autor:** Claude (CTO) + Juanjo (PM)
**Estado:** Aprobado para implementación

## Problema

Juanjo trabaja de día en BICECORP. Golfers+ solo avanza en sesiones nocturnas/fin de semana. La app necesita estar blindada al 100% antes de ofrecerla a clubes — si falla, no hay segunda oportunidad. El cuello de botella es tiempo, no capacidad.

## Solución

Un scheduler local que lanza 5 sesiones de Claude Code al día, cada una con un rol especializado. Autonomía total: diagnostica, construye, fixea, mergea, deploya, reporta. Juanjo recibe un resumen diario por Telegram y solo interviene en decisiones de producto.

## Principio rector

**60% ofensivo / 40% defensivo.** El sistema no solo mantiene la app — la avanza hacia el 100%. Cada día la app debe estar más cerca de poder ofrecerse a clubes.

## Arquitectura

### Proceso principal: `scripts/ceo-autonomo.mjs`

- Proceso Node.js long-lived
- Corre al login via Task Scheduler de Windows
- Schedule interno con hora fija para cada agente
- Cada corrida es independiente y aislada en worktree

### Flujo de cada corrida

```
1. git pull origin main
2. Crear worktree: node scripts/setup-worktree.mjs ceo-<agente> <prefix>
3. Junction node_modules al worktree
4. Lanzar: claude -p "<prompt>" --allowedTools "Edit,Write,Read,Bash,Grep,Glob,Agent"
5. Capturar stdout → .claude/ceo-logs/YYYY-MM-DD-HH-<agente>.log
6. Si produjo commits → push → gh pr create → gh pr merge --squash --admin
7. Poll Vercel hasta READY
8. Smoke post-deploy (curl endpoints + Playwright headless)
9. Si smoke falla → git revert + push + log error
10. Cleanup: remover junction, remover worktree, borrar branch
11. Escribir resultado → .claude/ceo-logs/YYYY-MM-DD-resumen-parcial.json
```

### Protecciones

- **Auto-revert:** si smoke post-deploy falla, revierte el merge commit automáticamente
- **Worktree aislado:** nunca edita main directo, nunca conflicta con trabajo nocturno
- **Cap por corrida:** cada agente tiene un máximo de fixes/cambios por sesión
- **Priorización por roadmap:** cada agente lee ROADMAP_COMPLETO.md y prioriza por impacto en usuario final
- **Archivos protegidos:** respeta el protocolo de CLAUDE.md (Navbar, layout, middleware, supabase client)

## Los 5 agentes

### 1. Flow Completo E2E (9:00) — OFENSIVO

**Misión:** Ejecutar 1 flujo completo de usuario de punta a punta. Todo lo que no funcione, esté incompleto, o sea confuso → implementar o fixear.

**Perfiles rotativos (lunes→viernes):**
- Lun: Scorer solo — crear ronda → seleccionar cancha → scorear 18 hoyos → ver resultados → ver en historial → ver en coach
- Mar: Organizador — crear torneo → configurar formato → invitar jugadores → abrir scoring → cerrar → ver podio
- Mié: Invitado — entrar sin cuenta → unirse a ronda → scorear → ver prompt de registro → registrarse → ver historial
- Jue: Golfista con historial — importar CSV → ver handicap → ver tendencias → ver coach → compartir scorecard
- Vie: Multi-formato — crear rondas en best_ball, scramble, foursome, stroke_play → verificar leaderboard de cada una

**Cap:** 3 fixes máximo por corrida.
**Herramientas:** Playwright headless contra prod, código fuente, tsc, build, tests.

### 2. Dead-End Hunter + Feature Completer (11:30) — OFENSIVO

**Misión:** Navegar CADA botón, CADA link, CADA estado posible y verificar que tenga lógica. Cerrar features que están al 70%.

**Flujo:**
1. Leer ROADMAP_COMPLETO.md → identificar features incompletas ordenadas por prioridad
2. Leer docs/PLAN_EJECUCION_CEO_AGO2026.md → contexto de la fase actual
3. Navegar la ruta correspondiente con Playwright
4. Clickear CADA botón, CADA link → verificar que hace algo coherente
5. Si un botón no hace nada → implementar la lógica O quitar el botón (no dead-ends)
6. Si una feature está al 70% → completar el 30% restante
7. Si requiere decisión de producto → documentar y saltar

**Cap:** 2 features completadas o 4 dead-ends eliminados por corrida.
**Priorización:** scorer > torneos > historial > coach > admin.

### 3. QA + Design (14:00) — DEFENSIVO

**Misión:** Auditar bugs + polish visual en las rutas que tocaron los agentes de la mañana.

**Checklist QA:**
- Verificar que los fixes de la mañana no rompieron flujos adyacentes
- Probar edge cases del área tocada (0 datos, muchos datos, datos inválidos)
- Verificar responsive 390px en las pantallas modificadas

**Checklist Design:**
- Contraste WCAG AA en todos los textos
- Touch targets >= 44px en mobile
- Consistencia con DESIGN.md (paleta, tipografía, spacing)
- Dark mode vs light mode — nada hardcodeado por color
- No AI slop (no gradients chillones, no emojis cartoon, no ornament infantil)

**Cap:** 3 fixes (bugs + visuales combinados) por corrida.

### 4. Refactor + Security + Data Quality (16:30) — DEFENSIVO

**Misión:** Health check, refactor de deuda técnica, auditoría de seguridad, calidad de datos.

**Prioridad:**
1. Health check (`/api/admin/health-check`) → si hay FAILs, fixear primero
2. Data quality: auditar BD por inconsistencias (canchas sin par, rondas sin recorrido, perfiles desactualizados)
3. Si health + data están limpios → elegir 1 archivo sucio (>600 LOC) y refactorizar
4. Security spot check: 1 área por día (rate limits, RLS, input validation, auth, secrets)

**Cap:** 1 refactor O 2 fixes (security/data) por corrida.

### 5. Resumen CEO (18:00) — OPERATIVO

**Misión:** Consolidar resultados del día, reportar a Telegram, actualizar tracking.

**NO modifica código.**

**Flujo:**
1. Leer todos los .claude/ceo-logs/YYYY-MM-DD-*.log
2. Leer .claude/ceo-logs/YYYY-MM-DD-resumen-parcial.json
3. Armar resumen con: fixes, features completadas, refactors, auto-reverts, score de salud
4. Enviar a Telegram via bot existente
5. Actualizar docs/CEO_AUTONOMO_TRACKING.md con métricas del día
6. Cada 2 semanas (viernes): reporte de evaluación con métricas acumuladas

**Formato Telegram:**
```
📊 CEO Autónomo — [fecha]

⚡ Ofensivo:
  • [N] flujos E2E verificados
  • [N] dead-ends eliminados
  • [N] features completadas
  • PRs: #X, #Y, #Z

🛡️ Defensivo:
  • [N] bugs fixeados
  • [N] fixes visuales
  • [N] archivos refactorizados
  • Salud: [antes] → [después]

❌ Auto-reverts: [N]
📈 Avance estimado: [X]% → [Y]%
```

## Evaluación cada 2 semanas

Cada 2 viernes el Resumen CEO genera un reporte especial:

**Métricas duras:**
- PRs mergeados exitosamente vs auto-revertidos
- Bugs encontrados y fixeados (acumulado)
- Dead-ends eliminados (acumulado)
- Features completadas (acumulado)
- Archivos sucios restantes (de los 9 originales)
- Score de salud: tendencia

**Preguntas para Juanjo:**
- ¿Los fixes que hizo fueron útiles o ruido?
- ¿Algún agente está perdiendo tiempo en cosas fuera de foco?
- ¿Hay que ajustar prioridades o scope?
- ¿Seguimos, ajustamos, o paramos?

## Requisitos técnicos

- PC encendida durante el día
- Claude Code CLI autenticado (`claude` disponible en PATH)
- Node.js 20+ con acceso a .env.local
- Chrome NO requerido (Playwright headless)
- Tokens de Claude: monitorear consumo — si supera 60% del cupo a mitad de mes, reducir a 3 corridas/día

## Archivos que se crean

- `scripts/ceo-autonomo.mjs` — scheduler principal
- `scripts/ceo-prompts/flow-e2e.md` — prompt agente 1
- `scripts/ceo-prompts/dead-end-hunter.md` — prompt agente 2
- `scripts/ceo-prompts/qa-design.md` — prompt agente 3
- `scripts/ceo-prompts/refactor-security-data.md` — prompt agente 4
- `scripts/ceo-prompts/resumen-ceo.md` — prompt agente 5
- `docs/CEO_AUTONOMO_TRACKING.md` — tracking diario de métricas
- `.claude/ceo-logs/` — directorio de logs (gitignored)

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Agente rompe prod | Auto-revert + smoke post-deploy obligatorio |
| Consume todo el cupo de tokens | Monitor de uso, reducir corridas si >60% a mitad de mes |
| OneDrive bloquea archivos | Worktrees aislados, junction para node_modules |
| Conflicto con trabajo nocturno de Juanjo+Claude | Worktrees separados, main siempre limpio |
| Agente hace cambios inútiles o fuera de foco | Evaluación cada 2 semanas, caps por corrida |
| Prioriza mal (admin panel vs scorer) | Priorización explícita en prompt: scorer > torneos > historial > coach > admin |
