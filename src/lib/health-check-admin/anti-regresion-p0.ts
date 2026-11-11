import type { SupabaseClient } from '@supabase/supabase-js'
import { type Category, safeCheck } from './tipos'

// ─── 6. Anti-regresión P0 ──────────────────────────────────────────────────
// Cada P0 cerrado debe dejar un check anti-regresión.
// Política de status: 0 → pass; >0 → warn (legacy histórico + posible regresión).
// No usar fail para no contaminar el conteo "failed" del summary con data legacy.

export async function checkAntiRegresionP0(admin: SupabaseClient): Promise<Category> {
  const checks = await Promise.all([
    // Bug 30-abr Juanjo: ronda finalizada con menos hoyos jugados que configurados.
    // Detecta historical_rounds donde la cantidad de scores NO-null en el JSON
    // es estrictamente menor que holes_played. Excluye casos legítimos:
    //   - array con todos null/0 (ronda manual con total_gross sin desglose)
    //   - array longer than holes_played con padding null al final
    safeCheck('Rondas finalizadas con hoyos faltantes', async () => {
      const { data } = await admin.rpc('exec_sql', {
        query: `SELECT COUNT(*) AS cnt
                FROM historical_rounds hr,
                LATERAL (
                  SELECT
                    CASE
                      WHEN jsonb_typeof(hr.scores) = 'object'
                        THEN (SELECT COUNT(*) FROM jsonb_object_keys(hr.scores))::INT
                      WHEN jsonb_typeof(hr.scores) = 'array'
                        THEN (
                          SELECT COUNT(*)::INT
                          FROM jsonb_array_elements(hr.scores) AS e
                          WHERE e IS NOT NULL
                            AND jsonb_typeof(e) != 'null'
                            AND NOT (jsonb_typeof(e) = 'number' AND e::TEXT = '0')
                        )
                      ELSE 0
                    END AS non_null_count
                ) c
                WHERE hr.scores IS NOT NULL
                  AND c.non_null_count > 0
                  AND c.non_null_count < hr.holes_played`,
      })
      const count = Number(data?.[0]?.cnt ?? 0)
      return {
        name: 'Rondas finalizadas con hoyos faltantes',
        status: count === 0 ? 'pass' : 'warn',
        message: count === 0
          ? 'Sin anomalías'
          : `${count} historical_rounds con scores < holes_played (regresión bug 30-abr)`,
        details: { count, ref: 'Bug ronda 30-abr Juanjo — 8/9 hoyos finalizada' },
      }
    }),

    // Bug filtro índice 9h: usuarios con rondas elegibles en top-20 (por fecha)
    // que tienen datos completos (course_rating + slope_rating) pero diferencial NULL.
    // El RPC calcular_indice_golfers las excluye por WHERE diferencial IS NOT NULL,
    // pero el diferencial debió haberse calculado al importar.
    safeCheck('Índice golfers excluye rondas legítimas', async () => {
      const { data } = await admin.rpc('exec_sql', {
        query: `SELECT COUNT(*) AS cnt
                FROM (
                  SELECT id
                  FROM (
                    SELECT id,
                      ROW_NUMBER() OVER (
                        PARTITION BY user_id
                        ORDER BY played_at DESC, created_at DESC
                      ) AS rn,
                      diferencial, slope_rating, course_rating
                    FROM historical_rounds
                  ) ranked
                  WHERE rn <= 20
                    AND slope_rating IS NOT NULL
                    AND course_rating IS NOT NULL
                    AND diferencial IS NULL
                ) eligible_no_diff`,
      })
      const count = Number(data?.[0]?.cnt ?? 0)
      return {
        name: 'Índice golfers excluye rondas legítimas',
        status: count === 0 ? 'pass' : 'warn',
        message: count === 0
          ? 'Todas las rondas elegibles tienen diferencial'
          : `${count} rondas top-20 con datos completos pero diferencial NULL`,
        details: { count, ref: 'Bug filtro índice 9h pre-migration 037' },
      }
    }),

    // Anomalía estructural: ronda libre marcada finalizada pero algún jugador
    // tiene scoring JSON con menos hoyos completos que ronda.holes.
    safeCheck('Scoring state consistency (rondas finalizadas)', async () => {
      const { data } = await admin.rpc('exec_sql', {
        query: `SELECT COUNT(*) AS cnt FROM (
                  SELECT DISTINCT r.id
                  FROM rondas_libres r
                  JOIN ronda_libre_jugadores j ON j.ronda_id = r.id
                  WHERE r.estado = 'finalizada'
                    AND r.holes IS NOT NULL
                    AND j.scores IS NOT NULL
                    AND jsonb_typeof(j.scores) = 'object'
                    AND (SELECT COUNT(*) FROM jsonb_object_keys(j.scores)) < r.holes
                ) inconsistent`,
      })
      const count = Number(data?.[0]?.cnt ?? 0)
      return {
        name: 'Scoring state consistency (rondas finalizadas)',
        status: count === 0 ? 'pass' : 'warn',
        message: count === 0
          ? 'Estado finalizada consistente con scoring JSON'
          : `${count} rondas_libres finalizadas con scores < holes configurados`,
        details: { count, ref: 'Detecta bugs en flujo de finalize ronda' },
      }
    }),
  ])

  return { name: 'Anti-regresión P0', checks }
}

