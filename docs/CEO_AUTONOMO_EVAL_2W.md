# Evaluación CEO Autónomo — 2 semanas (21-sep → 5-oct-2026)

## Baselines al 21-sep (día 0)

| Métrica | Valor actual |
|---|---|
| Utilización ventana nocturna | 14% (47 min de 330 min) |
| Endpoints API con rate-limit | 16 de 110 (14%) |
| Endpoints write sin auth | 3 |
| Tests E2E specs | 18 |
| E2E coverage scorer | 11 specs |
| E2E coverage torneos | 9 specs |
| E2E coverage perfil | 9 specs |
| Archivos >600 LOC prod | 8 |
| console.* en prod | 42 |
| Violaciones DESIGN.md (scores sin DM Mono) | 34 |

---

## Métricas de evaluación

### A. Utilización de ventana (¿trabajan o se van temprano?)

**Medición:** suma de minutos reales de los 4 agentes de trabajo / ventana total por noche.
Ventana total = 4 × 100 min = 400 min/noche.

| Resultado | Umbral |
|---|---|
| ✅ Positivo | >50% promedio (>200 min/noche de trabajo real) |
| ⚠️ Ajustar | 30-50% (120-200 min/noche) |
| ❌ Negativo | <30% (<120 min/noche) — misma situación que antes |

**Cómo medir:** `cat .claude/ceo-logs/<fecha>--orch-state.json` → sumar `duration` de agentes 1-4.

### B. Profundidad de QA (¿prueban a fondo o superficial?)

**Medición para dead-end-hunter:** contar flujos DISTINTOS testeados a fondo vs visitados superficialmente.
Un flujo "a fondo" = al menos 3 interacciones encadenadas (click → verificar → siguiente acción).
Un flujo "superficial" = solo navegar + verificar que carga.

| Resultado | Umbral |
|---|---|
| ✅ Positivo | >3 flujos a fondo por noche, con edge cases |
| ⚠️ Ajustar | 1-3 flujos a fondo pero sin edge cases |
| ❌ Negativo | Solo smoke (visitar 10+ páginas, 0 interacciones profundas) |

**Cómo medir:** leer los logs del hunter y contar interacciones con assertiones de datos (no solo "¿carga?").

### C. Cobertura de seguridad (¿cierran huecos?)

**Baselines:**
- Endpoints con rate-limit: 16/110 (14%)
- Endpoints write sin auth: 3

| Resultado | Umbral |
|---|---|
| ✅ Positivo | Rate-limit sube a >25/110. Endpoints write sin auth = 0. Al menos 2 fixes de security mergeados. |
| ⚠️ Ajustar | Rate-limit sube pero <25. Endpoints write sin auth bajan pero no llegan a 0. |
| ❌ Negativo | Rate-limit igual o baja. Endpoints write sin auth no se tocan. |

**Cómo medir:**
```bash
grep -rl "checkRateLimit" src/app/api/ | wc -l
# Endpoints write sin auth:
for f in $(find src/app/api -name "route.ts"); do
  if grep -q "POST\|PUT\|DELETE\|PATCH" "$f" && ! grep -q "getUser\|auth\|CRON_SECRET\|verifyAdmin" "$f"; then
    echo "$f"
  fi
done
```

### D. Cobertura E2E (¿los tests que escriben protegen algo real?)

**Baselines:** 18 specs.

