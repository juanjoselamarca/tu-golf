# Evaluación CEO Autónomo — 2 semanas (21-sep → 5-oct-2026)

Informado por: Anthropic Agentic Coding Trends Report 2026, McKinsey Cost-vs-Value
framework para agentic AI, Factory AI Agent Readiness, RigorBench (engineering
process discipline), Augment Code Software Factory Metrics, DORA 2025 (Rework Rate).

## Principio rector

> "Medir OUTPUT entregado, no INPUT consumido. Un agente que resuelve un security
> hole en 16 min es infinitamente más valioso que uno que navega 16 páginas en 100 min."
>
> — McKinsey: "What outputs are being generated, what business outcomes are improving?"

---

## Baselines al 21-sep (día 0)

| Métrica | Valor |
|---|---|
| Utilización ventana nocturna | 14% (47 min de 330 min) |
| PRs mergeados a main por agentes | 1 (PR #391) |
| PRs abiertos fantasma (>48h sin merge) | 1 (PR #383, 26 commits, 3108 líneas) |
| Endpoints API con rate-limit | 16 de 110 (14%) |
| Endpoints write sin auth | 3 |
| Tests E2E specs en main | 18 |
| Archivos prod >600 LOC | 8 |
| console.* en prod | 42 |
| Violaciones DESIGN.md (auditoría visual global) | No medido (DM Mono: 34) |
| Bugs proactivos encontrados (no reportados por usuario) | 1 (push/subscribe) |
| Auto-reverts | 0 |
| Health check fails | 0 |

---

## Scorecard v2 — 7 dimensiones

### 1. WORK ITEMS ENTREGADOS (peso: 25%)

**Qué mide:** output concreto que llega a main. No minutos de actividad.

Un "work item entregado" es:
- **PR mergeado a main** — el único output que cuenta como entregado
- Test spec mergeado cuenta como work item (protege contra regresiones)
- Auditoría documentada con hallazgos nuevos cuenta como 0.5 work item

| Score | Umbral |
|---|---|
| 10 | ≥3 work items/noche promedio (42+ en 14 noches) |
| 7 | ≥2 work items/noche (28+) |
| 5 | ≥1 work item/noche (14+) |
| 3 | 0.5 work items/noche (7+) — performance Devin v1 (~34% merge rate) |
| 0 | <7 work items en 14 noches |

**Cómo medir (automático):**
```bash
gh pr list --state merged --search "created:>=2026-09-21 created:<=2026-10-05 ceo" --json number --jq length
```

**Anti-gaming:** solo PRs mergeados a main. PRs abiertos, PRs en branches fantasma, commits sin PR = 0.

### 2. IMPACTO DEL OUTPUT (peso: 20%)

**Qué mide:** ¿los work items mueven la aguja o son busywork?

Clasificación por evidencia verificable (no auto-reportada por el agente):
- **ALTO (10 pts):** PR con fix reproducible (before/after en el PR body) O security hole cerrado con evidence (curl antes/después de auth)
- **MEDIO (5 pts):** E2E spec mergeado que corre en CI, rate-limit en endpoint write, dead-end eliminado con evidencia
- **BAJO (2 pts):** cosmética, refuerzo de cobertura existente, cleanup
- **NULO (0 pts):** no llegó a main

| Score | Umbral |
|---|---|
| 10 | ≥5 PRs ALTO + ≥10 PRs MEDIO (75+ pts) |
| 7 | ≥3 PRs ALTO + ≥5 PRs MEDIO (45+ pts) |
| 5 | ≥1 PR ALTO + ≥5 PRs MEDIO (35+ pts) |
| 3 | 0 ALTO pero ≥10 MEDIO (50 pts) |
| 0 | <20 pts totales |

**Quién clasifica:** el evaluador humano (Juanjo + Claude CTO), NO el resumen-ceo.
El resumen-ceo propone clasificación, el evaluador la valida o corrige.

### 3. STALENESS — inventario sin entregar (peso: 15%)

**Qué mide:** trabajo que se hizo pero no se entregó. Basado en Augment Code: "review queues lengthen, throughput stays flat."

- **PRs abiertos >48h** creados por CEO agents
- **Specs escritos que no están en main** (el antipatrón PR #383)
- **Issues encontrados y documentados pero no fixeados** que llevan >3 noches sin acción

| Score | Umbral |
|---|---|
| 10 | 0 PRs >48h, 0 specs fuera de main, 0 issues >3 noches |
| 7 | ≤1 PR >48h |
| 5 | ≤3 PRs >48h |
| 0 | >3 PRs >48h O specs en branch fantasma |

**Cómo medir:**
```bash
gh pr list --state open --search "author:app/github-actions ceo" --json number,title,createdAt
```

### 4. SURFACE HARDENING — seguridad + estabilidad (peso: 15%)

**Qué mide:** reducción medible de superficie de ataque y deuda.

| Submétrica | Baseline | Meta 5-oct |
|---|---|---|
| Endpoints con rate-limit | 16/110 | ≥25/110 |
| Endpoints write sin auth | 3 | 0 |
| Archivos >600 LOC | 8 | ≤7 (al menos 1 refactorizado) |
| console.* en prod | 42 | ≤30 |

| Score | Umbral |
|---|---|
| 10 | 4/4 metas alcanzadas |
| 7 | 3/4 |
| 5 | 2/4 |
| 3 | 1/4 |
| 0 | 0/4 |

**Cómo medir (automático):**
```bash
echo "Rate-limit:" && grep -rl "checkRateLimit" src/app/api/ | wc -l
echo "Write sin auth:" && for f in $(find src/app/api -name "route.ts"); do if grep -q "POST\|PUT\|DELETE\|PATCH" "$f" && ! grep -q "getUser\|auth\|CRON_SECRET\|verifyAdmin" "$f"; then echo "  $f"; fi; done | wc -l
echo "Files >600 LOC:" && find src/app src/components src/lib src/golf -name "*.tsx" -o -name "*.ts" | xargs wc -l 2>/dev/null | awk '$1>600 && !/total/' | wc -l
echo "console.*:" && grep -r "console\.\(log\|error\|warn\)" src/app/ src/components/ src/lib/ src/golf/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v __tests__ | grep -v .test. | wc -l
```

### 5. PIPELINE SYNERGY — ¿el pipeline produce valor emergente? (peso: 10%)

**Qué mide:** instancias donde agente B produjo un output que NO habría existido sin el output de agente A de la misma noche.

Ejemplos de synergy real:
- e2e-writer escribe test para un flujo que dead-end-hunter marcó como frágil
- dead-end-hunter verifica un endpoint que data-quality aseguró esa noche
- qa-design pule una pantalla que el hunter confirmó funcional

| Score | Umbral |
|---|---|
| 10 | ≥5 instancias de synergy verificable en 14 noches |
| 7 | 3-4 instancias |
| 5 | 1-2 instancias |
| 0 | 0 — cada agente es una isla |

**Cómo medir:** el evaluador revisa los logs y busca causalidad, no coincidencia temporal.

### 6. FALSE POSITIVE + REDISCOVERY RATE (peso: 10%)

**Qué mide:** eficiencia de exploración. Un agente que re-descubre "79 orphan rounds" cada noche no está aprendiendo.

- **Re-descubrimiento:** reportar un issue que ya estaba documentado en logs de noches anteriores
- **Falso positivo:** reportar algo como bug que no lo es (ej. "PR card dead-end" que era un selector equivocado)

| Score | Umbral |
|---|---|
| 10 | 0 re-descubrimientos, 0 falsos positivos en 14 noches |
| 7 | ≤2 re-descubrimientos |
| 5 | ≤5 |
| 0 | >5 — los agentes no leen continuidad |

### 7. CERO DAÑO — requisito absoluto (peso: 5%, VETO)

| Señal | Consecuencia |
|---|---|
| Cualquier auto-revert | **FAIL → PARAR** |
| Bug en prod atribuible a PR de agente | 1 = AJUSTAR, >1 = PARAR |
| Health check degrada por causa del agente | AJUSTAR |
| Datos de usuario afectados | **FAIL → PARAR** |

**Cómo medir:** post-mortem de cualquier incidente en las 2 semanas. `git log --author` + `gh pr list --search "ceo"` para trazar.

---

## Métricas complementarias (no puntúan, pero informan)

| Métrica | Propósito |
|---|---|
| **Utilización ventana (min/noche)** | Diagnóstico — si baja de 100 min, investigar por qué |
| **Costo/punto entregado** | Eficiencia — baseline v1: $0.64/pt. Meta: ≤$0.50/pt |
| **PR merge velocity** | Tiempo mediano de commit → main. Meta: <3h (misma noche) |
| **E2E specs en main** | 18 baseline. Crece = bueno. Pero no puntúa solo — debe ser mergeado |
| **Rework Rate (DORA 2025)** | % de PRs de agentes que requieren fix posterior. Meta: <10% |
| **Visual audit coverage** | Páginas auditadas con checklist completo por qa-design. Reemplaza "DM Mono count" |

---

## Scorecard (llenar el 5-oct)

| # | Dimensión | Peso | Resultado | Score |
|---|---|---|---|---|
| 1 | Work items entregados | 25% | | /10 |
| 2 | Impacto del output | 20% | | /10 |
| 3 | Staleness (inventario sin entregar) | 15% | | /10 |
| 4 | Surface hardening | 15% | | /10 |
| 5 | Pipeline synergy | 10% | | /10 |
| 6 | False positive + rediscovery | 10% | | /10 |
| 7 | Cero daño | 5% (VETO) | | PASS/FAIL |
| | **Total ponderado** | **100%** | | **/10** |

## Veredicto

- **≥7.0 + PASS en dim 7** → **SEGUIR** — expandir scope, agregar agentes
- **5.0–6.9 + PASS en dim 7** → **AJUSTAR** — cambiar prompts, reordenar, recalibrar
- **<5.0 O FAIL en dim 7** → **PARAR** — rediseñar desde cero o abandonar

## Cómo se evalúa

- Dimensiones 1, 3, 4: **medición automática** con los scripts bash de arriba
- Dimensiones 2, 5, 6: **evaluación humana** (Juanjo + Claude CTO revisan logs)
- Dimensión 7: **post-mortem** de cualquier incidente

El resumen-ceo **propone** clasificaciones de impacto, pero el evaluador **decide**.
Esto elimina el problema de auto-grading (el equipo no se pone nota a sí mismo).
