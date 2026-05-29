export type Jurisdiction =
  | 'usga'
  | 'ra'
  | 'whs_global'
  | 'usga_committee'
  | 'fedegolf_chile';

export interface SearchKnowledgeOptions {
  jurisdictions?: Jurisdiction[];
  blockKey?: string;
  topK?: number;
  topCandidates?: number;
  alpha?: number;
  userId?: string;
}

export interface ChunkCandidate {
  id: string;
  sourceId: string;
  breadcrumb: string;
  content: string;
  vecScore: number;
  bm25Score: number;
  hybridScore: number;
  blockKey?: string;
}

export interface RerankedCandidate extends ChunkCandidate {
  rerankScore: number;
  rerankAvailable: boolean;
}

export interface RankedChunk {
  id: string;
  sourceId: string;
  sourceTitle: string;
  sourceJurisdiction: Jurisdiction;
  breadcrumb: string;
  ruleAnchor: string | null;
  content: string;
  scores: {
    vec: number;
    bm25: number;
    hybrid: number;
    rerank: number;
    final: number;
  };
}
