#!/usr/bin/env node
/**
 * smoke-rag.mjs — Banco anti-hallucination del retrieval RAG (sub-ola 1e, Task 20).
 *
 * Dos bloques:
 *   1. RULE_QUERIES: preguntas reales de reglas/handicap. Esperamos ≥2 chunks
 *      con final_score > 0.4 (el coach SÍ debe encontrar respuesta).
 *   2. NONSENSE_QUERIES: preguntas fuera del corpus (swing, marcas, recetas).
 *      Esperamos <2 chunks sobre 0.4 → dispara el disclaimer anti-hallucination
 *      del system prompt en vez de inventar reglas.
 *
 * Requiere corpus ingestado (Task 25) + .env.local con SUPABASE + OPENAI keys.
 *
 * Uso:
 *   node --import tsx --env-file=.env.local scripts/cerebro-v3/smoke-rag.mjs
 *
 * Importa el motor de retrieval TypeScript real (vía tsx), no una reimplementación.
 */
import { searchKnowledgeChunks } from '../../src/golf/coach/v3/retrieval/index.ts';

const SCORE_FLOOR = 0.4; // umbral del contrato anti-hallucination (spec §6).
const MIN_CHUNKS = 2;

const RULE_QUERIES = [
  'puedo limpiar mi bola en el rough',
  'cuál es la penalidad por fuera de límites',
  'puedo tomar alivio gratuito de un cart path',
  'cómo se calcula el handicap diferencial',
  'qué pasa si pierdo una bola en una zona de penalización de agua',
  'cuántos palos puedo llevar en la bolsa',
  'puedo reparar pique de bola en el green',
  'qué hago si mi bola está embebida en su propio pique',
  'penalidad por tocar la arena del bunker antes del golpe',
  'puedo pedir consejo a mi compañero de juego',
  'cómo se hace un drop correctamente',
  'qué es un golpe y distancia',
  'puedo mover una piedra suelta cerca de mi bola',
  'cuándo puedo marcar y levantar mi bola',
  'qué pasa si juego una bola equivocada',
  'cómo funciona el handicap de juego en un torneo',
  'puedo recibir alivio por agua temporal en el fairway',
  'qué hago si mi bola queda fuera de límites tras el tee',
  'cuál es el límite de tiempo para buscar una bola perdida',
  'reglas de etiqueta sobre el ritmo de juego',
];

const NONSENSE_QUERIES = [
  'cuál es el secreto del swing perfecto según Tiger Woods',
  'qué dijo Jack Nicklaus en el British Open de 1986',
  'cuál es la mejor marca de bola de golf',
  'asdfgh nonsense lkjhg qwerty',
  'recetas para cocinar después de jugar golf',
];

let pass = 0;
let fail = 0;

function top(result) {
  return result[0]?.scores?.final;
}

console.log('=== RAG smoke: reglas reales (espera ≥2 chunks sobre 0.4) ===');
for (const q of RULE_QUERIES) {
  let result = [];
  try {
    result = await searchKnowledgeChunks(q, { topK: 5 });
  } catch (e) {
    console.log(`✗ ${q}  (ERROR: ${e.message})`);
    fail++;
    continue;
  }
  const above = result.filter((r) => r.scores.final > SCORE_FLOOR);
  const ok = above.length >= MIN_CHUNKS;
  console.log(
    `${ok ? '✓' : '✗'} ${q}  (${result.length} chunks, ${above.length} sobre ${SCORE_FLOOR}, top=${top(result)?.toFixed(2) ?? '-'})`,
  );
  ok ? pass++ : fail++;
}

console.log('\n=== Anti-hallucination: sin sentido (espera <2 chunks sobre 0.4) ===');
for (const q of NONSENSE_QUERIES) {
  let result = [];
  try {
    result = await searchKnowledgeChunks(q, { topK: 5 });
  } catch (e) {
    console.log(`✗ ${q}  (ERROR: ${e.message})`);
    fail++;
    continue;
  }
  const above = result.filter((r) => r.scores.final > SCORE_FLOOR);
  const ok = above.length < MIN_CHUNKS;
  console.log(`${ok ? '✓' : '✗'} ${q}  (${above.length} chunks sobre ${SCORE_FLOOR})`);
  ok ? pass++ : fail++;
}

const total = pass + fail;
console.log(`\n${pass}/${total} passed  (${RULE_QUERIES.length} reglas + ${NONSENSE_QUERIES.length} anti-hallucination)`);
process.exit(fail > 0 ? 1 : 0);
