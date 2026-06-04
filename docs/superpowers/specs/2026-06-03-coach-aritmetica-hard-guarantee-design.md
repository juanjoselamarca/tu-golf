# Diseño — Garantía dura contra números errados del coach tAIger+

**Fecha:** 2026-06-03
**Autor:** Claude (CTO)
**Estado:** Diseño aprobado por PM (Juanjo) — pendiente plan-eng-review
**Follow-up de:** PR #87 (soft guardrail `ARITMETICA` ya en prod)
**Memoria:** `project-coach-aritmetica-hard-guarantee`

---

## Resumen ejecutivo (en simple)

El coach a veces inventa cuentas mal (dijo "7 pares + 8 bogeys + 3 dobles = 79", cuando eso da **86**). Hoy hay un recordatorio en sus instrucciones que pide "revisá la suma", pero sigue siendo la IA haciendo la cuenta a mano → **no es garantía**.

**La solución:** que el coach **nunca escriba un número que tuvo que calcular**. En vez de escribir "79", escribe una marca tipo `[objetivo]`, y una **calculadora del sistema** (código determinista, siempre correcto) rellena esa marca antes de mostrar el mensaje. Es imposible que el número esté mal porque la IA nunca lo escribió — como un formulario "Estimado [NOMBRE], su saldo es [MONTO]" donde el sistema rellena el monto.

Esto reemplaza el enfoque riesgoso de "dejar que escriba el número y corregirlo después" (lector de texto frágil que se pudre en silencio) por uno **seguro por construcción**.

---

## 1. Problema

### 1.1 El bug

El coach es un LLM (Claude Sonnet 4.6) que **streamea su respuesta en vivo** (`src/app/api/taiger/chat/route.ts`: cada `text_delta` se manda al cliente apenas llega). El LLM construye desgloses de score "de cabeza" en prosa libre y se equivoca en la aritmética:

> "Si hacés 7 pares + 8 bogeys + 3 dobles = **79**"

Sobre par real = 8×1 + 3×2 = **+14** → en par 72 eso es **86**, no 79. El número falso ya llegó a pantalla.

### 1.2 Por qué lo actual no alcanza

