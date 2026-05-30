# Evaluación RAG — Cerebro V3 Sub-Ola 1e (2026-05-29)

Evaluación del retrieval de reglas oficiales contra el corpus real ingestado.
Pedido de Juanjo: "probar el coach con ~10 preguntas de ejemplo y evaluar qué
mejorar". Acá están los resultados + qué hay que mejorar.

## Corpus ingestado (prod)

| Fuente | Idioma | Chunks | Costo prefixes |
|---|---|---|---|
| usga-rules-of-golf-2023 | EN | 235 | $0.12 |
| usga-clarifications-2026 | EN | 13 | $0.008 |
| usga-local-rules-2023 | EN | 6 | $0.004 |
| whs-rules-of-handicapping-2024 | EN | 85 | $0.045 |
| fedegolf-chile-rno | ES | 33 | $0.025 |
| **Total** | — | **372** | **$0.19** |

Embeddings: Gemini `gemini-embedding-001` dim=1536, free tier ($0). Reranker:
OFF (hybrid puro — el ONNX local es incompatible con Vercel, ver C1 del review).

> Nota: el plan estimaba "≥8000 chunks". Era irreal — el parser es estructural
> (1 chunk = 1 sección de regla), lo correcto para reglas. 372 chunks es el
> tamaño natural del corpus.

## Resultados

### Banco de pruebas (20 preguntas de reglas) — `eval-rag-bench.mjs`
- **Sin `taskType`:** 17/20 (85%) — fallaban "obstrucción inamovible", "agua
  casual", "bola embebida".
- **Con `taskType` (RETRIEVAL_QUERY/DOCUMENT):** **20/20 (100%)** ✅. Además
  corrigió mismatches ("match play" → Rule 3 en vez de Rule 12; "out of bounds"
  → Rule 18). Mejora gratis y decisiva.

### Smoke anti-hallucination (5 queries sin sentido) — `smoke-rag.mjs`
- **3/5 falsos positivos** tras taskType: "mejor marca de bola", "recetas para
  cocinar", e incluso "asdfgh nonsense" devuelven ≥2 chunks sobre 0.4.

## Hallazgos

1. **Recall: excelente (100%).** El corpus + hybrid + taskType encuentra la
   regla correcta para las 20 preguntas reales en español.

2. **Precisión / anti-hallucination: débil — ES EL PUNTO A MEJORAR.** El umbral
   0.4 ya no separa señal de ruido: taskType subió TODO el rango de scores
   (~0.42–0.53 para reglas reales), y queries irrelevantes ("recetas", gibberish)
   también superan 0.4. No hay un umbral único que mantenga 100% recall y
   bloquee ruido, porque hybrid-only (sin reranker) da scores comprimidos.

3. **Causa raíz de scores comprimidos:** el corpus USGA/WHS está en **inglés** y
   las queries en **español** (solo FedeGolf es ES). El matching es cross-lingual
   vía vector (BM25 'simple' aporta ~0 entre idiomas distintos), lo que aprieta
   el rango de similitud.

## Conversaciones reales con el coach (`eval-coach-conversations.mjs`)

10 preguntas a través del loop real (Anthropic Sonnet + tool + corpus). Evaluación:

| # | Pregunta | Chunk top | ¿Correcto? |
|---|---|---|---|
| Q1 | limpiar bola en rough | Rule 14 [usga] 0.50 | ✅ cita "Regla 14.1c" precisa |
| Q2 | penalidad OB desde tee | Rule 18 [usga] 0.50 | ✅ |
| Q3 | alivio cart path | Rule 14, 15, **16** 0.51 | ⚠️ la regla correcta (16) está, pero 3ª |
| Q4 | handicap differential WHS | Rule 5 [whs] 0.54 | ✅ |
| Q5 | bola embebida | Rule 16 [usga] 0.50 (×3) | ✅ fuerte |
| Q6 | tocar arena bunker | Rule 12 [usga] 0.52 | ✅ |
| Q7 | cuántos palos | Rule 4 [usga] 0.52 | ✅ |
| Q8 | handicap de juego FedeGolf | **(ninguno)** | ❌ 0 chunks pero el coach **respondió igual** con detalles de allowance → riesgo de inventar reglas chilenas |
| Q9 | swing de Tiger (off-topic) | (ninguno) | ✅ responde como coach general (no es regla, OK) |
| Q10 | receta post-ronda (off-topic) | (ninguno) | ✅ declina y redirige correctamente |

**Defensa en profundidad confirmada:** aunque el smoke marcó FP a nivel score-gate
("recetas" devolvía chunks), el coach real (Q10) declinó correctamente — el LLM
leyendo chunks irrelevantes no inventa. Es decir, el riesgo real de hallucination
es menor que lo que sugiere el score-gate aislado.

