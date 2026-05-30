#!/usr/bin/env node
/**
 * eval-coach-conversations.mjs — Corre N conversaciones reales contra el coach
 * v3 (Anthropic + tool search_knowledge_chunks + corpus real) y muestra
 * pregunta + respuesta + chunks citados, para evaluar calidad cualitativa.
 *
 * Replica el loop del route /api/taiger/chat (system con RAG_SECTION + tool +
 * handleToolUse) sin el SSE streaming. Usa el corpus YA ingestado.
 *
 * Uso:
 *   node_modules/.bin/tsx --env-file=.env.local scripts/cerebro-v3/eval-coach-conversations.mjs
 */
import Anthropic from '@anthropic-ai/sdk';
import toolMod from '../../src/golf/coach/v3/tools/search-knowledge-chunks-tool.ts';
import handleMod from '../../src/golf/coach/v3/tools/handle-tool-use.ts';
import ragMod from '../../src/golf/coach/v3/prompts/sections/rag.ts';

const { SEARCH_KNOWLEDGE_TOOL } = toolMod;
const { handleToolUse } = handleMod;
const { RAG_SECTION } = ragMod;

const SYSTEM = `Sos tAIger+, el coach de golf de Golfers+. Respondé en español, claro y directo.\n\n${RAG_SECTION}`;

// FOCO (Juanjo 29-may): el coach es ENTRENADOR. Preguntas de mejora reales —
// algunas donde una regla informa el consejo (rules-as-foundation), otras puras
// de coaching, + 1 off-topic para confirmar que se queda en su dominio.
const QUESTIONS = [
  'Quiero bajar mi handicap de 18 a 12, ¿por dónde empiezo?',
  'Estoy perdiendo muchos tiros en el approach, ¿qué trabajo?',
  'Mi drive sale siempre a la derecha (slice), ¿cómo lo corrijo?',
  'Quiero mejorar mi juego corto alrededor del green, ¿cómo practico?',
  'Mi bola queda seguido en el camino de carros, ¿me conviene tomar alivio o jugarla como está?', // regla informa el consejo
  '¿Qué estrategia me conviene en un par 5 largo que no llego en dos?',
  'Pierdo bolas fuera de límites en el tee, ¿cómo bajo ese error y qué me cuesta en el score?', // regla (OB) + coaching
  '¿Cómo manejo los nervios cuando juego un torneo importante?',
  'En torneos FedeGolf Chile, ¿cómo me conviene usar mi handicap para competir mejor?', // regla chilena + coaching
  '¿Me recomendás una receta para después de la ronda?', // off-topic → debe quedarse en su dominio
];

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function ask(question) {
  const messages = [{ role: 'user', content: question }];
  let citedChunks = [];
  for (let iter = 0; iter < 3; iter++) {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM,
      tools: [SEARCH_KNOWLEDGE_TOOL],
      messages,
    });
    if (res.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: res.content });
      const results = [];
      for (const block of res.content) {
        if (block.type === 'tool_use') {
          const tr = await handleToolUse(
            { tool_use_id: block.id, name: block.name, input: block.input },
            {}, // sin userId (el rag_query_log espera uuid o null)
          );
          const payload = JSON.parse(tr.content);
          citedChunks = (payload.chunks ?? []).map(
            (c) => `${c.breadcrumb} [${c.sourceJurisdiction}] (${c.scores?.final?.toFixed(2)})`,
          );
          results.push(tr);
        }
      }
      messages.push({ role: 'user', content: results });
      continue;
    }
    const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    return { text, citedChunks };
  }
  return { text: '(sin respuesta tras 3 iteraciones)', citedChunks };
}

for (let i = 0; i < QUESTIONS.length; i++) {
  const q = QUESTIONS[i];
  console.log(`\n${'═'.repeat(70)}\nQ${i + 1}: ${q}`);
  try {
    const { text, citedChunks } = await ask(q);
    console.log(`\nCHUNKS: ${citedChunks.length ? citedChunks.join(' | ') : '(ninguno → disclaimer esperado)'}`);
    console.log(`\nCOACH:\n${text}`);
  } catch (e) {
    console.log(`ERROR: ${e.message}`);
  }
}
console.log(`\n${'═'.repeat(70)}\nFin — ${QUESTIONS.length} conversaciones.`);
