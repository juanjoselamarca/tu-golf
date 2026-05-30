/**
 * weighted-scoring.ts — Aplica pesos por block_key sobre los rerank scores.
 * El cerebro paramétrico vivo (Ola 0) define pesos por bloque que se inyectan
 * acá para influir la prioridad del retrieval por dominio.
 *
 * Si el bloque no tiene peso definido, default = 1.0 (no afecta el score).
 *
 * NOTA (1e, I4): este helper NO está cableado en `searchKnowledgeChunks` todavía
 * — en 1e `final = rerankScore` (o hybrid si el reranker degradó). Se cableará
 * cuando existan pesos seed a nivel de fuente/bloque (sub-ola 1b+), para no
 * introducir un peso "decorativo" que multiplica por 1.0 sin efecto real.
 * Mantenido + testeado para esa integración. Ver docs/cerebro-v3-estado.md.
 */

export function applyBlockWeights<T extends { rerankScore: number; blockKey?: string }>(
  ranked: T[],
  weights: Record<string, number>
): Array<T & { finalScore: number }> {
  return ranked.map((r) => {
    const w =
      r.blockKey != null && Object.prototype.hasOwnProperty.call(weights, r.blockKey)
        ? weights[r.blockKey]
        : 1.0;
    return { ...r, finalScore: r.rerankScore * w };
  });
}
