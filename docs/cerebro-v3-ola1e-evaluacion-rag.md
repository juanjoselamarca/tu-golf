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

## Conclusión

El pipeline funciona end-to-end: ingiere, embebe (Gemini), recupera y cita con
100% recall en preguntas reales. El bloque a cerrar antes de exponer a usuarios
es la **precisión anti-hallucination**, que requiere un **reranker hosted**
(decisión de provider pendiente). Hasta entonces, el coach v3 queda detrás del
feature flag (default OFF) — sin riesgo para usuarios.
