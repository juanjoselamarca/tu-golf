import { describe, it, expect } from 'vitest';
import { RAG_SECTION } from '../rag';

describe('RAG_SECTION', () => {
  it('referencia la tool search_knowledge_chunks', () => {
    expect(RAG_SECTION).toContain('search_knowledge_chunks');
  });

  it('enmarca al coach como ENTRENADOR, no árbitro (foco Juanjo 29-may)', () => {
    expect(RAG_SECTION).toMatch(/ENTRENADOR/);
    expect(RAG_SECTION).toMatch(/no un árbitro/i);
    expect(RAG_SECTION).toMatch(/MEJORAR su juego/i);
  });

  it('mantiene honestidad anti-invención + fallback a la app oficial', () => {
    expect(RAG_SECTION).toMatch(/nunca inventes/i);
    expect(RAG_SECTION).toContain('https://www.usga.org/rules.html');
  });

  it('cubre resolución de conflictos USGA vs FedeGolf Chile', () => {
    expect(RAG_SECTION).toContain('FedeGolf Chile');
    expect(RAG_SECTION).toMatch(/CONFLICTOS DE JURISDICCIÓN/i);
  });

  it('no enmarca al coach como buscador-de-reglas obligatorio', () => {
    // El foco corregido: NO debe forzar consultar la tool ante cualquier pregunta.
    expect(RAG_SECTION).not.toMatch(/NEVER answer rule questions/i);
  });
});
