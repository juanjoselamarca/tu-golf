// Sección server (async) del tab Identidad. Hace su propio fetch vía la capa de
// datos y arma los props de IdentidadTab (client). Vive dentro de un <Suspense>
// en page.tsx, así que streamea independiente del tab Competencia.
import { createClient } from '@/utils/supabase/server'
import { IdentidadTab } from './IdentidadTab'
import { loadIdentidadData } from '@/lib/data/dashboard'
import { getNivel } from '@/lib/mi-golf/niveles'
import { calcularStatsForma } from '@/lib/mi-golf/stats'
import { calcularTendencia } from '@/lib/mi-golf/tendencia'
import { getTaigerLine } from '@/lib/mi-golf/taiger-line'

export async function IdentidadSection({ userId, userName }: { userId: string; userName: string }) {
  const supabase = await createClient()
  const data = await loadIdentidadData(supabase, userId)

  const indiceGolfers = data.indiceGolfers
  const nivel = indiceGolfers != null ? getNivel(indiceGolfers) : null
  const stats = calcularStatsForma(data.historico)
  const tendencia = calcularTendencia(indiceGolfers, data.historico)
  const ultimasGross = data.historico
    .slice(0, 5)
    .map((r) => r.total_gross)
    .filter((g): g is number => g != null)
    .reverse()

  const taigerLine = getTaigerLine({
    tendencia,
    golpesHastaSiguienteNivel: nivel?.golpes_hasta_siguiente ?? null,
    nombreSiguienteNivel: nivel?.nombre_siguiente ?? null,
    taigerSessionCount: data.taigerSessionCount,
    totalRounds: data.totalRounds,
  })

  return (
    <IdentidadTab
      userName={userName}
      indiceGolfers={indiceGolfers}
      nivel={nivel}
      rondasConDiferencial={data.rondasConDiferencial}
      totalRounds={data.totalRounds}
      taigerSessionCount={data.taigerSessionCount}
      stats={stats}
      taigerLine={taigerLine}
      ultimasGross={ultimasGross}
    />
  )
}