| Resultado | Umbral |
|---|---|
| ✅ Positivo | >25 specs (+7), al menos 2 specs mergeados a main (no en PR abierto fantasma). Al menos 1 test catcheó una regresión real. |
| ⚠️ Ajustar | 20-25 specs pero ninguno catcheó regresión. Tests mergeados pero no agregan cobertura nueva (refuerzan lo existente). |
| ❌ Negativo | <20 specs o specs en PR abierto sin mergear (repetir el problema de PR #383). |

**Cómo medir:**
```bash
ls e2e/*.spec.ts | wc -l
# Specs mergeados vs en PRs abiertos:
gh pr list --state open --search "e2e OR test" --json number,title
```

### E. Deuda visual (¿qa-design reduce violaciones?)

**Baselines:**
- Violaciones DM Mono en scores: 34
- console.* en prod: 42

| Resultado | Umbral |
|---|---|
| ✅ Positivo | Violaciones DM Mono <15 (-50%). Al menos 3 PRs de design polish mergeados. Screenshots before/after en los logs. |
| ⚠️ Ajustar | Violaciones bajan pero <30%. PRs de design pero sin evidencia visual. |
| ❌ Negativo | Violaciones iguales o suben. qa-design no produce PRs o produce solo cosmética. |

**Cómo medir:**
```bash
grep -r "font-mono\|fontFamily.*mono" src/app/ronda-libre/ src/app/perfil/historial/ | grep -v "DMMono\|dm-mono" | wc -l
```

### F. Deuda técnica (¿refactorizan archivos sucios?)

**Baselines:** 8 archivos >600 LOC productivos.

| Resultado | Umbral |
|---|---|
| ✅ Positivo | Al menos 1 archivo refactorizado al estándar (<500 LOC). console.* baja a <30. |
| ⚠️ Ajustar | 0 refactors completos pero console.* baja. |
| ❌ Negativo | 0 refactors, console.* igual. Los agentes no tocan deuda porque siempre "algo más urgente". |

### G. Pipeline como sistema (¿se leen entre sí?)

**Medición:** evidencia en los logs de que un agente usó output de otro agente de LA MISMA NOCHE.
Ej: e2e-writer lee pendientes-hunter.md del mismo día y escribe test para un flujo que el hunter probó.

| Resultado | Umbral |
|---|---|
| ✅ Positivo | >5 instancias de lectura cruzada en 14 noches |
| ⚠️ Ajustar | 1-4 instancias — funciona pero no es consistente |
| ❌ Negativo | 0 — cada agente es una isla, el orden del pipeline no importó |

**Cómo medir:** grep en logs por lectura de archivos de otros agentes:
```bash
# En el log del e2e-writer, buscar si leyó pendientes del hunter:
grep "pendientes-hunter\|data-quality-estado" .claude/ceo-logs/<fecha>-0530-e2e-writer.log
```

### H. Descubrimiento proactivo (¿encuentran cosas que nadie reportó?)

| Resultado | Umbral |
|---|---|
| ✅ Positivo | >3 bugs/issues encontrados y fixeados que ningún usuario había reportado (como el endpoint push/subscribe sin auth) |
| ⚠️ Ajustar | 1-2 descubrimientos proactivos |
| ❌ Negativo | 0 — solo encuentran lo que ya se sabía o lo que está documentado |

### I. Cero daño (requisito absoluto, no negociable)

| Señal | Evaluación |
|---|---|
| Auto-reverts | >0 = PARAR inmediatamente |
| Health check degrada | Fails suben semana a semana = AJUSTAR |
| Bug introducido por agente | >1 = AJUSTAR. >3 = PARAR |
| Datos de usuario afectados | Cualquier incidente = PARAR |

---

## Scorecard resumen (llenar el 5-oct)

| Dimensión | Peso | Resultado | Score |
|---|---|---|---|
| A. Utilización ventana | 15% | | /10 |
| B. Profundidad QA | 15% | | /10 |
| C. Seguridad | 15% | | /10 |
| D. Tests E2E | 10% | | /10 |
| E. Deuda visual | 10% | | /10 |
| F. Deuda técnica | 10% | | /10 |
| G. Pipeline sistema | 10% | | /10 |
| H. Descubrimiento proactivo | 10% | | /10 |
| I. Cero daño | 5% (veto) | | PASS/FAIL |
| **Total ponderado** | 100% | | **/10** |

### Veredicto

- **>7/10 + PASS en I** → SEGUIR, expandir
- **5-7/10 + PASS en I** → AJUSTAR prompts/orden/scope
- **<5/10 O FAIL en I** → PARAR, rediseñar desde cero
