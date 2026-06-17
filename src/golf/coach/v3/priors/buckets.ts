// src/golf/coach/v3/priors/buckets.ts
// Único lugar de verdad de los cortes de hándicap (capa A + B). Si cambian acá,
// el seed de external_priors_amateur_benchmarks debe usar los mismos labels.
export type HandicapBucket =
  | 'scratch' | '1-4' | '5-9' | '10-14' | '15-19' | '20-28' | '29+';

export function handicapToBucket(index: number): HandicapBucket {
  if (index <= 0) return 'scratch';
  if (index < 5) return '1-4';
  if (index < 10) return '5-9';
  if (index < 15) return '10-14';
  if (index < 20) return '15-19';
  if (index <= 28) return '20-28';
  return '29+';
}