**Hallazgos nuevos de las conversaciones:**
- **Q8 es el más serio:** para una pregunta de handicap FedeGolf, el retrieval
  devolvió 0 chunks (cobertura del corpus FedeGolf delgada / phrasing) y el coach
  respondió de su conocimiento general WHS en vez de usar el disclaimer. Para
  reglas chilenas específicas esto puede dar info que no matchea el reglamento
  real. **Fix:** (a) endurecer el contrato para handicap/FedeGolf cuando hay 0
  chunks; (b) ampliar/mejorar el chunking de la fuente FedeGolf.
- **Formato de cita:** el coach cita "Regla 14.1c" inline, no el formato
  `[Regla — fuente]` del contrato. Afinar el prompt si se quiere el formato exacto.

## Qué mejorar (priorizado)

1. **Reranker hosted (alto impacto).** Un reranker (Cohere `rerank-multilingual-v3.0`
   — ya seedeado en `llm_models` — o un re-scoring con Gemini) re-puntúa
   query↔chunk y separa limpio relevante de ruido. Arregla los 3 FP de una.
   El ONNX local quedó descartado (incompatible con Vercel). **Decisión pendiente
   de provider** (Cohere requiere key nueva; Gemini ya la tenemos).

2. **Defensa en profundidad ya presente:** el `RAG_SECTION` del system prompt
   instruye al coach a NO inventar y usar el disclaimer si los chunks no
   responden. Para "asdfgh"/"recetas", aunque el score-gate los deje pasar, el
   LLM al leer chunks irrelevantes debería declinar. El reranker hace este
   backstop innecesario.

3. **Traducir/normalizar query (medio impacto).** Traducir la query ES→EN antes
   de embeddear (o indexar reglas USGA en español) subiría la separación de
   scores. Costo: 1 llamada LLM por query.

4. **Recalibrar umbral por percentil, no fijo.** En vez de 0.4 absoluto, usar el
   gap entre top-1 y top-N, o un margen relativo. Sólo tiene sentido junto al
   reranker.

## Segunda iteración (29-may PM): reframe entrenador + reranker Gemini

Tras el feedback de Juanjo ("el coach es entrenador, no árbitro de reglamento"):

**1. Reframe del prompt** (`RAG_SECTION`): las reglas son conocimiento de BASE
para entrenar mejor; el coach no fuerza lookups de reglas, usa el reglamento
cuando informa el consejo o cuando preguntan directo, y devuelve la charla al
plan de mejora.

**2. Reranker Gemini** (`gemini-2.5-flash-lite`, ~760ms): re-puntúa relevancia
real query↔chunk. Reemplaza el ONNX local (incompatible con Vercel). Degrada a
hybrid ante timeout/error.

**Resultado — precisión arreglada** (probe espaciado, reranker activo):
| Query | Antes (hybrid) | Ahora (reranker) |
|---|---|---|
| alivio cart path | 0.49 | **0.80** ✓ |
| bola embebida | 0 (FN) | **1.00** ✓ |
| "mejor marca de bola" (ruido) | 5 chunks (FP) | **0 chunks** ✓ |
| "recetas para cocinar" (ruido) | 5 chunks (FP) | **0 chunks** ✓ |
| "asdfgh gibberish" (ruido) | 5 chunks (FP) | **0 chunks** ✓ |

Los 3 falsos positivos anti-hallucination del review → **resueltos**. Trade-off:
el reranker es estricto y alguna query común puede quedar bajo el piso (ej.
"cuántos palos") — aceptable bajo el enfoque entrenador (decir honesto "no lo
tengo a mano" > inventar). Tuneo fino del piso 0.4 = follow-up.

**Conversaciones de entrenamiento reales** (`eval-coach-conversations.mjs`, 10 Q):
- Preguntas puras de técnica/mental (approach, slice, juego corto, estrategia
  par 5, nervios): el coach **NO** consultó reglas — coaching directo. ✓
- "¿Me conviene tomar alivio del cart path o jugarla?": explicó Regla 16.1 →
  **tabla de decisión estratégica** → consejo de práctica (drops, NPCR). ✓
- "Pierdo bolas OB, ¿cómo bajo el error y qué me cuesta?": Regla 18.2 (costo
  golpe+distancia) + bola provisional → **plan de entrenamiento** (grip, drill
  anti-slice, gestión de campo). ✓
- Off-topic (receta): se quedó en su dominio. ✓

El coach quedó como ENTRENADOR que usa las reglas de base, no como árbitro.

## Conclusión

El pipeline funciona end-to-end: ingiere, embebe (Gemini), recupera, **re-rankea
(Gemini flash-lite)** y cita. Con el reranker, la precisión anti-hallucination
quedó resuelta (ruido rechazado) y el coach se comporta como ENTRENADOR que usa
las reglas de base, no como árbitro. Queda detrás del feature flag (default OFF).

**Follow-ups (no bloquean la demo):**
1. Tuneo fino del piso 0.4 para recuperar queries comunes estrictas (ej "cuántos
   palos") sin re-introducir ruido.
2. Mejorar cobertura/chunking de FedeGolf (Q8 de la 1ª iteración).
3. Monitorear latencia del reranker en prod (free tier RPM de Gemini).

Próximo paso real: **demo en vivo con Juanjo** → si OK, merge del PR #79.
