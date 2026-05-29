import { describe, it, expect } from 'vitest';
import { RAG_SECTION } from '../rag';

describe('RAG_SECTION', () => {
  it('referencia la tool search_knowledge_chunks', () => {
    expect(RAG_SECTION).toContain('search_knowledge_chunks');
  });

  it('incluye el contrato anti-hallucination con disclaimer exacto', () => {
    expect(RAG_SECTION).toContain('No encontré una regla específica');
    expect(RAG_SECTION).toContain('https://www.usga.org/rules.html');
  });

  it('cubre resolución de conflictos USGA vs FedeGolf Chile', () => {
    expect(RAG_SECTION).toContain('FedeGolf Chile');
    expect(RAG_SECTION).toMatch(/CONFLICT RESOLUTION/i);
  });

  it('prohíbe responder reglas sin llamar la tool primero', () => {
    expect(RAG_SECTION).toContain('NEVER answer rule questions without first calling the tool');
  });
});
