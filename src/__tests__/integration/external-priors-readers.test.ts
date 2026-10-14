// Database layer of the orphans-1b canary: when the external_priors_* tables have rows, the real readers must
// return data (the consumption works against seeded data, not just the wiring strings).
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { getBenchmarkMeanAtIndex, getPopulationPercentile } from '@/golf/coach/v3/priors/readers'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const hasDb = Boolean(url && serviceKey)

describe('external priors readers against seeded tables', () => {
  it.skipIf(!hasDb)(
    'seeded external_priors_* tables => readers return data',
    async () => {
      const sb = createClient(url!, serviceKey!)

      const { count } = await sb
        .from('external_priors_amateur_benchmarks')
        .select('*', { count: 'exact', head: true })

      // With no seed there is nothing to guard (the static canary covers the wiring). With rows, the verified mean
      // interpolated at index 12 must resolve for the three seeded metrics, which catches a partial seed.
      if ((count ?? 0) > 0) {
        for (const key of ['score_par3', 'score_par4', 'score_par5']) {
          const mean = await getBenchmarkMeanAtIndex(sb, key, 12)
          expect(mean, `layer A: ${key} has no interpolated mean (missing or orphaned seed)`).not.toBeNull()
        }
      }

      const { count: distCount } = await sb
        .from('external_priors_handicap_dist')
        .select('*', { count: 'exact', head: true })
      if ((distCount ?? 0) > 0) {
        const pct = await getPopulationPercentile(sb, 12)
        expect(pct, 'layer B is seeded but the population percentile came back null (orphaned)').not.toBeNull()
      }
    },
    30000,
  )
})
