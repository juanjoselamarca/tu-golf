# Cerebro V3 — Sub-olas 1c (estrategia) + 1d (psicología) — Plan

**Fecha:** 2026-07-07 · **Branch:** `feat/cerebro-1cd-claude` · **Base:** `origin/main` (3998341f)

## Objetivo
Cerrar el hueco "coach que sabe del mundo": hoy prod tiene **372 `knowledge_chunks`, todos `block_key='rules'`**. Cero estrategia, cero psicología. Poblar el RAG con conocimiento **cualitativo citado** de estrategia (strokes-gained / gestión de campo tipo DECADE) y psicología del rendimiento (Rotella / VISION54), para que el coach v3 cite principios de juego y mentales anclados al dato propio del jugador.

## Decisión de arquitectura (verificada, no asumida)
El estado decía "el RAG ya lee esas tablas → poblar y listo, sin código". **Verificado en el read-path: es inexacto.** Tres bloqueos reales:
- **A.** `search-knowledge-chunks-tool.ts` — la descripción de la tool es "official rules corpus" → el LLM no la invoca para estrategia/psicología.
- **B.** `retrieval/index.ts` línea 98 — `blockKey = opts.blockKey ?? 'rules'` → hard-filtra a reglas aunque existan chunks de otros bloques.
- **C.** `prompts/sections/rag.ts` — el prompt le dice al coach que la tool es solo reglas.

El RPC `search_chunks_hybrid` YA busca todos los bloques con `block_filter=NULL`. Entonces el cambio es **contenido + 3 ediciones quirúrgicas del read-path** (no motor de retrieval nuevo).

### Fuente de los datos — moat-safe y legalmente limpio
Broadie ("Every Shot Counts") y DECADE (Scott Fawcett) son libros **con copyright**. Regla de memoria `feedback_taiger_no_book_to_skill_v1`: **NO** book-to-skill; **SÍ** RAG citado con **contenido editorial propio** que cita el marco/concepto. Las ideas/principios de golf no son copiables (solo la expresión). Curamos principios **escritos con voz propia** que citan el marco (strokes-gained, gestión de campo, psicología del rendimiento). Sin PDFs de libros, sin transcripción de YouTube (fuera de alcance de "datos+ingestión").

### Qué NO se hace (deferral explícito, anti-decoración)
**No** se crea `external_priors_strategy_rules` (la parte cuantitativa de 1c). Razones: (a) la tarea define 1c como cualitativo, NO percentiles; (b) no hay fuente numérica verificada sin chocar la pared "percentiles no publicados"; (c) **ningún read-path la consumiría** → sería decoración (viola `feedback_anti_decoracion_wiring`). Se difiere hasta tener fuente numérica verificada + un reader consumidor (cambio de motor, ola posterior).

## Entregables
1. **Migración** `20260707_..._coaching_corpus.sql`: extiende el CHECK de `knowledge_sources.jurisdiction` con `'coaching'`. (knowledge_chunks es genérico, no cambia.) Idempotente. Aplicada + verificada en prod.
2. **Contenido curado** `data/coaching/strategy.json` + `psychology.json` (~24+24 principios, voz coach, ES chileno, citando marco).
3. **Ingest** `scripts/cerebro-v3/ingest-coaching.mjs`: reusa `embed-gemini.mjs` + `upsert-supabase.mjs` (mismo pipeline Gemini dim=1536 taskType, idempotente por chunk_hash). Corrido en prod, conteo verificado.
4. **Read-path (3 ediciones):** tool description (A), default blockKey→null (B), RAG_SECTION (C) + `Jurisdiction` type `'coaching'`.
5. **Canario** `coaching-corpus.canary.test.ts`: estático (las 3 piezas siguen cableadas) + DB-backed (chunks strategy/psychology existen y el read-path los devuelve).
6. **Demo** `scripts/cerebro-v3/demo-coaching-knowledge.ts`: retrieval real cita un principio de estrategia y uno de psicología (+ LLM best-effort).

## Validación
tsc 0 · `npm run test` verde (vmThreads) · examen-máquina del coach no regresa (baseline 0.86 / 4.17) · demo repetible. **PARAR antes de merge** (regla #4: demo en vivo a Juanjo).