- **Soft guardrail (`prompts/aritmetica.ts`, PR #87):** un bloque de prompt con la fórmula + auto-chequeo. Baja el riesgo pero **depende de que el LLM se autocorrija** → no es garantía matemática.
- **Validador anti-alucinación (`hallucination-validator.ts`):** corre post-stream, pero solo chequea que los números **aparezcan en el contexto/tools**. NO chequea **cierre aritmético**. El "79" del bug pasa limpio porque no es un número alucinado de afuera, es una suma interna mal hecha.
- **Streaming:** cuando la respuesta termina, el usuario **ya vio** el número. Un corrector post-respuesta no puede "des-mostrar" un token enviado.

### 1.3 Decisión de producto (Juanjo, 2026-06-02/03)

1. **Alcance:** *todos* los números del coach (score + índice + %), con el matiz de que se protege por **procedencia** (ver §3), no cardeando cada cifra trivial.
2. **Display:** el número se calcula en código y se rellena/renderiza; el coach nunca lo escribe a mano. Se mantiene el streaming.

---

## 2. Principio rector — la invariante

> **Ningún número que el coach haya tenido que *calcular* llega al usuario escrito por el LLM. Todo número calculado lo produce una calculadora determinista y el sistema lo rellena/renderiza. Cualquier número crudo que el LLM intente colar sin pasar por la calculadora se bloquea antes de mostrarse.**

Garantía **por construcción**, no por revisión. La IA no puede equivocarse en un número que nunca escribió.

---

## 3. Clasificación de números (qué se protege y cómo)

| Tipo | Ejemplo | Origen | Tratamiento |
|---|---|---|---|
| **Derivado** (peligroso) | objetivo "79", desglose "11 pares + 7 bogeys", delta "bajaste 3 décimas", "+12% de GIR" | el LLM lo **construye** combinando datos | **Marca → calculadora rellena.** Nunca lo escribe el LLM. |
| **Pass-through** | "tu índice es 18", "tu promedio es 86" (cifra que ya existe calculada en contexto/tools) | dato ya computado | Idealmente también via marca ligada al dato; si va en prosa, el **guard** verifica que coincide con el dato real. |
| **No-score** (ignorar) | "practicá 45 min", "el hoyo 7", "hace 3 semanas" | duración / nº de hoyo / tiempo | **Whitelist** — no es claim de score, no se toca (reusar lógica de `DURATION_PATTERN` y rangos del validador actual). |

El alcance "todos los números" se cumple así: **derivados** por construcción, **pass-through** por verificación, **no-score** excluidos explícitamente.

---

## 4. Arquitectura

### 4.1 Componentes nuevos

```
┌─────────────────────────────────────────────────────────────┐
│  src/golf/coach/scoring/   (NUEVO — calculadora determinista)│
│  · projectScore({ parTotal, targetOver }) → desglose válido  │
│  · realisticTarget({ indice, avgScore, parTotal }) → objetivo│
│  · computeDelta(...) / formatRelative(...) → +N sobre par    │
│  Funciones PURAS. Sin I/O. Test unitario exhaustivo.         │
└─────────────────────────────────────────────────────────────┘
                          ▲
                          │ usa
┌─────────────────────────────────────────────────────────────┐
│  Mecanismo "el coach rellena marcas"                         │
│  El LLM emite marcas tipadas en vez de números calculados.   │
│  El sistema sustituye/renderiza con la salida de la          │
│  calculadora antes de mostrar.                               │
└─────────────────────────────────────────────────────────────┘
                          ▲
                          │ enforce
┌─────────────────────────────────────────────────────────────┐
│  Guard de números (upgrade de hallucination-validator)       │
│  Regla simple y robusta: si en la prosa hay un número de     │
│  score que NO salió de una marca/calculadora ni coincide con │
│  un dato real → se bloquea (no se adivina corrección).       │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Objetivo realista inyectado (opción B del brainstorm original)

`buildPlayerContext` / `TaigerContext` (`prompts/contexto.ts`) gana un campo `objetivo_realista` precomputado server-side desde índice/avg/par. Así el coach **no inventa** cuál es un objetivo razonable; arranca de un número confiable.

### 4.3 Mecanismo de marcas — decisión para plan-eng-review

Dos implementaciones posibles de "el coach pide un número y el sistema lo rellena". **El spec las deja planteadas; eng-review elige.**

- **Opción 1 — Tool determinista + card.** El LLM llama una tool `compute_score_projection(...)` (mismo patrón que `save_plan`/`get_latest_round` en `tools.ts`). El resultado se manda como evento SSE nuevo (`score_projection`) y el front lo pinta como **tarjeta** (reusa el patrón ya existente de `plan_assigned` / `round_summary`).
  - ✅ Reusa infra probada (tool loop + cards). Robusto.
  - ⚠️ El número sale en tarjeta, no inline en la frase → leve fricción con el estilo del coach (número *dentro* del mensaje, [[feedback_estilo_coach_comunicacion]]).

- **Opción 2 — Marcas inline + sustitución.** El LLM escribe `[[obj]]` / `[[desglose]]` inline; un paso de sustitución determinista los reemplaza por el valor calculado antes de flushear.
  - ✅ El número queda **inline** en la prosa → respeta el estilo del coach.
  - ⚠️ Requiere un mini-formato que el LLM debe emitir bien + sustitución sobre el stream.

**Lean del autor:** híbrido — **inline (opción 2)** para valores sueltos (objetivo, delta) que viven en la frase, y **card (opción 1)** para desgloses completos (la tabla "11 pares + 7 bogeys" es naturalmente una tarjeta). Eng-review confirma o simplifica a una sola.

### 4.4 El guard — qué hace exactamente

NO es el lector de texto frágil del enfoque descartado. Es un chequeo de **presencia/procedencia**, no de comprensión semántica:

1. Antes de mostrar el mensaje final, escanear números de score en la prosa.
2. Para cada uno: ¿salió de una marca/calculadora, o coincide *exactamente* con un dato real del contexto/tools?
   - Sí → pasa.
   - No → **se bloquea**. Política ante la duda (§6): el coach reescribe en "sobre par" o se retiene/regenera. **Nunca se adivina un reemplazo.**
3. Excluir whitelist no-score (duración, nº hoyo, rangos).

### 4.5 Flujo de datos (resumen)

```
Pregunta del usuario
   │
   ▼
buildPlayerContext  ──►  TaigerContext + objetivo_realista precomputado
   │
   ▼
LLM (Sonnet 4.6, streaming)
   │  · trabajo/tools en vivo (igual que hoy)
   │  · cuando necesita un número calculado → marca / tool (NO lo escribe)
   ▼
Calculadora determinista  ──►  número correcto + desglose que cierra
   │
   ▼
Sustitución (inline) / render (card)  +  Guard de procedencia
   │
   ▼
Pantalla  ──►  imposible que un número calculado esté mal
```

---

## 5. Edge cases

- **Par desconocido / cancha con datos sucios** (real hoy: "Los Leones" fragmentada en 3 variantes — obs 13100/13103). Si no hay `par_total` confiable, la calculadora **no emite score absoluto**; emite **"+N sobre par"** (imposible de errar sin par). El número absoluto solo sale con dato limpio.
- **Pass-through legítimo** ("tu índice es 18"): el guard lo deja pasar si coincide con el dato real; si no coincide, bloquea (sería el LLM tipeando mal un dato real).
- **Números no-score** (45 min, hoyo 7, 3 semanas): whitelist, se ignoran.
- **El LLM ignora la marca y escribe el número igual:** el guard lo caza (no salió de calculadora ni coincide con dato) → bloquea.
- **Rangos** ("entre 80 y 85"): la calculadora puede emitir rangos; el guard los reconoce como un solo claim.
- **Cerebro v3 / RAG ON:** el guard opera sobre la **salida final**, agnóstico a v2/v3 internos → no se rompe cuando v3 cambie el prompt.

---

## 6. Política ante la duda (regla de oro)

**Mejor no mostrar un número que mostrar uno mal.** El sistema **nunca adivina** una corrección. Si el guard no puede verificar un número:
1. Preferencia: el coach lo expresa en "sobre par" (siempre verificable).
2. Si no, se retiene y regenera ese mensaje.
3. Nunca se sustituye por un número "probable".

---

## 7. Testing

- **Set canario permanente** (`tests/regression/...`): el caso "7 pares + 8 bogeys + 3 dobles ≠ 79" + decenas de desgloses (válidos e inválidos, 9h y 18h, con y sin par conocido). Corre en CI **para siempre** → mata el riesgo de "se pudre en silencio".
- **Unit de la calculadora:** propiedad "todo desglose emitido cierra exactamente" sobre cientos de inputs aleatorios (property-based).
- **Unit del guard:** prosa con número trazable pasa; número fabricado bloquea; whitelist no-score pasa.
- **Smoke E2E** contra el coach real (extender `qa-coach-llm-smoke.mjs`): pedir proyecciones y verificar que ningún número de score sale sin pasar por calculadora.
- **Anti-decoración** [[feedback_anti_decoracion_wiring]]: canario que prueba **consumo en runtime** — la calculadora/guard no quedan construidos-pero-desconectados.

---

## 8. Riesgos y mitigaciones

| Riesgo | Severidad | Mitigación |
|---|---|---|
| Tocar la arteria del chat (`route.ts`) rompe el coach para todos | 🔴 Alta | Feature flag de apagado; tests + build + smoke pre-push; staging contra preview; cambio mínimo |
| Colisión con cerebro v3 (mismo coach, worktree paralelo) | 🟡 Media | Worktree propio; guard agnóstico a v2/v3 (opera en la salida) |
| Coach se vuelve rígido / pierde voz si se cardea de más | 🟡 Media | Inline para valores sueltos; cards solo para desgloses; respetar estilo 6-piezas |
| Garantía degrada donde el par está sucio | 🟡 Media | Fallback a "sobre par"; empuja limpieza de canchas (deuda ya conocida) |
| Sobre-ingeniería (cf. AI Gateway fase 3 rechazada) | 🟡 Media | Versión mínima; eng-review poda; una sola mecánica si alcanza |

---

## 9. Alcance — qué SÍ y qué NO

**SÍ (este trabajo):**
- Calculadora determinista `src/golf/coach/scoring/`.
- Mecanismo marca→relleno (inline y/o card).
- Objetivo realista inyectado en `TaigerContext`.
- Guard de procedencia (upgrade del validador a enforcement de números).
- Set canario + tests + smoke.
- **"El que toca, ordena":** `route.ts` (439 LOC, lógica de negocio embebida — criterio 3 de archivo sucio) → extraer tool-loop + guard a `src/golf/coach/` y dejar el handler delgado. Se informa, no se pregunta.

**NO (fuera de alcance):**
- Limpieza de canchas duplicadas (deuda aparte; este diseño la tolera vía fallback "sobre par").
- Rediseño del estilo conversacional del coach.
- Migración del coach al AI Gateway (proyecto separado).
- Voice/Vision (descartado).

---

## 10. Definición de "hecho"

- [ ] La calculadora emite desgloses que cierran al 100% (property test verde).
- [ ] El coach no puede mostrar un número de score calculado sin pasar por calculadora (guard verde, smoke E2E verde).
- [ ] Donde el par es desconocido, el coach habla en "sobre par".
- [ ] Set canario (incl. el caso 79/86) en CI, permanente.
- [ ] `route.ts` queda delgado; lógica en `src/golf/coach/`.
- [ ] Flag de apagado operativo; deploy a prod confirmado `success`.
- [ ] Demo en vivo a Juanjo antes del merge.

---

## Apéndice — archivos en juego

- `src/app/api/taiger/chat/route.ts` — arteria; insertar relleno+guard, extraer lógica.
- `src/golf/coach/prompts/aritmetica.ts` — actualizar: prohibir números calculados en prosa, mandar usar la calculadora.
- `src/golf/coach/prompts/contexto.ts` — agregar `objetivo_realista`.
- `src/golf/coach/tools.ts` — (si opción 1) tool `compute_score_projection`.
- `src/golf/coach/hallucination-validator.ts` — upgrade a guard de procedencia/cierre.
- `src/golf/coach/scoring/` — NUEVO, calculadora.
- `tests/regression/` — set canario aritmético.
