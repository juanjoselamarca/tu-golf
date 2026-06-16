// src/golf/coach/v3/priors/normalize.ts
// Validación + normalización de filas de priors externos por capa (Ola 1b).
// Gate de "pasa el filtro de la app" (spec §4): forma + consistencia interna.
import { z } from 'zod';

export type PriorLayer = 'A' | 'B' | 'C';

const layerA = z.object({
  handicap_bucket: z.string().min(1),
  metric_key: z.string().min(1),
  percentile: z.number().int().min(0).max(100),
  value: z.number().finite(),
  sample_size: z.number().int().positive().nullish(),
});
const layerB = z.object({
  region: z.string().min(1),
  gender: z.string().min(1).default('all'),
  age_bucket: z.string().min(1).default('all'),
  handicap_bin: z.string().min(1),
  proportion: z.number().min(0).max(1),
  year: z.number().int().nullish(),
});
const layerC = z.object({
  course_external_id: z.string().min(1).optional(),
  course_name: z.string().nullish(),
  region: z.string().nullish(),
  par: z.number().int().nullish(),
  slope_rating: z.number().int().nullish(),
  course_rating: z.number().nullish(),
  metadata: z.record(z.unknown()).nullish(),
});

const SCHEMAS = { A: layerA, B: layerB, C: layerC } as const;

export type LayerBRow = z.infer<typeof layerB>;

export function normalizeRows(layer: PriorLayer, raw: unknown[]): Record<string, unknown>[] {
  const schema = SCHEMAS[layer];
  const rows = raw.map((r, i) => {
    const parsed = schema.safeParse(r);
    if (!parsed.success) {
      throw new Error(`Fila ${i} inválida en capa ${layer}: ${parsed.error.message}`);
    }
    return parsed.data as Record<string, unknown>;
  });
  if (layer === 'B') assertProportions(rows as LayerBRow[]);
  if (layer === 'C') {
    for (const r of rows) {
      if (!r.course_external_id) {
        r.course_external_id = `BAND:${(r.region as string) ?? 'GLOBAL'}:${(r.par as number) ?? 0}`;
      }
    }
  }
  return rows;
}

function assertProportions(rows: LayerBRow[]): void {
  const groups = new Map<string, number>();
  for (const r of rows) {
    const k = `${r.region}|${r.gender}|${r.age_bucket}|${r.year}`;
    groups.set(k, (groups.get(k) ?? 0) + r.proportion);
  }
  for (const [k, sum] of groups) {
    if (Math.abs(sum - 1) > 0.02) {
      throw new Error(`Suma de proporciones del corte ${k} = ${sum.toFixed(3)}, debe ser ~1.0`);
    }
  }
}
