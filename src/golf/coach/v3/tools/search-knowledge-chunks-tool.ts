import type Anthropic from '@anthropic-ai/sdk';

/**
 * Tool definition (Anthropic) para que el coach v3 consulte el corpus RAG de
 * reglas oficiales (USGA / R&A / WHS / FedeGolf Chile).
 *
 * Solo se registra en el request a Anthropic cuando `cerebro_v3_enabled = true`
 * para el usuario (feature flag por perfil). El dispatch del `tool_use` vive en
 * `src/app/api/taiger/chat/route.ts` (handleToolUse), que delega en
 * `searchKnowledgeChunks` del motor de retrieval v3.
 *
 * Fuente única: docs/superpowers/specs/2026-05-28-cerebro-v3-ola-1e-design.md §6.
 */
export const SEARCH_KNOWLEDGE_TOOL: Anthropic.Tool = {
  name: 'search_knowledge_chunks',
  description:
    'Search the official golf rules and regulations corpus (USGA, R&A, WHS, FedeGolf Chile). ' +
    'Use this WHENEVER the user asks about a specific rule, handicap calculation, penalty, drop, ' +
    'relief, or any other official ruling. Returns relevant chunks with breadcrumb citations.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural language query in Spanish or English.',
      },
      jurisdictions: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['usga', 'ra', 'whs_global', 'usga_committee', 'fedegolf_chile'],
        },
        description:
          'Optional filter. Omit for all sources. Use ["fedegolf_chile"] for Chile-specific tournament rules.',
      },
    },
    required: ['query'],
  },
};
